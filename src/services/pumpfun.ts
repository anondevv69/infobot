import { env } from "../config";

const BITQUERY_ENDPOINT = "https://graphql.bitquery.io";

const PUMPFUN_TOKEN_QUERY = `
  query PumpFunToken($mint: String!) {
    solana(network: solana) {
      pumpFun: pumpFunTokens(
        limit: { count: 1 }
        orderBy: { descending: time }
        where: { token: { mintAddress: { is: $mint } } }
      ) {
        token {
          mintAddress
          name
          symbol
          imageUrl
        }
        creator {
          address
        }
        time
        bondingCurveProgress
        price {
          value
          currency
        }
        marketCap
        liquidity
      }
    }
  }
` as const;

interface PumpFunApiResponse {
  data?: {
    solana?: {
      pumpFun?: Array<{
        token?: {
          mintAddress?: string | null;
          name?: string | null;
          symbol?: string | null;
          imageUrl?: string | null;
        } | null;
        creator?: {
          address?: string | null;
        } | null;
        time?: string | null;
        bondingCurveProgress?: number | null;
        price?: {
          value?: number | null;
          currency?: string | null;
        } | null;
        marketCap?: number | null;
        liquidity?: number | null;
      }> | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

export interface PumpFunToken {
  mint: string;
  name?: string | null;
  symbol?: string | null;
  imageUrl?: string | null;
  creatorAddress?: string | null;
  createdAt?: string | null;
  bondingCurveProgress?: number | null;
  price?: {
    value?: number | null;
    currency?: string | null;
  };
  marketCap?: number | null;
  liquidity?: number | null;
}

function normalizeMintCandidates(mint: string): string[] {
  const trimmed = mint.trim();
  if (!trimmed) {
    return [];
  }
  const candidates = new Set<string>();
  candidates.add(trimmed);
  if (trimmed.toLowerCase().endsWith("pump")) {
    candidates.add(trimmed.slice(0, -4));
  }
  return Array.from(candidates);
}

export async function fetchPumpFunToken(mint: string): Promise<PumpFunToken | null> {
  if (!env.bitqueryApiKey) {
    console.warn("PumpFun lookup skipped: BITQUERY_API_KEY is not set");
    return null;
  }

  const candidates = normalizeMintCandidates(mint);
  if (candidates.length === 0) {
    return null;
  }

  for (const candidate of candidates) {
    const token = await executePumpFunQuery(candidate);
    if (token) {
      return token;
    }
  }

  return null;
}

async function executePumpFunQuery(mint: string): Promise<PumpFunToken | null> {
  const apiKey = env.bitqueryApiKey as string;
  try {
    const response = await fetch(BITQUERY_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        query: PUMPFUN_TOKEN_QUERY,
        variables: { mint },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "failed to read body");
      console.warn(
        `PumpFun lookup error (${response.status} ${response.statusText}): ${text}`,
      );
      return null;
    }

    const json = (await response.json()) as PumpFunApiResponse;
    if (json.errors?.length) {
      console.warn(
        "PumpFun lookup GraphQL errors:",
        json.errors.map((error) => error.message).join("; "),
      );
      return null;
    }

    const entry = json.data?.solana?.pumpFun?.[0];
    if (!entry?.token?.mintAddress) {
      return null;
    }

    return {
      mint: entry.token.mintAddress,
      name: entry.token.name ?? null,
      symbol: entry.token.symbol ?? null,
      imageUrl: entry.token.imageUrl ?? null,
      creatorAddress: entry.creator?.address ?? null,
      createdAt: entry.time ?? null,
      bondingCurveProgress: entry.bondingCurveProgress ?? null,
      price: entry.price ?? undefined,
      marketCap: entry.marketCap ?? null,
      liquidity: entry.liquidity ?? null,
    };
  } catch (error) {
    console.error("PumpFun lookup failed:", error);
    return null;
  }
}

