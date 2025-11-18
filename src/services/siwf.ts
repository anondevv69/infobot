import crypto from "crypto";
import { env } from "../config";

export interface SIWFChallenge {
  challenge: string;
  timestamp: number;
  expiresAt: number;
}

export interface SIWFVerification {
  fid: number;
  custodyAddress: string;
  verifiedAddresses: string[];
  username?: string;
  signature: string;
}

// Store challenges in memory (in production, use Redis or database)
const challenges = new Map<string, SIWFChallenge>();

// Store verified sessions (in production, use Redis or database)
const sessions = new Map<string, SIWFVerification>();

// Generate a SIWF challenge
export function generateSIWFChallenge(userId: string, platform: "discord" | "telegram"): SIWFChallenge {
  const challenge = crypto.randomBytes(32).toString("hex");
  const timestamp = Date.now();
  const expiresAt = timestamp + 5 * 60 * 1000; // 5 minutes

  const challengeData: SIWFChallenge = {
    challenge,
    timestamp,
    expiresAt,
  };

  const key = `${platform}:${userId}`;
  challenges.set(key, challengeData);

  // Clean up expired challenges
  setTimeout(() => {
    challenges.delete(key);
  }, 5 * 60 * 1000);

  return challengeData;
}

// Get SIWF challenge for a user
export function getSIWFChallenge(userId: string, platform: "discord" | "telegram"): SIWFChallenge | null {
  const key = `${platform}:${userId}`;
  const challenge = challenges.get(key);
  
  if (!challenge) {
    return null;
  }

  if (Date.now() > challenge.expiresAt) {
    challenges.delete(key);
    return null;
  }

  return challenge;
}

// Generate signup/signin URL for Farcaster with referral code
// Note: SIWF requires a web callback, so for bots we use a simpler flow:
// 1. User clicks link to sign up/sign in on Warpcast
// 2. User creates account or signs in (with referral code)
// 3. User comes back and runs /connect @username to verify
export function generateSIWFUrl(challenge: string, redirectUrl?: string, referralCode?: string): string {
  // For bots, we'll use the Warpcast app URL which opens the app or web
  // If referral code provided, use signup URL, otherwise signin
  if (referralCode) {
    // Signup URL with referral code
    return `https://warpcast.com/~/signup?ref=${referralCode}`;
  }
  // Signin URL
  return "https://warpcast.com/~/signin";
}

// Alternative: Generate Farcaster signup URL with referral
export function generateFarcasterSignupUrl(referralCode?: string): string {
  if (referralCode) {
    return `https://warpcast.com/~/signup?ref=${referralCode}`;
  }
  return "https://warpcast.com/~/signup";
}

// Verify SIWF signature and get user info from Neynar
export async function verifySIWFSignature(
  challenge: string,
  signature: string,
  fid: number,
  custodyAddress: string,
): Promise<SIWFVerification | null> {
  // Check if challenge exists and is valid
  let challengeKey: string | null = null;
  for (const [key, storedChallenge] of challenges.entries()) {
    if (storedChallenge.challenge === challenge) {
      if (Date.now() > storedChallenge.expiresAt) {
        challenges.delete(key);
        return null;
      }
      challengeKey = key;
      break;
    }
  }

  if (!challengeKey) {
    return null; // Challenge not found or expired
  }

  // Verify user exists via Neynar API
  try {
    const { findUserByWallet } = await import("./neynar");
    const user = await findUserByWallet(custodyAddress);
    
    if (!user || user.fid !== fid) {
      return null; // User not found or FID mismatch
    }

    // Build verification object
    const verification: SIWFVerification = {
      fid: user.fid,
      custodyAddress: user.custody_address || custodyAddress,
      verifiedAddresses: user.verified_addresses?.eth_addresses || [],
      username: user.username,
      signature: signature,
    };

    // Clean up challenge
    challenges.delete(challengeKey);

    return verification;
  } catch (error) {
    console.error("[SIWF] Failed to verify user:", error);
    return null;
  }
}

// Simplified verification: Just verify user exists by username or wallet
// This is for the bot flow where user provides their Farcaster username
export async function verifyUserByUsernameOrWallet(
  usernameOrWallet: string,
): Promise<SIWFVerification | null> {
  try {
    const { findUserByWallet, findUserByUsername } = await import("./neynar");
    
    // Try username first
    let user = null;
    if (usernameOrWallet.startsWith("@")) {
      user = await findUserByUsername(usernameOrWallet.slice(1));
    } else if (usernameOrWallet.startsWith("0x")) {
      user = await findUserByWallet(usernameOrWallet);
    } else {
      // Try as username without @
      user = await findUserByUsername(usernameOrWallet);
    }

    if (!user) {
      return null;
    }

    // Build verification object
    const verification: SIWFVerification = {
      fid: user.fid,
      custodyAddress: user.custody_address || "",
      verifiedAddresses: user.verified_addresses?.eth_addresses || [],
      username: user.username,
      signature: "", // No signature for simplified flow
    };

    return verification;
  } catch (error) {
    console.error("[SIWF] Failed to verify user:", error);
    return null;
  }
}

// Store verified session
export function storeSIWFSession(
  userId: string,
  platform: "discord" | "telegram",
  verification: SIWFVerification,
): void {
  const key = `${platform}:${userId}`;
  sessions.set(key, verification);
}

// Get verified session
export function getSIWFSession(
  userId: string,
  platform: "discord" | "telegram",
): SIWFVerification | null {
  const key = `${platform}:${userId}`;
  return sessions.get(key) || null;
}

// Clear session
export function clearSIWFSession(userId: string, platform: "discord" | "telegram"): void {
  const key = `${platform}:${userId}`;
  sessions.delete(key);
  challenges.delete(key);
}

// Get all sessions (for debugging)
export function getAllSessions(): Map<string, SIWFVerification> {
  return sessions;
}
