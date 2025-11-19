import type { ClankerToken } from "./clanker";
import { fetchTokensByFid } from "./clanker";
import { findUserByWallet } from "./neynar";
import { logger } from "../utils/logger";

export interface ClankerDeployment {
  token: ClankerToken;
  deployerFid: number;
  deployerUsername?: string;
  deployerScore?: number;
}

/**
 * Get Neynar reputation score for a user
 * Note: This uses follower count as a proxy for reputation score
 * If Neynar has a specific reputation API, update this function
 */
export async function getNeynarReputationScore(fid: number): Promise<number | null> {
  try {
    // Try to get user info from Neynar
    // For now, we'll use follower count as a proxy
    // TODO: Replace with actual Neynar reputation API if available
    const { Configuration, NeynarAPIClient } = await import("@neynar/nodejs-sdk");
    const { env, requireEnv } = await import("../config");
    
    const configuration = new Configuration({
      apiKey: requireEnv(env.neynarApiKey, "NEYNAR_API_KEY"),
    });
    const client = new NeynarAPIClient(configuration);
    
    const response = await client.lookupUserByFid({ fid });
    const user = response.user;
    
    // Use follower count as reputation proxy
    // Scale: 0-100 based on follower count
    // 1000 followers = ~10 score, 10000 = ~50, 100000 = ~90+
    const followerCount = user.follower_count ?? 0;
    const score = Math.min(100, Math.floor(Math.log10(followerCount + 1) * 20));
    
    logger.info(`[Clanker Monitor] FID ${fid} has ${followerCount} followers, score: ${score}`);
    return score;
  } catch (error) {
    logger.error(`[Clanker Monitor] Failed to get reputation score for FID ${fid}:`, error);
    return null;
  }
}

/**
 * Check if a user has a high enough reputation score (> 90)
 */
export async function hasHighReputationScore(fid: number): Promise<boolean> {
  const score = await getNeynarReputationScore(fid);
  return score !== null && score > 90;
}

/**
 * Get recent Clanker deployments for a specific FID
 */
export async function getRecentClankerDeployments(fid: number): Promise<ClankerToken[]> {
  try {
    const tokens = await fetchTokensByFid(fid);
    // Sort by created_at descending (most recent first)
    return tokens.sort((a, b) => {
      const dateA = new Date(a.created_at || a.deployed_at || 0).getTime();
      const dateB = new Date(b.created_at || b.deployed_at || 0).getTime();
      return dateB - dateA;
    });
  } catch (error) {
    logger.error(`[Clanker Monitor] Failed to get deployments for FID ${fid}:`, error);
    return [];
  }
}

/**
 * Get deployer FID from a Clanker token
 */
export function getDeployerFidFromToken(token: ClankerToken): number | null {
  // Check if token has related user info
  if (token.related?.user?.fid) {
    return token.related.user.fid;
  }
  
  // Try to get FID from msg_sender by looking up user
  // This is a fallback - we'll need to look up the wallet address
  return null;
}

/**
 * Resolve deployer FID from token's msg_sender (wallet address)
 */
export async function resolveDeployerFid(token: ClankerToken): Promise<number | null> {
  // First check if token has user info
  if (token.related?.user?.fid) {
    return token.related.user.fid;
  }
  
  // Fallback: Look up user by wallet address (msg_sender)
  if (token.msg_sender) {
    try {
      const user = await findUserByWallet(token.msg_sender);
      return user?.fid ?? null;
    } catch (error) {
      logger.warn(`[Clanker Monitor] Failed to resolve deployer from wallet ${token.msg_sender}:`, error);
    }
  }
  
  return null;
}

/**
 * Check if a Clanker deployment should be broadcasted
 * Criteria: Deployer has Neynar score > 90
 */
export async function shouldBroadcastDeployment(token: ClankerToken): Promise<{
  shouldBroadcast: boolean;
  deployerFid: number | null;
  deployerScore: number | null;
  deployerUsername?: string;
}> {
  const deployerFid = await resolveDeployerFid(token);
  
  if (!deployerFid) {
    return {
      shouldBroadcast: false,
      deployerFid: null,
      deployerScore: null,
    };
  }
  
  const score = await getNeynarReputationScore(deployerFid);
  
  if (!score || score <= 90) {
    return {
      shouldBroadcast: false,
      deployerFid,
      deployerScore: score,
    };
  }
  
  // Get username if available
  let deployerUsername: string | undefined;
  try {
    const { Configuration, NeynarAPIClient } = await import("@neynar/nodejs-sdk");
    const { env, requireEnv } = await import("../config");
    
    const configuration = new Configuration({
      apiKey: requireEnv(env.neynarApiKey, "NEYNAR_API_KEY"),
    });
    const client = new NeynarAPIClient(configuration);
    
    const response = await client.lookupUserByFid({ fid: deployerFid });
    deployerUsername = response.user.username;
  } catch (error) {
    logger.warn(`[Clanker Monitor] Failed to get username for FID ${deployerFid}:`, error);
  }
  
  return {
    shouldBroadcast: true,
    deployerFid,
    deployerScore: score,
    deployerUsername,
  };
}

