import type { Cast } from "@neynar/nodejs-sdk/build/api";
import type { ClankerToken } from "../services/clanker";
import { fetchTokensByFid } from "../services/clanker";
import { fetchMostRecentCastForUser, searchCastsByKeyword } from "../services/neynar";
import { sortClankerTokens } from "./clankerEmbeds";

export async function safeFetchTokensByFid(fid: number): Promise<ClankerToken[]> {
  try {
    const tokens = await fetchTokensByFid(fid);
    return sortClankerTokens(tokens);
  } catch (error) {
    console.warn("Failed to fetch Clanker tokens by FID:", error);
    return [];
  }
}

export async function safeFetchMostRecentCast(fid: number): Promise<Cast | null> {
  try {
    return await fetchMostRecentCastForUser(fid);
  } catch (error) {
    console.warn("Failed to fetch most recent cast for user:", error);
    return null;
  }
}

export async function safeFetchEarliestCastByQuery(query: string): Promise<Cast | null> {
  try {
    const { firstMatch } = await searchCastsByKeyword(query, 0);
    return firstMatch ?? null;
  } catch (error) {
    console.warn("Failed to fetch earliest cast for query:", error);
    return null;
  }
}

