import { env } from "../config";

/**
 * Build a Farcaster/Warpcast profile URL with referral code
 * The referral code is added as a query parameter for tracking
 * When users click and sign up, the referral code will be associated
 */
export function buildFarcasterProfileUrl(username: string): string {
  const normalized = username.replace(/^@/, "");
  const baseUrl = `https://warpcast.com/${normalized}`;
  
  // Add referral code as query parameter
  // This allows tracking when users sign up through your bot's links
  const referralCode = env.farcasterReferralCode;
  if (referralCode) {
    return `${baseUrl}?ref=${referralCode}`;
  }
  
  return baseUrl;
}

/**
 * Build a Farcaster signup link with referral code
 */
export function buildFarcasterSignupUrl(): string {
  const referralCode = env.farcasterReferralCode;
  if (referralCode) {
    return `https://farcaster.xyz/~/code/${referralCode}`;
  }
  return "https://farcaster.xyz";
}

/**
 * Build a cast URL (no referral needed for casts)
 */
export function buildCastUrl(username: string, hash: string): string {
  const normalized = username.replace(/^@/, "");
  return `https://warpcast.com/${normalized}/${hash}`;
}

