import type { User } from "@neynar/nodejs-sdk/build/api";
import type { ClankerToken } from "../services/clanker";
import { sortClankerTokens } from "./clankerEmbeds";
import type { Cast } from "@neynar/nodejs-sdk/build/api";

function normalizeAddress(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.trim().toLowerCase();
}

function normalizeUsername(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.replace(/^@/, "").toLowerCase();
}

function collectUserAddresses(user: User): Set<string> {
  const addresses = new Set<string>();
  const custody = normalizeAddress(user.custody_address);
  if (custody) {
    addresses.add(custody);
  }
  const ethAddresses = user.verified_addresses?.eth_addresses ?? [];
  ethAddresses.forEach((address) => {
    const normalized = normalizeAddress(address);
    if (normalized) {
      addresses.add(normalized);
    }
  });
  return addresses;
}

function hasUserMentionedToken(token: ClankerToken, user: User, casts: Cast[]): boolean {
  if (casts.length === 0) {
    return false;
  }
  const username = normalizeUsername(user.username);
  const address = normalizeAddress(token.contract_address);
  return casts.some((cast) => {
    const text = cast.text?.toLowerCase() ?? "";
    if (username && text.includes(username)) {
      return true;
    }
    if (address && text.includes(address)) {
      return true;
    }
    const handles = token.related?.user?.username
      ? [normalizeUsername(token.related.user.username)]
      : [];
    return handles.some((handle) => handle && text.includes(handle));
  });
}

function isTokenDeployedByUser(
  token: ClankerToken,
  user: User,
  addresses: Set<string>,
): boolean {
  const tokenUsername = normalizeUsername(token.related?.user?.username);
  const userUsername = normalizeUsername(user.username);
  if (tokenUsername && userUsername && tokenUsername === userUsername) {
    return true;
  }
  const msgSender = normalizeAddress(token.msg_sender);
  if (msgSender && addresses.has(msgSender)) {
    return true;
  }
  return false;
}

export interface SplitClankerTokensResult {
  deployed: ClankerToken[];
  associated: ClankerToken[];
}

export function splitClankerTokens(
  tokens: ClankerToken[],
  user: User,
): SplitClankerTokensResult {
  const addresses = collectUserAddresses(user);
  const deployed: ClankerToken[] = [];
  const associated: ClankerToken[] = [];

  tokens.forEach((token) => {
    if (isTokenDeployedByUser(token, user, addresses)) {
      deployed.push(token);
    } else {
      associated.push(token);
    }
  });

  const sortedDeployed = sortClankerTokens(deployed);
  const sortedAssociated = sortClankerTokens(associated);

  return {
    deployed: sortedDeployed,
    associated: sortedAssociated.reverse(),
  };
}
