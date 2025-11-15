import { env } from "../config";
import { buildFarcasterProfileUrl } from "../utils/farcasterLinks";

const ZORA_API_BASE_URL = "https://api-sdk.zora.engineering";
const DEFAULT_CHAIN_ID = 8453;

export type ZoraCoinSource = "created" | "holding" | "direct";

export interface ZoraCoinMedia {
  mimeType?: string | null;
  originalUri?: string | null;
  previewImage?: {
    small?: string | null;
    medium?: string | null;
    blurhash?: string | null;
  } | null;
  videoPreviewUrl?: string | null;
}

export interface ZoraProfileSocials {
  instagram?: { username?: string | null } | null;
  tiktok?: { username?: string | null } | null;
  twitter?: { username?: string | null } | null;
  farcaster?: {
    username?: string | null;
    displayName?: string | null;
    followerCount?: number | null;
  } | null;
}

export interface ZoraProfileSocialLink {
  platform: string;
  label: string;
  url: string;
}

export interface ZoraProfileSummary {
  handle?: string | null;
  displayName?: string | null;
  farcasterHandle?: string | null;
  farcasterDisplayName?: string | null;
  avatarUrl?: string | null;
  walletAddresses: string[];
  creatorCoinAddress?: string | null;
  platformBlocked?: boolean | null;
  socials: ZoraProfileSocialLink[];
}

export interface ZoraCoinSummary {
  coin: ZoraCoin;
  source: ZoraCoinSource;
  isCreatorCoin: boolean;
}

export interface ZoraLookupResult {
  profile: ZoraProfileSummary;
  latestCoin?: ZoraCoinSummary;
  createdCoins?: ZoraCoin[];
}

export interface ZoraCoin {
  id?: string;
  name?: string | null;
  description?: string | null;
  address: string;
  symbol?: string | null;
  createdAt?: string | null;
  creatorAddress?: string | null;
  chainId?: number | null;
  marketCap?: string | null;
  tokenPrice?: {
    priceInUsdc?: string | null;
    priceInPoolToken?: string | null;
    currencyAddress?: string | null;
  } | null;
  creatorProfile?: {
    handle?: string | null;
    avatar?: {
      previewImage?: {
        small?: string | null;
        medium?: string | null;
        blurhash?: string | null;
      } | null;
    } | null;
    socialAccounts?: ZoraProfileSocials | null;
    creatorCoin?: {
      address?: string | null;
    } | null;
  } | null;
  mediaContent?: ZoraCoinMedia | null;
}

interface ZoraProfileResponse {
  profile?: {
    __typename?: string;
    handle?: string | null;
    displayName?: string | null;
    platformBlocked?: boolean | null;
    avatar?: {
      previewImage?: {
        medium?: string | null;
        small?: string | null;
      } | null;
    } | null;
    publicWallet?: {
      walletAddress?: string | null;
    } | null;
    socialAccounts?: ZoraProfileSocials | null;
    linkedWallets?: {
      edges?: Array<{
        node?: {
          walletAddress?: string | null;
        } | null;
      }> | null;
    } | null;
    creatorCoin?: {
      address?: string | null;
    } | null;
  } | null;
}

interface ZoraProfileCoinsResponse {
  profile?: {
    handle?: string | null;
    socialAccounts?: ZoraProfileSocials | null;
    creatorCoin?: {
      address?: string | null;
    } | null;
    createdCoins?: {
      edges?: Array<{
        node?: ZoraCoin & { createdAt?: string | null };
      }> | null;
    } | null;
  } | null;
}

interface ZoraProfileBalancesResponse {
  profile?: {
    coinBalances?: {
      edges?: Array<{
        node?: {
          updatedAt?: string | null;
          balance?: string | null;
          coin?: ZoraCoin & { createdAt?: string | null };
        } | null;
      }> | null;
    } | null;
  } | null;
}

interface ZoraCoinResponse {
  zora20Token?: ZoraCoin | null;
}

type QueryParams = Record<string, string | number | undefined | null>;

function buildHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/json",
  };
  if (env.zoraApiKey) {
    headers["api-key"] = env.zoraApiKey;
  }
  return headers;
}

async function requestZora<TData>(
  path: string,
  params?: QueryParams,
): Promise<TData | null> {
  const url = new URL(path, ZORA_API_BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const response = await fetch(url, { headers: buildHeaders() });
    if (!response.ok) {
      const body = await response.text();
      if (response.status === 404 || response.status === 400) {
        console.debug(
          `[zora] request returned ${response.status} for ${url.toString()} -> ${body}`,
        );
      } else {
        console.warn(
          `Zora request failed (${response.status}): ${response.statusText} – ${url.toString()} -> ${body}`,
        );
      }
      return null;
    }
    return (await response.json()) as TData;
  } catch (error) {
    console.error(`Unexpected error calling Zora endpoint ${path}:`, error);
    return null;
  }
}

function normalizeAddress(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.toLowerCase();
}

function uniqueNormalized(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) {
      continue;
    }
    const normalized = value.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(value);
    }
  }
  return result;
}

function sortByCreatedAtDescending<T extends { createdAt?: string | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const aDate = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bDate = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bDate - aDate;
  });
}

export async function fetchZoraCoin(
  address: string,
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<ZoraCoin | null> {
  const data = await requestZora<ZoraCoinResponse>("/coin", {
    address,
    chainId,
  });
  if (data?.zora20Token) {
    return data.zora20Token;
  }
  const fallback = await requestZora<ZoraCoinResponse>("/coin", {
    address,
    chain: chainId,
  });
  return fallback?.zora20Token ?? null;
}

async function fetchZoraProfile(identifier: string): Promise<ZoraProfileResponse | null> {
  return requestZora<ZoraProfileResponse>("/profile", { identifier });
}

async function fetchZoraProfileCoins(
  identifier: string,
  count = 5,
): Promise<ZoraProfileCoinsResponse | null> {
  return requestZora<ZoraProfileCoinsResponse>("/profileCoins", {
    identifier,
    count,
  });
}

async function fetchZoraProfileBalances(
  identifier: string,
  count = 5,
): Promise<ZoraProfileBalancesResponse | null> {
  return requestZora<ZoraProfileBalancesResponse>("/profileBalances", {
    identifier,
    count,
  });
}

function buildProfileSummary(
  profile?: ZoraProfileResponse["profile"],
): ZoraProfileSummary {
  const farcasterUsername = profile?.socialAccounts?.farcaster?.username ?? null;
  const farcasterDisplayName = profile?.socialAccounts?.farcaster?.displayName ?? null;

  const walletCandidates = [
    profile?.publicWallet?.walletAddress ?? null,
    ...(profile?.linkedWallets?.edges?.map((edge) => edge?.node?.walletAddress ?? null) ??
      []),
  ];

  const socials = collectSocialLinks(profile, farcasterUsername);

  return {
    handle: profile?.handle ?? null,
    displayName: profile?.displayName ?? null,
    farcasterHandle: farcasterUsername,
    farcasterDisplayName,
    avatarUrl:
      profile?.avatar?.previewImage?.medium ??
      profile?.avatar?.previewImage?.small ??
      null,
    walletAddresses: uniqueNormalized(walletCandidates),
    creatorCoinAddress: profile?.creatorCoin?.address ?? null,
    platformBlocked: profile?.platformBlocked ?? null,
    socials,
  };
}

function collectSocialLinks(
  profile?: ZoraProfileResponse["profile"],
  fallbackFarcaster?: string | null,
): ZoraProfileSocialLink[] {
  if (!profile) {
    return [];
  }

  const links: ZoraProfileSocialLink[] = [];

  const pushLink = (
    platform: string,
    account: {
      username?: string | null;
      displayName?: string | null;
    } | null | undefined,
  ) => {
    if (!account) {
      return;
    }
    const handle = (account.username ?? account.displayName ?? "").trim();
    if (handle.length === 0) {
      return;
    }
    const label = platform === "Farcaster" ? `fc/${handle.replace(/^@/, "")}` : handle;
    const url = buildSocialUrl(platform, handle);
    if (!url) {
      return;
    }
    links.push({ platform, label, url });
  };

  if (profile.socialAccounts?.farcaster) {
    pushLink("Farcaster", profile.socialAccounts.farcaster);
  } else if (fallbackFarcaster) {
    pushLink("Farcaster", { username: fallbackFarcaster });
  }
  pushLink("X", profile.socialAccounts?.twitter ?? null);
  pushLink("TikTok", profile.socialAccounts?.tiktok ?? null);
  pushLink("Instagram", profile.socialAccounts?.instagram ?? null);

  return links;
}

function buildSocialUrl(platform: string, handle: string): string | null {
  const normalized = handle.replace(/^@/, "");
  switch (platform) {
    case "Farcaster":
      return buildFarcasterProfileUrl(normalized);
    case "X":
      return `https://x.com/${normalized}`;
    case "TikTok":
      return `https://www.tiktok.com/@${normalized}`;
    case "Instagram":
      return `https://www.instagram.com/${normalized}/`;
    default:
      return null;
  }
}

function extractCreatedCoins(
  response?: ZoraProfileCoinsResponse | null,
): ZoraCoin[] {
  const createdEdges = response?.profile?.createdCoins?.edges ?? [];
  return createdEdges
    .map((edge) => edge?.node ?? null)
    .filter((coin): coin is ZoraCoin => Boolean(coin?.address));
}

function pickLatestCreatedCoin(
  response?: ZoraProfileCoinsResponse | null,
): ZoraCoin | null {
  const createdCoins = extractCreatedCoins(response);
  if (createdCoins.length === 0) {
    return null;
  }
  return sortByCreatedAtDescending(createdCoins)[0] ?? null;
}

function pickLatestHeldCoin(
  response?: ZoraProfileBalancesResponse | null,
): ZoraCoin | null {
  const balanceEdges = response?.profile?.coinBalances?.edges ?? [];
  const coins = balanceEdges
    .map((edge) => edge?.node?.coin ?? null)
    .filter((coin): coin is ZoraCoin => Boolean(coin?.address));
  if (coins.length === 0) {
    return null;
  }
  return sortByCreatedAtDescending(coins)[0] ?? null;
}

export async function fetchZoraSummary(identifier: string): Promise<ZoraLookupResult | null> {
  const [profileRes, profileCoinsRes] = await Promise.all([
    fetchZoraProfile(identifier),
    fetchZoraProfileCoins(identifier),
  ]);

  const profileSummary = buildProfileSummary(profileRes?.profile ?? profileCoinsRes?.profile);
  const createdCoin = pickLatestCreatedCoin(profileCoinsRes);
  const createdCoins = extractCreatedCoins(profileCoinsRes);

  let latestCoin: ZoraCoinSummary | undefined;

  if (createdCoin) {
    latestCoin = {
      coin: createdCoin,
      source: "created",
      isCreatorCoin:
        normalizeAddress(createdCoin.address) ===
        normalizeAddress(profileSummary.creatorCoinAddress),
    };
  } else {
    const balancesRes = await fetchZoraProfileBalances(identifier);
    const heldCoin = pickLatestHeldCoin(balancesRes);
    if (heldCoin) {
      latestCoin = {
        coin: heldCoin,
        source: "holding",
        isCreatorCoin:
          normalizeAddress(heldCoin.address) ===
          normalizeAddress(profileSummary.creatorCoinAddress),
      };
    }
  }

  if (
    !profileSummary.handle &&
    !profileSummary.farcasterHandle &&
    profileSummary.walletAddresses.length === 0 &&
    !latestCoin
  ) {
    return null;
  }

  return {
    profile: profileSummary,
    latestCoin,
    createdCoins,
  };
}

export async function findBestZoraSummary(
  identifiers: Iterable<string>,
): Promise<ZoraLookupResult | null> {
  const tried = new Set<string>();
  let fallback: ZoraLookupResult | null = null;

  for (const identifier of identifiers) {
    const trimmed = identifier.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (tried.has(key)) {
      continue;
    }
    tried.add(key);
    const summary = await fetchZoraSummary(trimmed);
    if (!summary) {
      continue;
    }
    if (summary.latestCoin) {
      return summary;
    }
    if (!fallback) {
      fallback = summary;
    }
  }

  return fallback;
}


