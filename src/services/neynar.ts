import {
  Configuration,
  NeynarAPIClient,
} from "@neynar/nodejs-sdk";
import type {
  Cast,
  EmbedUrlMetadata,
  User,
} from "@neynar/nodejs-sdk/build/api";
import type { AxiosError } from "axios";
import { env, requireEnv } from "../config";

const configuration = new Configuration({
  apiKey: requireEnv(env.neynarApiKey, "NEYNAR_API_KEY"),
});

const client = new NeynarAPIClient(configuration);

export class NeynarLookupError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "NeynarLookupError";
  }
}

export async function findUserByWallet(address: string): Promise<User | null> {
  const seen = new Map<number, User>();

  if (address.toLowerCase().startsWith("0x")) {
    try {
      const response = await client.lookupUserByCustodyAddress({
        custodyAddress: address,
      });
      seen.set(response.user.fid, response.user);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw new NeynarLookupError("Failed to lookup custody address", error);
      }
    }
  }

  try {
    const bulk = await client.fetchBulkUsersByEthOrSolAddress({
      addresses: [address],
      addressTypes: ["custody_address", "verified_address"],
    });
    Object.values(bulk).forEach((users) => {
      users.forEach((user) => {
        if (!seen.has(user.fid)) {
          seen.set(user.fid, user);
        }
      });
    });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw new NeynarLookupError("Failed to lookup verified ETH address", error);
    }
  }

  const [user] = seen.values();
  return user ?? null;
}

export async function findUserByUsername(username: string): Promise<User | null> {
  try {
    const response = await client.lookupUserByUsername({
      username,
    });
    return response.user;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw new NeynarLookupError("Failed to lookup Farcaster username", error);
  }
}

export async function findUserByXHandle(handle: string): Promise<User | null> {
  const normalized = handle.replace(/^@/, "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const url = new URL(
    "https://api.neynar.com/v2/farcaster/user/by_x_username/",
  );
  url.searchParams.set("x_username", normalized);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "api-key": requireEnv(env.neynarApiKey, "NEYNAR_API_KEY"),
      "x-neynar-experimental": "true", // Always enable experimental for X handle lookups
    };

    const response = await fetch(url, { headers });

    if (response.status === 404) {
      return null;
    }

    if (response.status === 401) {
      console.warn(
        "Failed to lookup user by X handle due to unauthorized response. Check API plan and key.",
      );
      return null;
    }

    if (response.status === 402) {
      // 402 Payment Required - this endpoint requires Enterprise tier or micropayments
      // Silently fall back to username lookup (handled in xAccount.ts)
      return null;
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "failed to read body");
      // Only log non-402 errors (402 is expected and has a fallback)
      if (response.status !== 402) {
        console.warn(
          `Failed to lookup user by X handle ${normalized}: ${response.status} ${body}`,
        );
      }
      return null;
    }

    const payload = (await response.json()) as { users?: User[] };
    const [user] = payload.users ?? [];
    return user ?? null;
  } catch (error) {
    console.warn("Failed to lookup user by X handle", error);
    return null;
  }
}

function isNotFoundError(error: unknown): boolean {
  if (NeynarAPIClient.isApiErrorResponse(error)) {
    return error.response.status === 404;
  }
  const axiosError = error as AxiosError;
  return axiosError?.response?.status === 404;
}

export async function findCastByUrl(url: string): Promise<Cast | null> {
  try {
    const response = await client.lookupCastByHashOrUrl({
      identifier: url,
      type: "url",
    });
    return response.cast;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw new NeynarLookupError("Failed to lookup cast by URL", error);
  }
}

export async function fetchEmbeddedUrlMetadata(
  url: string,
): Promise<EmbedUrlMetadata | null> {
  try {
    const response = await client.fetchEmbeddedUrlMetadata({
      url,
    });
    return response.metadata;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw new NeynarLookupError("Failed to fetch embedded URL metadata", error);
  }
}

export interface CastSearchResults {
  firstMatch?: Cast;
  recent: Cast[];
}

export async function fetchMostRecentCastForUser(fid: number): Promise<Cast | null> {
  try {
    const response = await client.fetchCastsForUser({
      fid,
      limit: 1,
      includeReplies: true,
    });
    return response.casts[0] ?? null;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw new NeynarLookupError("Failed to fetch most recent cast for user", error);
  }
}

export async function searchCastsByKeyword(
  keyword: string,
  recentLimit = 2,
): Promise<CastSearchResults> {
  try {
    const [firstResponse, recentResponse] = await Promise.all([
      client.searchCasts({
        q: keyword,
        sortType: "chron",
        limit: 1,
      }),
      client.searchCasts({
        q: keyword,
        sortType: "desc_chron",
        limit: Math.max(recentLimit + 1, 3),
      }),
    ]);

    const firstMatch = firstResponse.result.casts[0];
    const recents: Cast[] = [];
    for (const cast of recentResponse.result.casts) {
      if (firstMatch && cast.hash === firstMatch.hash) {
        continue;
      }
      recents.push(cast);
      if (recents.length >= recentLimit) {
        break;
      }
    }

    return { firstMatch, recent: recents };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { firstMatch: undefined, recent: [] };
    }
    throw new NeynarLookupError("Failed to search casts", error);
  }
}

