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
  dexName?: string | null; // DEX name (e.g., "uniswap", "pancakeswap")
  pairAddress?: string | null;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  creatorAddress?: string | null;
  factoryName?: string | null;
  createdAt?: number | null; // Timestamp in seconds
}

export interface MultiChainTokenData extends TokenMetrics {
  chainId: string;
  chainName: string;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  creatorAddress?: string | null;
  factoryName?: string | null;
  createdAt?: number | null; // Timestamp in seconds
  creationTxHash?: string | null; // Creation transaction hash
}

/**
 * Fetch token data from DexScreener API for ALL EVM chains
 * Returns the token with the highest liquidity across all chains
 */
export async function fetchMultiChainTokenData(
  contractAddress: string,
): Promise<MultiChainTokenData | null> {
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
    const pairs = data.pairs ?? [];

    if (pairs.length === 0) {
      return null;
    }

    // Get the pair with highest liquidity across all chains
    const bestPair = pairs.reduce((best, current) => {
      const bestLiq = best.liquidity?.usd ?? 0;
      const currentLiq = current.liquidity?.usd ?? 0;
      return currentLiq > bestLiq ? current : best;
    }, pairs[0]);

    const chainId = bestPair.chainId ?? "unknown";
    const chainName = getChainName(chainId);
    const tokenName = bestPair.baseToken?.name ?? null;
    const tokenSymbol = bestPair.baseToken?.symbol ?? null;

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
      chainId,
      chainName,
      tokenName,
      tokenSymbol,
      priceUsd,
      priceChange24h,
      volume24h,
      liquidity,
      marketCap,
      fdv,
      trades24h: bestPair.txns?.h24 ?? null,
      dexUrl: bestPair.url ?? null,
      dexName: bestPair.dexId ?? null, // DEX identifier from DexScreener
      pairAddress: bestPair.pairAddress ?? null,
    };
  } catch (error) {
    console.error("Failed to fetch DexScreener data:", error);
    return null;
  }
}

/**
 * Fetch token data from DexScreener API for Base network only
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
    const tokenName = bestPair.baseToken?.name ?? null;
    const tokenSymbol = bestPair.baseToken?.symbol ?? null;

    return {
      priceUsd,
      priceChange24h,
      volume24h,
      liquidity,
      marketCap,
      fdv,
      trades24h: bestPair.txns?.h24 ?? null,
      dexUrl: bestPair.url ?? null,
      dexName: bestPair.dexId ?? null, // DEX identifier from DexScreener
      pairAddress: bestPair.pairAddress ?? null,
      tokenName,
      tokenSymbol,
    };
  } catch (error) {
    console.error("Failed to fetch DexScreener data:", error);
    return null;
  }
}

/**
 * Get human-readable chain name from chain ID
 */
function getChainName(chainId: string): string {
  const chainMap: Record<string, string> = {
    "1": "Ethereum",
    "eth": "Ethereum",
    "ethereum": "Ethereum",
    "56": "BSC",
    "bsc": "BSC",
    "137": "Polygon",
    "polygon": "Polygon",
    "42161": "Arbitrum",
    "arbitrum": "Arbitrum",
    "10": "Optimism",
    "optimism": "Optimism",
    "8453": "Base",
    "base": "Base",
    "43114": "Avalanche",
    "avalanche": "Avalanche",
    "250": "Fantom",
    "fantom": "Fantom",
    "100": "Gnosis",
    "gnosis": "Gnosis",
    "5000": "Mantle",
    "mantle": "Mantle",
    "5001": "Monad",
    "monad": "Monad",
  };
  return chainMap[chainId.toLowerCase()] ?? chainId;
}

/**
 * Check if a token exists on DexScreener (for Base network)
 */
export async function checkTokenExists(contractAddress: string): Promise<boolean> {
  const data = await fetchBaseTokenData(contractAddress);
  return data !== null;
}








