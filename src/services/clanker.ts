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

interface ClankerTokensResponse {
  data: ClankerToken[];
  total?: number;
  cursor?: string;
  tokensDeployed?: number;
}

/** Search-creator response: https://clanker.gitbook.io/clanker-documentation/public/get-tokens-by-creator */
interface SearchCreatorResponse {
  tokens: ClankerToken[];
  user?: unknown;
  searchedAddress?: string;
  total?: number;
  hasMore?: boolean;
}

const CLANKER_API_BASE = "https://www.clanker.world/api";
const CLANKER_SEARCH_CREATOR_BASE = "https://clanker.world/api";

async function executeClankerRequest(url: URL, timeoutMs: number = 5000): Promise<ClankerToken[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        if (response.status === 404) return [];
        console.warn(`Clanker request failed (${response.status}): ${response.statusText} – ${url.toString()}`);
        return [];
      }
      const json = (await response.json()) as ClankerTokensResponse;
      return json.data ?? [];
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
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

async function executeSearchCreatorRequest(url: URL, timeoutMs: number = 5000): Promise<ClankerToken[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        if (response.status === 404) return [];
        console.warn(`Clanker search-creator failed (${response.status}): ${response.statusText} – ${url.toString()}`);
        return [];
      }
      const json = (await response.json()) as SearchCreatorResponse;
      return json.tokens ?? [];
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        console.warn(`Clanker search-creator timeout after ${timeoutMs}ms: ${url.toString()}`);
        return [];
      }
      throw error;
    }
  } catch (error) {
    console.error("Unexpected error calling Clanker search-creator:", error);
    return [];
  }
}

/** Get paginated list of tokens: https://clanker.gitbook.io/clanker-documentation/public/get-paginated-list-of-tokens */
export async function fetchTokensByFid(fid: number): Promise<ClankerToken[]> {
  const url = new URL(`${CLANKER_API_BASE}/tokens`);
  url.searchParams.set("fid", fid.toString());
  url.searchParams.set("limit", "20");
  url.searchParams.set("includeUser", "true");
  url.searchParams.set("includeMarket", "true");
  return executeClankerRequest(url, 5000);
}

/** Search by token name/symbol (or contract address via q). */
export async function fetchTokensByQuery(query: string): Promise<ClankerToken[]> {
  const url = new URL(`${CLANKER_API_BASE}/tokens`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("includeUser", "true");
  url.searchParams.set("includeMarket", "true");
  return executeClankerRequest(url, 5000);
}

/**
 * Get tokens by creator (Farcaster username or wallet).
 * Uses search-creator: https://clanker.gitbook.io/clanker-documentation/public/get-tokens-by-creator
 */
export async function fetchTokensByCreator(
  q: string,
  options?: { limit?: number; offset?: number; sort?: "asc" | "desc"; trustedOnly?: boolean },
): Promise<ClankerToken[]> {
  const url = new URL(`${CLANKER_SEARCH_CREATOR_BASE}/search-creator`);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(options?.limit ?? 20));
  if (options?.offset != null) url.searchParams.set("offset", String(options.offset));
  if (options?.sort) url.searchParams.set("sort", options.sort);
  if (options?.trustedOnly) url.searchParams.set("trustedOnly", "true");
  return executeSearchCreatorRequest(url, 5000);
}

/**
 * Fetch tokens by contract address, query (q), or pair.
 * Uses get-paginated-list-of-tokens: https://clanker.gitbook.io/clanker-documentation/public/get-paginated-list-of-tokens
 */
export async function fetchTokensByAddress(address: string): Promise<ClankerToken[]> {
  const normalizedAddress = address.toLowerCase();
  const limit = "10";
  const commonParams = { limit, includeUser: "true", includeMarket: "true" };

  const byContractUrl = new URL(`${CLANKER_API_BASE}/tokens`);
  byContractUrl.searchParams.set("q", normalizedAddress);
  byContractUrl.searchParams.set("limit", limit);
  byContractUrl.searchParams.set("includeUser", "true");
  byContractUrl.searchParams.set("includeMarket", "true");

  const pairUrl = new URL(`${CLANKER_API_BASE}/tokens`);
  pairUrl.searchParams.set("pairAddress", normalizedAddress);
  pairUrl.searchParams.set("limit", limit);
  pairUrl.searchParams.set("includeUser", "true");
  pairUrl.searchParams.set("includeMarket", "true");

  const [byQuery, byPair] = await Promise.all([
    executeClankerRequest(byContractUrl, 3000),
    executeClankerRequest(pairUrl, 3000),
  ]);

  const exactContract = (list: ClankerToken[]) =>
    list.filter((t) => t.contract_address?.toLowerCase() === normalizedAddress);

  if (byQuery.length > 0) {
    const exact = exactContract(byQuery);
    if (exact.length > 0) return exact;
  }
  return exactContract(byPair);
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
