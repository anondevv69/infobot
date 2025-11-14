import type { User } from "@neynar/nodejs-sdk/build/api";
import type { ZoraLookupResult } from "../services/zora";

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

export function isSummaryAssociatedWithUser(
  user: User,
  summary: ZoraLookupResult | null | undefined,
): boolean {
  if (!summary?.profile) {
    return false;
  }

  const normalizedUser = normalizeUsername(user.username);
  const normalizedProfileFarcaster = normalizeUsername(summary.profile.farcasterHandle);
  if (normalizedUser && normalizedProfileFarcaster && normalizedUser === normalizedProfileFarcaster) {
    return true;
  }

  const userAddresses = new Set<string>();
  if (user.custody_address) {
    const normalized = normalizeAddress(user.custody_address);
    if (normalized) {
      userAddresses.add(normalized);
    }
  }
  const ethAddresses = user.verified_addresses?.eth_addresses ?? [];
  ethAddresses.forEach((address) => {
    const normalized = normalizeAddress(address);
    if (normalized) {
      userAddresses.add(normalized);
    }
  });
  const solAddresses = user.verified_addresses?.sol_addresses ?? [];
  solAddresses.forEach((address) => {
    const normalized = normalizeAddress(address);
    if (normalized) {
      userAddresses.add(normalized);
    }
  });

  if (userAddresses.size === 0) {
    return false;
  }

  const profileAddresses = summary.profile.walletAddresses.map(normalizeAddress).filter(Boolean);
  return profileAddresses.some((address) => address && userAddresses.has(address));
}

export function isSummaryAssociatedWithAddress(
  summary: ZoraLookupResult | null | undefined,
  address: string,
): boolean {
  if (!summary?.profile) {
    return false;
  }
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return false;
  }
  return summary.profile.walletAddresses
    .map(normalizeAddress)
    .some((value) => value === normalized);
}
