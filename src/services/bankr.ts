/**
 * Bankr API client for Base token launches.
 * Fetches token info including deployer and fee recipient (wallet, X, Farcaster).
 * API: https://api.bankr.bot/token-launches (requires X-API-Key)
 */

export interface BankrDeployer {
  walletAddress?: string | null;
  xUsername?: string | null;
  farcasterUsername?: string | null;
  farcaster?: string | null;
  fcUsername?: string | null;
}

export interface BankrLaunch {
  tokenAddress: string;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  status?: string;
  deployer?: BankrDeployer | null;
  feeRecipient?: BankrDeployer | null;
  imageUri?: string | null;
  poolId?: string | null;
  websiteUrl?: string | null;
  tweetUrl?: string | null;
}

interface BankrApiResponse {
  launches?: BankrLaunch[];
}

const BANKR_API_BASE = "https://api.bankr.bot";
const PAGE_SIZE = 50;
const MAX_PAGES = 100; // 5000 launches (older tokens need more pages)

function getApiKey(): string | null {
  return process.env.BANKR_API_KEY?.trim() || null;
}

/** Try direct endpoint first (if Bankr supports it) */
async function tryDirectLookup(
  apiKey: string,
  normalized: string,
  signal: AbortSignal | undefined,
): Promise<BankrLaunch | null> {
  const attempts = [
    `${BANKR_API_BASE}/token-launches/${normalized}`,
    `${BANKR_API_BASE}/launches/${normalized}`,
    `${BANKR_API_BASE}/token-launches?tokenAddress=${normalized}`,
  ];
  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": apiKey, Accept: "application/json" },
        signal,
      });
      if (!res.ok) continue;
      const json = await res.json();
      const launch = Array.isArray(json) ? json[0] : json?.launch ?? json?.launches?.[0] ?? json;
      if (launch?.tokenAddress?.toLowerCase() === normalized) return launch;
      if (launch && typeof launch === "object" && !Array.isArray(launch)) return launch;
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchBankrTokenByAddress(
  tokenAddress: string,
  timeoutMs = 15000,
): Promise<BankrLaunch | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const normalized = tokenAddress.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/i.test(normalized)) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const direct = await tryDirectLookup(apiKey, normalized, controller.signal);
    if (direct) {
      clearTimeout(timeoutId);
      return direct;
    }

    let offset = 0;
    while (offset < PAGE_SIZE * MAX_PAGES) {
      const url = `${BANKR_API_BASE}/token-launches?limit=${PAGE_SIZE}&offset=${offset}`;
      const res = await fetch(url, {
        headers: { "X-API-Key": apiKey, Accept: "application/json" },
        signal: controller.signal,
      });

      if (!res.ok) break;
      const json = (await res.json()) as BankrApiResponse;
      const batch = json.launches?.filter((l) => l.status === "deployed") ?? [];

      for (const l of batch) {
        if (l.tokenAddress?.toLowerCase() === normalized) {
          clearTimeout(timeoutId);
          return l;
        }
      }

      if (batch.length < PAGE_SIZE) break;
      offset += batch.length;
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[Bankr] Lookup timeout for ${tokenAddress}`);
    } else {
      console.warn(`[Bankr] Lookup failed for ${tokenAddress}:`, err);
    }
  } finally {
    clearTimeout(timeoutId);
  }

  return null;
}
