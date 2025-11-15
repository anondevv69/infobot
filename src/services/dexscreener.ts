import { env } from "../config";

const DEXSCREENER_API_BASE = "https://api.dexscreener.com/latest/dex";

export interface DexScreenerToken {
  address: string;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
}

export interface DexScreenerPair {
  chainId?: string | null;
  dexId?: string | null;
  url?: string | null;
  pairAddress?: string | null;
  baseToken?: DexScreenerToken | null;
  quoteToken?: DexScreenerToken | null;
  priceNative?: string | null;
  priceUsd?: string | null;
  txns?: {
    m5?: { buys?: number | null; sells?: number | null } | null;
    h1?: { buys?: number | null; sells?: number | null } | null;
    h6?: { buys?: number | null; sells?: number | null } | null;
    h24?: { buys?: number | null; sells?: number | null } | null;
  } | null;
  volume?: {
    h24?: number | null;
    h6?: number | null;
    h1?: number | null;
    m5?: number | null;
  } | null;
  priceChange?: {
    m5?: number | null;
    h1?: number | null;
    h6?: number | null;
    h24?: number | null;
  } | null;
  liquidity?: {
    usd?: number | null;
    base?: number | null;
    quote?: number | null;
  } | null;
  fdv?: number | null;
  pairCreatedAt?: number | null;
}

export interface DexScreenerResponse {
  schemaVersion?: string | null;
  pairs?: DexScreenerPair[] | null;
}

export interface TokenMetrics {
  priceUsd?: number | null;
  priceChange24h?: number | null;
  volume24h?: number | null;
  liquidity?: number | null;
  marketCap?: number | null;
  fdv?: number | null;
  trades24h?: { buys?: number | null; sells?: number | null } | null;
  dexUrl?: string | null;
  pairAddress?: string | null;
}

/**
 * Fetch token data from DexScreener API for Base network
 */
export async function fetchBaseTokenData(
  contractAddress: string,
): Promise<TokenMetrics | null> {
  try {
    const url = `${DEXSCREENER_API_BASE}/tokens/${contractAddress}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.warn(
        `DexScreener API error (${response.status}): ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as DexScreenerResponse;
    const pairs = data.pairs?.filter(
      (pair) => pair.chainId === "base" || pair.chainId === "8453",
    );

    if (!pairs || pairs.length === 0) {
      return null;
    }

    // Get the pair with highest liquidity
    const bestPair = pairs.reduce((best, current) => {
      const bestLiq = best.liquidity?.usd ?? 0;
      const currentLiq = current.liquidity?.usd ?? 0;
      return currentLiq > bestLiq ? current : best;
    }, pairs[0]);

    const priceUsd = bestPair.priceUsd
      ? parseFloat(bestPair.priceUsd)
      : null;
    const priceChange24h = bestPair.priceChange?.h24
      ? parseFloat(bestPair.priceChange.h24.toString())
      : null;
    const volume24h = bestPair.volume?.h24 ?? null;
    const liquidity = bestPair.liquidity?.usd ?? null;
    const fdv = bestPair.fdv ?? null;
    const marketCap = fdv ?? liquidity; // Use FDV if available, otherwise liquidity

    return {
      priceUsd,
      priceChange24h,
      volume24h,
      liquidity,
      marketCap,
      fdv,
      trades24h: bestPair.txns?.h24 ?? null,
      dexUrl: bestPair.url ?? null,
      pairAddress: bestPair.pairAddress ?? null,
    };
  } catch (error) {
    console.error("Failed to fetch DexScreener data:", error);
    return null;
  }
}

/**
 * Check if a token exists on DexScreener (for Base network)
 */
export async function checkTokenExists(contractAddress: string): Promise<boolean> {
  const data = await fetchBaseTokenData(contractAddress);
  return data !== null;
}


