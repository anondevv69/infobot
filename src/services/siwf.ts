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
  // For trading - we need the signer to perform transactions
  signerPrivateKey?: string; // Delegated signer private key (if provided by Farcaster)
  signerPublicKey?: string; // Delegated signer public key
  signerFid?: number; // Signer FID (if different from user FID)
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

// Generate SIWF URL for Warpcast with callback
// This implements the proper SIWF flow:
// 1. User clicks link to Warpcast with challenge and callback URL
// 2. User signs in/up in Warpcast (with referral code for new users)
// 3. Warpcast redirects to callback URL with signed message
// 4. Backend verifies and links accounts
export function generateSIWFUrl(
  challenge: string,
  userId: string,
  platform: "discord" | "telegram",
  backendUrl: string,
  referralCode?: string,
): string {
  // Encode user info in the challenge for the callback to identify the user
  // The challenge already contains this, but we'll also pass it in the callback URL
  const callbackUrl = `${backendUrl}/api/siwf/callback?challenge=${challenge}&userId=${userId}&platform=${platform}`;
  
  // Use farcaster.xyz as the canonical SIWF endpoint
  const baseUrl = "https://farcaster.xyz/~/signin";
  
  const params = new URLSearchParams({
    challenge,
    redirect_uri: callbackUrl,
  });

  // Add referral code for new signups
  if (referralCode) {
    params.append("ref", referralCode);
  }

  const generatedUrl = `${baseUrl}?${params.toString()}`;
  
  // Log the generated URL for debugging (only first time to avoid spam)
  if (!(global as any).__siwf_url_logged) {
    console.log("[SIWF] ✅ Generated URL base:", baseUrl);
    console.log("[SIWF] ✅ Full generated URL (first call):", generatedUrl.substring(0, 100) + "...");
    (global as any).__siwf_url_logged = true;
  }
  
  return generatedUrl;
}

// Alternative: Generate Farcaster signup URL with referral
export function generateFarcasterSignupUrl(referralCode?: string): string {
  if (referralCode) {
    return `https://farcaster.xyz/~/signup?ref=${referralCode}`;
  }
  return "https://farcaster.xyz/~/signup";
}

// Store pending verification in backend
export async function storePendingVerificationInBackend(
  challenge: string,
  userId: string,
  platform: "discord" | "telegram",
  backendUrl: string,
): Promise<void> {
  try {
    await fetch(`${backendUrl}/api/siwf/pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge, userId, platform }),
    });
  } catch (error) {
    console.error("[SIWF] Failed to store pending verification:", error);
    // Continue anyway - the callback will handle it
  }
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

// Store verified session (stores both locally and in backend)
export async function storeSIWFSession(
  userId: string,
  platform: "discord" | "telegram",
  verification: SIWFVerification,
  backendUrl?: string,
): Promise<void> {
  const key = `${platform}:${userId}`;
  sessions.set(key, verification);

  // Also store in backend if URL provided
  if (backendUrl) {
    try {
      await fetch(`${backendUrl}/api/siwf/connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          platform,
          fid: verification.fid,
          username: verification.username,
          custodyAddress: verification.custodyAddress,
          verifiedAddresses: verification.verifiedAddresses,
        }),
      });
    } catch (error) {
      console.error("[SIWF] Failed to store connection in backend:", error);
      // Continue anyway - local storage is fine
    }
  }
}

// Get verified session (checks both local and backend)
export async function getSIWFSession(
  userId: string,
  platform: "discord" | "telegram",
  backendUrl?: string,
): Promise<SIWFVerification | null> {
  const key = `${platform}:${userId}`;
  
  // Check local first
  const localSession = sessions.get(key);
  if (localSession) {
    return localSession;
  }

  // Check backend if URL provided
  if (backendUrl) {
    try {
      const response = await fetch(`${backendUrl}/api/siwf/connection?userId=${userId}&platform=${platform}`);
      if (response.ok) {
        const connection = await response.json();
        if (connection) {
          // Convert backend format to SIWFVerification format
          const verification: SIWFVerification = {
            fid: connection.fid,
            custodyAddress: connection.custodyAddress,
            verifiedAddresses: connection.verifiedAddresses || [],
            username: connection.username,
            signature: "", // Not stored in backend
          };
          // Cache locally
          sessions.set(key, verification);
          return verification;
        }
      }
    } catch (error) {
      console.error("[SIWF] Failed to get connection from backend:", error);
    }
  }

  return null;
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
