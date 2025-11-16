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

async function executeClankerRequest(url: URL): Promise<ClankerToken[]> {
  try {
    const response = await fetch(url);
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
  return executeClankerRequest(url);
}

export async function fetchTokensByQuery(query: string): Promise<ClankerToken[]> {
  const url = new URL(`${CLANKER_API_BASE}/tokens`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("includeUser", "true");
  url.searchParams.set("includeMarket", "true");
  return executeClankerRequest(url);
}

export async function fetchTokensByAddress(
  address: string,
): Promise<ClankerToken[]> {
  const normalizedAddress = address.toLowerCase();
  
  // First try direct contract address search (most reliable)
  const contractUrl = new URL(`${CLANKER_API_BASE}/tokens`);
  contractUrl.searchParams.set("contractAddress", normalizedAddress);
  contractUrl.searchParams.set("limit", "10");
  contractUrl.searchParams.set("includeUser", "true");
  contractUrl.searchParams.set("includeMarket", "true");
  const byContract = await executeClankerRequest(contractUrl);
  if (byContract.length > 0) {
    // Filter to ensure exact match
    const exactMatches = byContract.filter(
      (token) => token.contract_address?.toLowerCase() === normalizedAddress,
    );
    if (exactMatches.length > 0) {
      return exactMatches;
    }
  }

  // Fallback to query search
  const queryUrl = new URL(`${CLANKER_API_BASE}/tokens`);
  queryUrl.searchParams.set("q", address);
  queryUrl.searchParams.set("limit", "10");
  queryUrl.searchParams.set("includeUser", "true");
  queryUrl.searchParams.set("includeMarket", "true");
  const byQuery = await executeClankerRequest(queryUrl);
  if (byQuery.length > 0) {
    // Filter to ensure exact match
    const exactMatches = byQuery.filter(
      (token) => token.contract_address?.toLowerCase() === normalizedAddress,
    );
    if (exactMatches.length > 0) {
      return exactMatches;
    }
  }

  // Last resort: try pair address
  const pairUrl = new URL(`${CLANKER_API_BASE}/tokens`);
  pairUrl.searchParams.set("pairAddress", address);
  pairUrl.searchParams.set("limit", "10");
  pairUrl.searchParams.set("includeUser", "true");
  pairUrl.searchParams.set("includeMarket", "true");
  const byPair = await executeClankerRequest(pairUrl);
  // Filter to ensure exact match
  return byPair.filter(
    (token) => token.contract_address?.toLowerCase() === normalizedAddress,
  );
}

export interface ClankerTokenSummary {
  token: ClankerToken;
  farcasterUser?: User;
}
