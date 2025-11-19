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

  // Run both lookups in parallel for speed (major performance improvement)
  const promises: Promise<void>[] = [];

  if (address.toLowerCase().startsWith("0x")) {
    promises.push(
      client.lookupUserByCustodyAddress({
        custodyAddress: address,
      }).then((response) => {
        seen.set(response.user.fid, response.user);
      }).catch((error) => {
        if (!isNotFoundError(error)) {
          throw new NeynarLookupError("Failed to lookup custody address", error);
        }
      })
    );
  }

  promises.push(
    client.fetchBulkUsersByEthOrSolAddress({
      addresses: [address],
      addressTypes: ["custody_address", "verified_address"],
    }).then((bulk) => {
      Object.values(bulk).forEach((users) => {
        users.forEach((user) => {
          if (!seen.has(user.fid)) {
            seen.set(user.fid, user);
          }
        });
      });
    }).catch((error) => {
      if (!isNotFoundError(error)) {
        throw new NeynarLookupError("Failed to lookup verified ETH address", error);
      }
    })
  );

  // Wait for all lookups with timeout
  try {
    await Promise.race([
      Promise.all(promises),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Neynar lookup timeout")), 5000)
      ),
    ]);
  } catch (error) {
    // If timeout or error, continue with what we have
    if (error instanceof Error && error.message === "Neynar lookup timeout") {
      console.warn(`[Neynar] Wallet lookup timeout for ${address}`);
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

  try {
    const url = `https://api.neynar.com/v2/farcaster/user/by_x_username/?x_username=${normalized}`;
    const apiKey = requireEnv(env.neynarApiKey, "NEYNAR_API_KEY");

    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "x-neynar-experimental": "true",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "failed to read body");
      console.error(
        `[X Handle Lookup] Neynar lookup error for ${normalized}: ${response.status} ${errorText}`,
      );
      return null;
    }

    const data = (await response.json()) as { users?: User[] };

    if (!data?.users?.length) {
      console.log(`[X Handle Lookup] No users found for ${normalized}`);
      return null;
    }

    // Just return the first user. No score filtering. No verification checks.
    // The API endpoint is authoritative - if it returns a user, that's the match.
    const user = data.users[0];
    console.log(
      `[X Handle Lookup] Found user: ${user.username} (fid: ${user.fid}) for ${normalized}`,
    );
    return user;
  } catch (error) {
    console.error(`[X Handle Lookup] Lookup failed for ${normalized}:`, error);
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

