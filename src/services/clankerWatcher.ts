import type { ClankerToken } from "./clanker";
import { fetchTokensByFid } from "./clanker";
import { shouldBroadcastDeployment } from "./clankerMonitor";
import { broadcastClankerDeployment } from "./clankerBroadcast";
import { logger } from "../utils/logger";

// Database functions - import from backend
async function hasBroadcastedClankerToken(contractAddress: string): Promise<boolean> {
  try {
    const { env } = await import("../config");
    if (!env.backendUrl) {
      logger.warn("[Clanker Watcher] Backend URL not configured, cannot check database");
      return false;
    }
    
    const response = await fetch(`${env.backendUrl}/api/clanker/has-broadcasted?contract=${encodeURIComponent(contractAddress)}`);
    if (!response.ok) {
      logger.warn(`[Clanker Watcher] Failed to check broadcast status: ${response.status}`);
      return false;
    }
    
    const data = await response.json();
    return data.broadcasted === true;
  } catch (error) {
    logger.error("[Clanker Watcher] Error checking broadcast status:", error);
    return false;
  }
}

async function markClankerTokenAsBroadcasted(
  contractAddress: string,
  deployerFid: number,
  deployerScore: number,
): Promise<void> {
  try {
    const { env } = await import("../config");
    if (!env.backendUrl) {
      logger.warn("[Clanker Watcher] Backend URL not configured, cannot mark as broadcasted");
      return;
    }
    
    await fetch(`${env.backendUrl}/api/clanker/mark-broadcasted`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractAddress,
        deployerFid,
        deployerScore,
      }),
    });
  } catch (error) {
    logger.error("[Clanker Watcher] Error marking as broadcasted:", error);
  }
}

/**
 * Monitor Clanker deployments for high-score users
 * This service polls for new deployments and broadcasts them
 */
export class ClankerWatcher {
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
  private readonly RECENT_DEPLOYMENT_WINDOW_MS = 10 * 60 * 1000; // Consider deployments from last 10 minutes

  /**
   * Start monitoring Clanker deployments
   */
  start(): void {
    if (this.isRunning) {
      logger.warn("[Clanker Watcher] Already running");
      return;
    }

    this.isRunning = true;
    logger.info("[Clanker Watcher] Starting Clanker deployment monitoring...");

    // Run initial check
    this.checkForNewDeployments().catch((error) => {
      logger.error("[Clanker Watcher] Initial check failed:", error);
    });

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.checkForNewDeployments().catch((error) => {
        logger.error("[Clanker Watcher] Periodic check failed:", error);
      });
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info("[Clanker Watcher] Stopped monitoring");
  }

  /**
   * Check for new Clanker deployments
   * Polls Clanker API for recent deployments and checks deployer scores
   */
  private async checkForNewDeployments(): Promise<void> {
    logger.system("Clanker Watcher: Starting deployment check");

    try {
      // Poll Clanker API for recent tokens
      const recentTokens = await this.fetchRecentClankerTokens();
      
      logger.system("Clanker Watcher: Found recent tokens", {
        count: recentTokens.length,
      });

      for (const token of recentTokens) {
        if (!token.contract_address) {
          continue;
        }

        // Filter: Only process ClankerWorld UI or Farcaster deployments (exclude bankr)
        if (!this.isValidClankerSource(token)) {
          logger.system("Clanker Watcher: Skipping token (invalid source)", {
            contractAddress: token.contract_address,
            platform: token.social_context?.platform || token.metadata?.platform || "unknown",
            interface: token.social_context?.interface || token.metadata?.interface || "unknown",
          });
          continue;
        }

        // Check if already broadcasted
        const alreadyBroadcasted = await hasBroadcastedClankerToken(token.contract_address);
        if (alreadyBroadcasted) {
          logger.debug(`[Clanker Watcher] Token ${token.contract_address} already broadcasted`);
          continue;
        }

        // Check if should broadcast
        const { shouldBroadcast, deployerFid, deployerScore, deployerUsername } =
          await shouldBroadcastDeployment(token);

        if (shouldBroadcast && deployerFid && deployerScore) {
          logger.system("Clanker Watcher: Broadcasting high-score deployment", {
            tokenName: token.name || token.symbol,
            contractAddress: token.contract_address,
            deployerFid,
            deployerScore,
            deployerUsername,
          });

          // Broadcast to all servers
          const result = await broadcastClankerDeployment(
            token,
            deployerFid,
            deployerScore,
            deployerUsername
          );

          if (result.success > 0) {
            // Mark as broadcasted
            await markClankerTokenAsBroadcasted(
              token.contract_address,
              deployerFid,
              deployerScore
            );
            logger.system("Clanker Watcher: Broadcast successful", {
              contractAddress: token.contract_address,
              channelsBroadcasted: result.success,
              channelsFailed: result.failed,
            });
          } else {
            logger.warn("Clanker Watcher: Broadcast failed", {
              contractAddress: token.contract_address,
              deployerFid,
              result,
            });
          }
        } else {
          logger.system("Clanker Watcher: Token does not meet broadcast criteria", {
            contractAddress: token.contract_address,
            deployerScore: deployerScore || null,
            deployerFid: deployerFid || null,
          });
        }
      }

      logger.system("Clanker Watcher: Deployment check complete");
    } catch (error) {
      logger.error("Clanker Watcher: Error during deployment check", error);
    }
  }

  /**
   * Fetch recent Clanker tokens from the API
   * Gets tokens deployed within the last deployment window
   */
  private async fetchRecentClankerTokens(): Promise<ClankerToken[]> {
    try {
      const CLANKER_API_BASE = "https://www.clanker.world/api";
      const url = new URL(`${CLANKER_API_BASE}/tokens`);
      
      // Get tokens from the last 10 minutes
      // Clanker API might support sorting by created_at, but we'll fetch recent ones
      url.searchParams.set("limit", "50"); // Get last 50 tokens
      url.searchParams.set("includeUser", "true");
      url.searchParams.set("includeMarket", "true");
      
      const response = await fetch(url);
      if (!response.ok) {
        logger.warn(`[Clanker Watcher] Clanker API request failed: ${response.status}`);
        return [];
      }
      
      const json = (await response.json()) as { data?: ClankerToken[] };
      const tokens = json.data ?? [];
      
      // Filter to tokens deployed within the last deployment window
      const now = Date.now();
      const recentTokens = tokens.filter((token) => {
        const deployedAt = token.deployed_at || token.created_at;
        if (!deployedAt) return false;
        const deployedTime = new Date(deployedAt).getTime();
        return now - deployedTime < this.RECENT_DEPLOYMENT_WINDOW_MS;
      });
      
      logger.info(`[Clanker Watcher] Found ${recentTokens.length} tokens deployed in last ${this.RECENT_DEPLOYMENT_WINDOW_MS / 1000 / 60} minutes`);
      
      return recentTokens;
    } catch (error) {
      logger.error("[Clanker Watcher] Error fetching recent tokens:", error);
      return [];
    }
  }

  /**
   * Check deployments for a specific user
   */
  private async checkUserDeployments(fid: number): Promise<void> {
    try {
      const tokens = await fetchTokensByFid(fid);

      // Filter to recent deployments (within last 10 minutes)
      const now = Date.now();
      const recentTokens = tokens.filter((token) => {
        const deployedAt = token.deployed_at || token.created_at;
        if (!deployedAt) return false;
        const deployedTime = new Date(deployedAt).getTime();
        return now - deployedTime < this.RECENT_DEPLOYMENT_WINDOW_MS;
      });

      for (const token of recentTokens) {
        if (!token.contract_address) continue;

        // Check if already broadcasted
        const alreadyBroadcasted = await hasBroadcastedClankerToken(token.contract_address);
        if (alreadyBroadcasted) {
          logger.debug(`[Clanker Watcher] Token ${token.contract_address} already broadcasted`);
          continue;
        }

        // Check if should broadcast
        const { shouldBroadcast, deployerFid, deployerScore, deployerUsername } =
          await shouldBroadcastDeployment(token);

        if (shouldBroadcast && deployerFid && deployerScore) {
          logger.info(
            `[Clanker Watcher] Broadcasting deployment: ${token.contract_address} by FID ${deployerFid} (score: ${deployerScore})`
          );

          // Broadcast to all servers
          const result = await broadcastClankerDeployment(
            token,
            deployerFid,
            deployerScore,
            deployerUsername
          );

          if (result.success > 0) {
            // Mark as broadcasted
            await markClankerTokenAsBroadcasted(
              token.contract_address,
              deployerFid,
              deployerScore
            );
            logger.info(
              `[Clanker Watcher] ✅ Broadcasted to ${result.success} channels`
            );
          } else {
            logger.warn(
              `[Clanker Watcher] ⚠️ Failed to broadcast to any channels`
            );
          }
        }
      }
    } catch (error) {
      logger.error(`[Clanker Watcher] Error checking deployments for FID ${fid}:`, error);
    }
  }

  /**
   * Check if a token is from a valid source (ClankerWorld UI or Farcaster, not bankr)
   */
  private isValidClankerSource(token: ClankerToken): boolean {
    // Get platform from social_context or metadata
    const platform = (token.social_context?.platform || token.metadata?.platform || "").toLowerCase();
    const interfaceName = (token.social_context?.interface || token.metadata?.interface || "").toLowerCase();
    
    // Exclude bankr deployments
    if (platform.includes("bankr") || interfaceName.includes("bankr")) {
      return false;
    }
    
    // Only allow ClankerWorld UI or Farcaster deployments
    // Check if platform is "farcaster" or "clankerworld" or similar valid sources
    const validPlatforms = ["farcaster", "clankerworld", "clanker", "warpcast"];
    const isValidPlatform = validPlatforms.some(valid => 
      platform.includes(valid) || interfaceName.includes(valid)
    );
    
    // If no platform specified, assume it's from ClankerWorld (default)
    // Only exclude if explicitly bankr
    if (!platform && !interfaceName) {
      return true; // Default to allowing if no platform info
    }
    
    return isValidPlatform;
  }

  /**
   * Manually check a specific token for broadcasting
   * Useful for testing or manual triggers
   */
  async checkToken(token: ClankerToken): Promise<boolean> {
    if (!token.contract_address) {
      logger.warn("[Clanker Watcher] Token has no contract address");
      return false;
    }

    // Filter: Only process ClankerWorld UI or Farcaster deployments (exclude bankr)
    if (!this.isValidClankerSource(token)) {
      logger.info(`[Clanker Watcher] Token ${token.contract_address} is not from a valid source (bankr excluded)`);
      return false;
    }

    // Check if already broadcasted
    const alreadyBroadcasted = await hasBroadcastedClankerToken(token.contract_address);
    if (alreadyBroadcasted) {
      logger.info(`[Clanker Watcher] Token ${token.contract_address} already broadcasted`);
      return false;
    }

    // Check if should broadcast
    const { shouldBroadcast, deployerFid, deployerScore, deployerUsername } =
      await shouldBroadcastDeployment(token);

    if (!shouldBroadcast || !deployerFid || !deployerScore) {
      logger.info(
        `[Clanker Watcher] Token ${token.contract_address} does not meet broadcast criteria`
      );
      return false;
    }

    // Broadcast
    const result = await broadcastClankerDeployment(
      token,
      deployerFid,
      deployerScore,
      deployerUsername
    );

    if (result.success > 0) {
      await markClankerTokenAsBroadcasted(
        token.contract_address,
        deployerFid,
        deployerScore
      );
      return true;
    }

    return false;
  }
}

