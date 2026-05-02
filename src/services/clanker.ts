import type { User } from "@neynar/nodejs-sdk/build/api";
import { env } from "../config";

/** Pool config shape from Clanker API (v4); fields vary by deployment type. */
export interface ClankerPoolConfig {
  type?: string;
  pairedToken?: string;
  tickIfToken0IsNewToken?: number;
}

export interface ClankerTrustStatus {
  isTrustedDeployer?: boolean;
  isTrustedClanker?: boolean;
  fidMatchesDeployer?: boolean;
  verifiedAddresses?: string[];
}

export interface ClankerToken {
  /** Integer id or UUID string depending on endpoint */
  id?: number | string;
  created_at: string;
  contract_address: string;
  name: string;
  symbol: string;
  /** Present on some API responses (e.g. fetch-by-admin). */
  admin?: string;
  description?: string;
  img_url?: string;
  type?: string;
  pair?: string;
  chain_id?: number;
  msg_sender: string;
  deployed_at?: string;
  /** API warning codes, e.g. non-weth-pair, low-liquidity */
  warnings?: string[];
  pool_config?: ClankerPoolConfig;
  /** Approximate starting / launch market cap (often in ETH terms from API). */
  starting_market_cap?: number;
  trustStatus?: ClankerTrustStatus;
  tags?: {
    champagne?: boolean;
    verified?: boolean;
    knownInterfaceDeployer?: boolean;
  };
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
export interface SearchCreatorUserRow {
  platform?: string;
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  verifiedAddresses?: string[];
}

interface SearchCreatorResponse {
  tokens: ClankerToken[];
  user?: unknown;
  users?: SearchCreatorUserRow[];
  searchedAddress?: string;
  total?: number;
  hasMore?: boolean;
}

const CLANKER_API_BASE = "https://www.clanker.world/api";
const CLANKER_SEARCH_CREATOR_BASE = "https://clanker.world/api";

function clankerFetchHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (env.clankerApiKey) {
    h["x-api-key"] = env.clankerApiKey;
    h["Content-Type"] = "application/json";
  }
  return h;
}

function mergeRelated(
  a?: ClankerToken["related"],
  b?: ClankerToken["related"],
): ClankerToken["related"] | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    user: a.user ?? b.user,
    market: { ...b.market, ...a.market },
  };
}

/** Prefer the richer duplicate when the same contract appears from multiple list calls. */
function mergeClankerDuplicates(a: ClankerToken, b: ClankerToken): ClankerToken {
  const score = (t: ClankerToken) =>
    (t.warnings?.length ? 1 : 0) +
    (t.pool_config ? 1 : 0) +
    (t.starting_market_cap != null ? 1 : 0) +
    (t.related?.market?.marketCap ? 2 : 0) +
    (t.related?.user ? 2 : 0) +
    (t.img_url ? 1 : 0) +
    (t.trustStatus ? 1 : 0);

  const primary = score(a) >= score(b) ? a : b;
  const secondary = primary === a ? b : a;
  return {
    ...secondary,
    ...primary,
    warnings: primary.warnings?.length ? primary.warnings : secondary.warnings,
    pool_config: primary.pool_config ?? secondary.pool_config,
    trustStatus: primary.trustStatus ?? secondary.trustStatus,
    related: mergeRelated(primary.related, secondary.related),
  };
}

function dedupeTokensByContract(tokens: ClankerToken[]): ClankerToken[] {
  const map = new Map<string, ClankerToken>();
  for (const t of tokens) {
    const k = t.contract_address?.toLowerCase();
    if (!k) continue;
    const prev = map.get(k);
    map.set(k, prev ? mergeClankerDuplicates(prev, t) : t);
  }
  return [...map.values()];
}

/** Merge duplicate contract addresses, keeping the richer payload (warnings, market, etc.). */
export function dedupeClankerTokens(tokens: ClankerToken[]): ClankerToken[] {
  return dedupeTokensByContract(tokens);
}

/** Normalize a partial API row so `ClankerToken` invariants hold (msg_sender required by callers). */
function normalizeClankerApiRow(
  raw: Partial<ClankerToken> & { admin?: string },
): ClankerToken | null {
  const contract = raw.contract_address?.trim();
  if (!contract || !/^0x[a-fA-F0-9]{40}$/i.test(contract)) {
    return null;
  }
  const created =
    raw.created_at?.trim() ||
    raw.deployed_at?.trim() ||
    new Date(0).toISOString();
  const msg =
    typeof raw.msg_sender === "string" && raw.msg_sender.startsWith("0x")
      ? raw.msg_sender
      : typeof raw.admin === "string" && raw.admin.startsWith("0x")
        ? raw.admin
        : "0x0000000000000000000000000000000000000000";

  return {
    ...raw,
    created_at: created,
    contract_address: contract,
    name: raw.name?.trim() || "?",
    symbol: raw.symbol?.trim() || "?",
    msg_sender: msg,
  };
}

export interface FetchTokensByAdminPageResult {
  tokens: ClankerToken[];
  total?: number;
  cursor: string | null;
}

/**
 * Authenticated — https://clanker.gitbook.io/clanker-documentation/authenticated/get-tokens-by-admin
 * GET /api/tokens/fetch-by-admin
 */
export async function fetchTokensByAdmin(
  adminAddress: string,
  options?: {
    limit?: number;
    cursor?: string;
    chainId?: number;
    includeUser?: boolean;
    includeMarket?: boolean;
    timeoutMs?: number;
  },
): Promise<FetchTokensByAdminPageResult> {
  if (!env.clankerApiKey) {
    return { tokens: [], cursor: null };
  }

  const trimmed = adminAddress.trim();
  if (!/^0x[a-fA-F0-9]{40}$/i.test(trimmed)) {
    return { tokens: [], cursor: null };
  }

  const url = new URL(`${CLANKER_API_BASE}/tokens/fetch-by-admin`);
  url.searchParams.set("admin", trimmed);
  const lim = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  url.searchParams.set("limit", String(lim));
  if (options?.cursor) {
    url.searchParams.set("cursor", options.cursor);
  }
  if (options?.chainId != null) {
    url.searchParams.set("chainId", String(options.chainId));
  }
  if (options?.includeUser ?? true) {
    url.searchParams.set("includeUser", "true");
  }
  if (options?.includeMarket ?? true) {
    url.searchParams.set("includeMarket", "true");
  }

  const timeoutMs = options?.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: clankerFetchHeaders(),
    });
    if (response.status === 401 || response.status === 403) {
      console.warn("Clanker fetch-by-admin: unauthorized (check CLANKER_API_KEY)");
      return { tokens: [], cursor: null };
    }
    if (!response.ok) {
      console.warn(`Clanker fetch-by-admin failed (${response.status})`);
      return { tokens: [], cursor: null };
    }
    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("json")) {
      return { tokens: [], cursor: null };
    }
    const json = (await response.json()) as {
      data?: Partial<ClankerToken>[];
      total?: number;
      cursor?: string | null;
    };
    const rows = json.data ?? [];
    const tokens: ClankerToken[] = [];
    for (const row of rows) {
      const n = normalizeClankerApiRow(row);
      if (n) tokens.push(n);
    }
    const cursor =
      json.cursor === undefined || json.cursor === null ? null : String(json.cursor);
    return { tokens, total: json.total, cursor };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("Clanker fetch-by-admin timeout");
    } else {
      console.warn("Clanker fetch-by-admin error", error);
    }
    return { tokens: [], cursor: null };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Follow `cursor` until exhausted or `maxPages` (bounded cost).
 */
export async function fetchAllTokensByAdmin(
  adminAddress: string,
  options?: {
    chainId?: number;
    limit?: number;
    includeUser?: boolean;
    includeMarket?: boolean;
    maxPages?: number;
  },
): Promise<ClankerToken[]> {
  if (!env.clankerApiKey) {
    return [];
  }

  const maxPages = Math.min(options?.maxPages ?? 10, 50);
  const pageSize = options?.limit ?? 50;
  let cursor: string | undefined;
  const acc: ClankerToken[] = [];

  for (let i = 0; i < maxPages; i += 1) {
    const page = await fetchTokensByAdmin(adminAddress, {
      limit: pageSize,
      cursor,
      chainId: options?.chainId,
      includeUser: options?.includeUser,
      includeMarket: options?.includeMarket,
    });
    acc.push(...page.tokens);
    if (!page.cursor) break;
    cursor = page.cursor;
  }

  return dedupeTokensByContract(acc);
}

async function executeClankerRequest(url: URL, timeoutMs: number = 5000): Promise<ClankerToken[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: clankerFetchHeaders(),
      });
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
  const full = await executeSearchCreatorRequestFull(url, timeoutMs);
  return full?.tokens ?? [];
}

async function executeSearchCreatorRequestFull(
  url: URL,
  timeoutMs: number = 5000,
): Promise<SearchCreatorResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: clankerFetchHeaders(),
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        if (response.status === 404) return null;
        console.warn(`Clanker search-creator failed (${response.status}): ${response.statusText} – ${url.toString()}`);
        return null;
      }
      return (await response.json()) as SearchCreatorResponse;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        console.warn(`Clanker search-creator timeout after ${timeoutMs}ms: ${url.toString()}`);
        return null;
      }
      throw error;
    }
  } catch (error) {
    console.error("Unexpected error calling Clanker search-creator:", error);
    return null;
  }
}

/**
 * Tokens + Farcaster rows from search-creator (saves a separate username lookup when tokens match).
 */
export async function fetchCreatorTokensAndUsers(
  q: string,
  options?: { limit?: number; offset?: number; sort?: "asc" | "desc"; trustedOnly?: boolean },
): Promise<{ tokens: ClankerToken[]; farcasterCreators: SearchCreatorUserRow[] }> {
  const url = new URL(`${CLANKER_SEARCH_CREATOR_BASE}/search-creator`);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(options?.limit ?? 20));
  if (options?.offset != null) url.searchParams.set("offset", String(options.offset));
  if (options?.sort) url.searchParams.set("sort", options.sort);
  if (options?.trustedOnly) url.searchParams.set("trustedOnly", "true");

  const json = await executeSearchCreatorRequestFull(url, 5000);
  const tokens = json?.tokens ?? [];
  const users = json?.users ?? [];
  const farcasterCreators = users.filter(
    (u) => u.platform?.toLowerCase() === "farcaster" && u.fid != null,
  );
  return { tokens, farcasterCreators };
}

/** Get paginated list of tokens: https://clanker.gitbook.io/clanker-documentation/public/get-paginated-list-of-tokens */
export async function fetchTokensByFid(fid: number): Promise<ClankerToken[]> {
  const url = new URL(`${CLANKER_API_BASE}/tokens`);
  url.searchParams.set("fids", fid.toString());
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

function parseTokensPayload(json: unknown): ClankerToken[] {
  if (!json || typeof json !== "object") return [];
  const o = json as { tokens?: ClankerToken[]; data?: ClankerToken[] | ClankerToken };
  if (Array.isArray(o.tokens)) return o.tokens;
  if (Array.isArray(o.data)) return o.data;
  if (o.data && typeof o.data === "object") {
    return [o.data as ClankerToken];
  }
  return [];
}

/**
 * Authenticated only — see https://clanker.gitbook.io/clanker-documentation/authenticated/get-token-by-address
 * GET https://www.clanker.world/api/get-clanker-by-address?address=0x...
 * Header: x-api-key
 * Response: { data: { ... token } }
 */
async function fetchGetClankerByAddress(
  address: string,
  timeoutMs: number = 5000,
): Promise<ClankerToken[]> {
  const url = new URL(`https://www.clanker.world/api/get-clanker-by-address`);
  url.searchParams.set("address", address.trim());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: clankerFetchHeaders(),
    });
    if (!response.ok) return [];
    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return [];
    const json = await response.json();
    return parseTokensPayload(json);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return [];
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch tokens by contract address, query (q), or pair.
 * Uses authenticated get-clanker-by-address when CLANKER_API_KEY is set, then public list endpoints.
 */
export async function fetchTokensByAddress(address: string): Promise<ClankerToken[]> {
  const trimmed = address.trim();
  const normalizedLower = trimmed.toLowerCase();
  const isEvm = /^0x[a-fA-F0-9]{40}$/.test(trimmed);

  if (isEvm && env.clankerApiKey) {
    const v4 = await fetchGetClankerByAddress(trimmed, 4000);
    const exactV4 = v4.filter(
      (t) => t.contract_address?.toLowerCase() === normalizedLower,
    );
    if (exactV4.length > 0) {
      return dedupeTokensByContract(exactV4);
    }
  }

  const limit = "10";
  const qVariants = Array.from(new Set([trimmed, trimmed.toLowerCase(), trimmed.toUpperCase()]));

  const requests = qVariants.map((q) => {
    const byContractUrl = new URL(`${CLANKER_API_BASE}/tokens`);
    byContractUrl.searchParams.set("q", q);
    byContractUrl.searchParams.set("limit", limit);
    byContractUrl.searchParams.set("includeUser", "true");
    byContractUrl.searchParams.set("includeMarket", "true");
    return executeClankerRequest(byContractUrl, 3000);
  });

  const pairUrl = new URL(`${CLANKER_API_BASE}/tokens`);
  pairUrl.searchParams.set("pairAddress", normalizedLower);
  pairUrl.searchParams.set("limit", limit);
  pairUrl.searchParams.set("includeUser", "true");
  pairUrl.searchParams.set("includeMarket", "true");

  const [pairResult, ...qResults] = await Promise.all([
    executeClankerRequest(pairUrl, 3000),
    ...requests,
  ]);

  const merged = dedupeTokensByContract([...qResults.flat(), ...pairResult]);

  const exactContract = (list: ClankerToken[]) =>
    list.filter((t) => t.contract_address?.toLowerCase() === normalizedLower);

  const exact = exactContract(merged);
  return exact.length > 0 ? exact : exactContract(pairResult);
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
