import type { User } from "@neynar/nodejs-sdk/build/api";

export interface ClankerToken {
  id: number;
  created_at: string;
  contract_address: string;
  name: string;
  symbol: string;
  description?: string;
  img_url?: string;
  type?: string;
  pair?: string;
  chain_id?: number;
  msg_sender: string;
  deployed_at?: string;
  metadata?: {
    description?: string;
    interface?: string;
    platform?: string;
    socialMediaUrls?: Array<{ platform?: string; url?: string }>;
  };
  social_context?: {
    interface?: string | null;
    platform?: string | null;
  };
  related?: {
    user?: {
      fid?: number;
      username?: string;
      displayName?: string;
      avatarUrl?: string;
    };
    market?: {
      marketCap?: number | null;
      priceChange?: number | null;
      volume?: number | null;
      price?: number | null;
    };
  };
}

interface ClankerApiResponse {
  data: ClankerToken[];
  total: number;
  cursor?: string;
}

const CLANKER_API_BASE = "https://www.clanker.world/api";

async function executeClankerRequest(url: URL, timeoutMs: number = 5000): Promise<ClankerToken[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        console.warn(
          `Clanker request failed (${response.status}): ${response.statusText} – ${url.toString()}`,
        );
        return [];
      }
      const json = (await response.json()) as ClankerApiResponse;
      return json.data ?? [];
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.warn(`Clanker request timeout after ${timeoutMs}ms: ${url.toString()}`);
        return [];
      }
      throw error;
    }
  } catch (error) {
    console.error("Unexpected error calling Clanker API:", error);
    return [];
  }
}

export async function fetchTokensByFid(fid: number): Promise<ClankerToken[]> {
  const url = new URL(`${CLANKER_API_BASE}/tokens`);
  url.searchParams.set("fids", fid.toString());
  url.searchParams.set("limit", "20");
  url.searchParams.set("includeUser", "true");
  url.searchParams.set("includeMarket", "true");
  return executeClankerRequest(url, 5000); // 5 second timeout
}

export async function fetchTokensByQuery(query: string): Promise<ClankerToken[]> {
  const url = new URL(`${CLANKER_API_BASE}/tokens`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("includeUser", "true");
  url.searchParams.set("includeMarket", "true");
  return executeClankerRequest(url, 5000); // 5 second timeout
}

export async function fetchTokensByAddress(
  address: string,
): Promise<ClankerToken[]> {
  const normalizedAddress = address.toLowerCase();
  
  // Run all three searches in PARALLEL with timeouts (major performance improvement)
  const contractUrl = new URL(`${CLANKER_API_BASE}/tokens`);
  contractUrl.searchParams.set("contractAddress", normalizedAddress);
  contractUrl.searchParams.set("limit", "10");
  contractUrl.searchParams.set("includeUser", "true");
  contractUrl.searchParams.set("includeMarket", "true");
  
  const queryUrl = new URL(`${CLANKER_API_BASE}/tokens`);
  queryUrl.searchParams.set("q", address);
  queryUrl.searchParams.set("limit", "10");
  queryUrl.searchParams.set("includeUser", "true");
  queryUrl.searchParams.set("includeMarket", "true");
  
  const pairUrl = new URL(`${CLANKER_API_BASE}/tokens`);
  pairUrl.searchParams.set("pairAddress", address);
  pairUrl.searchParams.set("limit", "10");
  pairUrl.searchParams.set("includeUser", "true");
  pairUrl.searchParams.set("includeMarket", "true");
  
  // Execute all three searches in parallel (3 seconds timeout each)
  const [byContract, byQuery, byPair] = await Promise.all([
    executeClankerRequest(contractUrl, 3000),
    executeClankerRequest(queryUrl, 3000),
    executeClankerRequest(pairUrl, 3000),
  ]);
  
  // Check results in priority order: contract > query > pair
  if (byContract.length > 0) {
    const exactMatches = byContract.filter(
      (token) => token.contract_address?.toLowerCase() === normalizedAddress,
    );
    if (exactMatches.length > 0) {
      return exactMatches;
    }
  }
  
  if (byQuery.length > 0) {
    const exactMatches = byQuery.filter(
      (token) => token.contract_address?.toLowerCase() === normalizedAddress,
    );
    if (exactMatches.length > 0) {
      return exactMatches;
    }
  }
  
  // Return pair results (filtered)
  return byPair.filter(
    (token) => token.contract_address?.toLowerCase() === normalizedAddress,
  );
}

/**
 * Fetch recent Monad tokens from Clanker API
 * Filters by chain_id = 5001 (Monad)
 * Uses Clanker API documentation: https://clanker.gitbook.io/clanker-documentation/public/get-tokens
 */
export async function fetchRecentMonadTokens(
  limit: number = 100,
  startDate?: number, // Unix timestamp to filter tokens created after this date
): Promise<ClankerToken[]> {
  const url = new URL(`${CLANKER_API_BASE}/tokens`);
  url.searchParams.set("limit", limit.toString());
  url.searchParams.set("includeUser", "true"); // Get creator profile data including FID
  url.searchParams.set("includeMarket", "false"); // We don't need market data for monitoring
  url.searchParams.set("sort", "desc"); // Newest first (default, but explicit)
  
  // Filter by startDate if provided (Unix timestamp in seconds)
  if (startDate) {
    url.searchParams.set("startDate", Math.floor(startDate / 1000).toString()); // Convert ms to seconds
  }
  
  const tokens = await executeClankerRequest(url, 5000);
  
  // Filter to Monad chain tokens (chain_id = 5001)
  return tokens.filter((token) => token.chain_id === 5001);
}

export interface ClankerTokenSummary {
  token: ClankerToken;
  farcasterUser?: User;
}
