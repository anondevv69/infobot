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

/**
 * Extract username from Farcaster URL
 * Examples:
 * - https://farcaster.xyz/mc -> mc
 * - https://farcaster.xyz/@username -> username
 * - https://warpcast.com/username -> username
 */
export function extractFarcasterUsername(url: string): string | null {
  // Match farcaster.xyz/username or farcaster.xyz/@username
  const farcasterMatch = url.match(/https?:\/\/(?:www\.)?farcaster\.xyz\/(?:@)?([a-z0-9][a-z0-9_.-]{0,31})/i);
  if (farcasterMatch) {
    return farcasterMatch[1].toLowerCase();
  }
  
  // Match warpcast.com/username
  const warpcastMatch = url.match(/https?:\/\/(?:www\.)?warpcast\.com\/([a-z0-9][a-z0-9_.-]{0,31})/i);
  if (warpcastMatch) {
    return warpcastMatch[1].toLowerCase();
  }
  
  // Match fcast.me/username
  const fcastMatch = url.match(/https?:\/\/(?:www\.)?fcast\.me\/([a-z0-9][a-z0-9_.-]{0,31})/i);
  if (fcastMatch) {
    return fcastMatch[1].toLowerCase();
  }
  
  return null;
}

