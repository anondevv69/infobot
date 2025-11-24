/**
 * Extract searchable identifier from various URL types
 * This ensures we search for the right thing (username, address, etc.) instead of the full URL
 */

/**
 * Extract username from X/Twitter URL
 * Examples:
 * - https://x.com/username -> username
 * - https://twitter.com/username -> username
 */
export function extractXUsername(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") {
      return null;
    }
    const segments = urlObj.pathname.split("/").filter(Boolean);
    if (segments.length > 0 && segments[0].toLowerCase() !== "i") {
      const username = segments[0].replace(/^@/, "").trim();
      if (username && /^[a-zA-Z0-9_]{1,15}$/.test(username)) {
        return username.toLowerCase();
      }
    }
    // Try query parameter
    const screenName = urlObj.searchParams.get("screen_name");
    if (screenName) {
      return screenName.toLowerCase();
    }
    return null;
  } catch {
    // Fallback regex if URL parsing fails
    const match = url.match(/(?:x|twitter)\.com\/([a-zA-Z0-9_]+)/i);
    if (match) {
      return match[1].toLowerCase();
    }
    return null;
  }
}

/**
 * Extract address or handle from Zora URL
 * Examples:
 * - https://zora.co/collect/base:0x1234... -> 0x1234...
 * - https://zora.co/@username -> username
 * - https://zora.co/coin/0x1234... -> 0x1234...
 */
export function extractZoraIdentifier(url: string): string | null {
  // First try to extract address
  const addressMatch = url.match(/0x[a-fA-F0-9]{40}/i);
  if (addressMatch) {
    return addressMatch[0].toLowerCase();
  }
  
  // Try to extract handle from @username format
  const handleMatch = url.match(/zora\.co\/@([a-z0-9][a-z0-9_.-]{0,31})/i);
  if (handleMatch) {
    return handleMatch[1].toLowerCase();
  }
  
  // Try to extract from path segments
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    // Check for /collect/base:0x... or /coin/0x...
    const collectMatch = path.match(/\/(?:collect|coin)\/(?:base:)?(0x[a-fA-F0-9]{40})/i);
    if (collectMatch) {
      return collectMatch[1].toLowerCase();
    }
    // Check for /@username
    const atMatch = path.match(/\/@([a-z0-9][a-z0-9_.-]{0,31})/i);
    if (atMatch) {
      return atMatch[1].toLowerCase();
    }
  } catch {
    // URL parsing failed, continue
  }
  
  return null;
}

/**
 * Extract identifier from any URL type based on search type
 * Returns the extracted identifier or the original query if extraction fails
 */
export function extractSearchIdentifier(query: string, searchType: string): string {
  switch (searchType) {
    case "farcaster_link": {
      const { extractFarcasterUsername } = require("./farcasterLinks");
      const username = extractFarcasterUsername(query);
      return username || query;
    }
    case "x_link":
    case "x_account": {
      const username = extractXUsername(query);
      return username || query;
    }
    case "zora": {
      const identifier = extractZoraIdentifier(query);
      return identifier || query;
    }
    case "contract":
      // Contract addresses are already the identifier
      return query;
    case "farcaster_username":
      // Remove @ if present
      return query.replace(/^@/, "");
    default:
      return query;
  }
}

