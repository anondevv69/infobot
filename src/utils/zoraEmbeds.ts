import { EmbedBuilder } from "discord.js";
import type {
  ZoraCoin,
  ZoraCoinSummary,
  ZoraProfileSummary,
  ZoraLookupResult,
} from "../services/zora";
import { applyBranding } from "./branding";
import { buildFarcasterProfileUrl, buildCastUrl } from "./farcasterLinks";
import type { Cast, User } from "@neynar/nodejs-sdk/build/api";
import type { ClankerDisplayEntry } from "./clankerEmbeds";
import { formatClankerTokenDetails } from "./clankerEmbeds";
import { splitEmbedIntoPages } from "./pagination";

const BASE_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;

export function getZoraCoinUrl(coin: ZoraCoin): string | null {
  if (!coin.address) {
    return null;
  }
  const slug = buildChainSlug(coin.chainId);
  return `https://zora.co/coin/${slug}:${coin.address}`;
}

import type { TokenMetrics } from "../services/dexscreener";

interface BuildEmbedOptions {
  title?: string;
  profile?: ZoraProfileSummary | null;
  creatorCoin?: ZoraCoin | null;
  latestCoin?: ZoraCoin | null;
  farcasterUser?: User | null;
  clankerEntries?: ClankerDisplayEntry[] | null;
  excludeCreatorField?: boolean;
  includeCreatorWallets?: boolean;
  dexScreenerMetrics?: TokenMetrics | null;
}

export function buildZoraCoinEmbed(
  summary: ZoraCoinSummary,
  options?: BuildEmbedOptions,
): EmbedBuilder {
  const { coin } = summary;
  const profile = options?.profile ?? null;
  const creatorCoin = options?.creatorCoin ?? null;
  const farcasterUser = options?.farcasterUser ?? null;
  const titlePrefix = summary.isCreatorCoin
    ? "Creator Coin"
    : options?.title ?? "Zora Coin";
  const title = buildTitle(coin);
  const description = formatDescription(coin.description);

  const embed = new EmbedBuilder()
    .setColor(summary.isCreatorCoin ? 0x1d4ed8 : 0x2563eb)
    .setTitle(`${titlePrefix} • ${title}`)
    .setDescription(description);

  const url = getZoraCoinUrl(coin);
  if (url) {
    embed.setURL(url);
  }

  if (coin.mediaContent?.previewImage?.medium) {
    embed.setThumbnail(coin.mediaContent.previewImage.medium);
  } else if (coin.mediaContent?.previewImage?.small) {
    embed.setThumbnail(coin.mediaContent.previewImage.small);
  }

  const deployed = coin.createdAt ? formatDate(coin.createdAt) : "Unknown";

  const detailsLines = [
    `**Chain / Deployed:** ${formatChainName(coin.chainId)} • ${deployed}`,
    `**Symbol:** ${coin.symbol ?? "Unknown"}`,
    `**Name:** ${coin.name ?? "Unknown"}`,
  ];

  // Add market cap if available (from Zora API or DexScreener fallback)
  let marketCapValue: number | null = null;
  if (coin.marketCap) {
    const parsed = parseFloat(coin.marketCap);
    if (!isNaN(parsed) && parsed > 0) {
      marketCapValue = parsed;
    }
  }
  // Fallback to DexScreener if Zora doesn't have market cap
  if (!marketCapValue && options?.dexScreenerMetrics?.marketCap) {
    marketCapValue = options.dexScreenerMetrics.marketCap;
  }
  if (marketCapValue) {
    const formattedMC = formatCompactNumber(marketCapValue);
    detailsLines.push(`**Market Cap:** ${formattedMC}`);
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "Token Details",
      value: detailsLines.join("\n"),
      inline: false,
    },
    {
      name: "Contract",
      value: formatAddress(coin.address, coin.chainId),
      inline: false,
    },
  ];

  // Get market cap for creator coin
  let creatorCoinMarketCap: number | null = null;
  if (creatorCoin?.marketCap) {
    const parsed = parseFloat(creatorCoin.marketCap);
    if (!isNaN(parsed) && parsed > 0) {
      creatorCoinMarketCap = parsed;
    }
  }
  // Fallback to DexScreener if available
  if (!creatorCoinMarketCap && options?.dexScreenerMetrics?.marketCap && creatorCoin?.address) {
    creatorCoinMarketCap = options.dexScreenerMetrics.marketCap;
  }

  const creatorCoinField = buildCreatorCoinField(
    profile,
    summary.isCreatorCoin,
    creatorCoin,
    creatorCoinMarketCap,
  );
  if (creatorCoinField) {
    fields.push(creatorCoinField);
  }

  const latestCoin = options?.latestCoin;
  if (summary.isCreatorCoin && latestCoin) {
    const coinUrl = getZoraCoinUrl(latestCoin);
    const label = latestCoin.name ?? latestCoin.symbol ?? latestCoin.address;
    const truncatedLabel = label.length > 50 ? `${label.slice(0, 47)}...` : label;
    const value = coinUrl
      ? `[${truncatedLabel}](${coinUrl})\n${formatAddress(latestCoin.address, latestCoin.chainId)}`
      : `${truncatedLabel}\n${formatAddress(latestCoin.address, latestCoin.chainId)}`;
    fields.push({
      name: "Latest Zora Coin",
      value,
      inline: false,
    });
  }

  const socialsField = buildSocialsField(profile, coin, {
    excludeFarcaster: Boolean(farcasterUser),
    farcasterUser: farcasterUser ?? undefined,
  });
  if (socialsField) {
    fields.push(socialsField);
  }

  // Only add creator field if not excluded (for pagination)
  if (!options?.excludeCreatorField) {
    const creatorField = buildCreatorField(coin, farcasterUser, options?.includeCreatorWallets ?? false, profile);
    if (creatorField) {
      fields.push(creatorField);
    }
  }

  const clankerEntries = options?.clankerEntries ?? [];
  if (clankerEntries && clankerEntries.length > 0) {
    const clankerLines = clankerEntries.map(({ label, token }) => {
      const details = formatClankerTokenDetails(token);
      return `**${label}:**\n${details}`;
    });
    fields.push({
      name: "Clanker Deployments",
      value: clankerLines.join("\n\n"),
      inline: false,
    });
  }

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  applyBranding(embed, "zora coin", summary.isCreatorCoin ? "creator coin" : null);

  return embed;
}

function buildTitle(coin: ZoraCoin): string {
  if (coin.symbol && coin.name) {
    return `${coin.symbol} (${coin.name})`;
  }
  if (coin.symbol) {
    return coin.symbol;
  }
  if (coin.name) {
    return coin.name;
  }
  return shortenAddress(coin.address);
}

function formatDescription(value?: string | null): string {
  if (!value) {
    return "_No description provided._";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "_No description provided._";
}

function formatChainName(chainId?: number | null): string {
  if (chainId === BASE_CHAIN_ID || chainId === null || chainId === undefined) {
    return "Base";
  }
  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    return "Base Sepolia";
  }
  return chainId?.toString() ?? "Unknown";
}

export function buildZoraProfileEmbed(summary: ZoraLookupResult): EmbedBuilder {
  const { profile, latestCoin } = summary;
  const title = profile.handle ? `@${profile.handle} • Zora Profile` : "Zora Profile";
  
  // Build Zora profile URL for the embed title
  const profileUrl = profile.handle && !profile.handle.startsWith("0x") && profile.handle.length < 50
    ? `https://zora.co/@${profile.handle}`
    : profile.walletAddresses && profile.walletAddresses.length > 0
    ? `https://zora.co/profile/${profile.walletAddresses[0]}`
    : null;

  const embed = new EmbedBuilder()
    .setColor(0x4338ca)
    .setTitle(title);
  
  // Make title clickable if we have a valid profile URL
  if (profileUrl) {
    embed.setURL(profileUrl);
  }

  if (profile.avatarUrl) {
    embed.setThumbnail(profile.avatarUrl);
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (profile.handle) {
    // Don't add @ prefix for wallet addresses (handles starting with 0x)
    const handleValue = profile.handle.startsWith("0x") 
      ? profile.handle 
      : `@${profile.handle}`;
    // Make handle clickable if it's a valid Zora handle (not a wallet address)
    const isValidHandle = profile.handle && !profile.handle.startsWith("0x") && profile.handle.length < 50;
    const handleDisplay = isValidHandle 
      ? `[${handleValue}](https://zora.co/@${profile.handle})`
      : handleValue;
    fields.push({ name: "Handle", value: handleDisplay, inline: true });
  }

  const farcasterLink =
    profile.socials.find((link) => link.platform === "Farcaster") ??
    (summary.profile.farcasterHandle
      ? {
          platform: "Farcaster",
          label: `fc/${summary.profile.farcasterHandle.replace(/^@/, "")}`,
          url: buildFarcasterProfileUrl(summary.profile.farcasterHandle),
        }
      : null);
  if (farcasterLink) {
    fields.push({
      name: "Farcaster",
      value: `[${farcasterLink.label}](${farcasterLink.url})`,
      inline: true,
    });
  }

  const xLink = profile.socials.find((link) => link.platform === "X");
  if (xLink) {
    fields.push({
      name: "X",
      value: `[${xLink.label}](${xLink.url})`,
      inline: true,
    });
  }

  const creatorCoinAddress = profile.creatorCoinAddress;
  let creatorCoinValue = "None";
  if (creatorCoinAddress) {
    // Link to Zora profile instead of contract address
    const profileUrl = profile.handle 
      ? `https://zora.co/@${profile.handle}`
      : profile.walletAddresses && profile.walletAddresses.length > 0
      ? `https://zora.co/profile/${profile.walletAddresses[0]}`
      : null;
    const addressDisplay = formatAddress(creatorCoinAddress, BASE_CHAIN_ID) ?? creatorCoinAddress;
    creatorCoinValue = profileUrl 
      ? `[${creatorCoinAddress.slice(0, 10)}...${creatorCoinAddress.slice(-8)}](${profileUrl})\n${addressDisplay}`
      : addressDisplay;
  }
  fields.push({
    name: "Creator Coin",
    value: creatorCoinValue,
    inline: true,
  });

  if (latestCoin) {
    const coinUrl = getZoraCoinUrl(latestCoin.coin);
    const label = latestCoin.coin.name ?? latestCoin.coin.symbol ?? latestCoin.coin.address;
    const value = coinUrl
      ? `[${label}](${coinUrl})\n${formatAddress(latestCoin.coin.address, latestCoin.coin.chainId)}`
      : `${label}\n${formatAddress(latestCoin.coin.address, latestCoin.coin.chainId)}`;
    fields.push({ name: "Latest Coin", value, inline: true });
  } else {
    fields.push({ name: "Latest Coin", value: "None", inline: true });
  }

  if (profile.walletAddresses.length > 0) {
    const preview = profile.walletAddresses
      .slice(0, 2)
      .map((address) => formatAddress(address, BASE_CHAIN_ID) ?? address)
      .join(" \u2022 ");
    const remaining = profile.walletAddresses.length - 2;
    const walletValue = remaining > 0 ? `${preview} • …+${remaining}` : preview;
    fields.push({ name: "Wallets", value: walletValue, inline: true });
  } else {
    fields.push({ name: "Wallets", value: "None", inline: true });
  }

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  applyBranding(embed, "zora profile");

  return embed;
}

function getLatestCreatedCoin(summary: ZoraLookupResult): ZoraCoin | null {
  if (!summary.createdCoins || summary.createdCoins.length === 0) {
    return null;
  }
  return [...summary.createdCoins].sort((a, b) => {
    const aDate = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bDate = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bDate - aDate;
  })[0];
}

export function buildCreatorField(
  coin: ZoraCoin,
  farcasterUser?: User | null,
  includeWallets = false,
  zoraProfile?: { farcasterHandle?: string | null } | null,
): { name: string; value: string; inline: boolean } | null {
  const lines: string[] = [];
  const creatorAddress = coin.creatorAddress ?? null;
  
  // Only show Farcaster if:
  // 1. We have a verified Farcaster user object (farcasterUser)
  // 2. AND it's explicitly linked in the Zora profile (zoraProfile?.farcasterHandle)
  // This prevents showing Farcaster accounts that aren't actually linked to the Zora profile
  const hasZoraFarcasterLink = zoraProfile?.farcasterHandle || coin.creatorProfile?.socialAccounts?.farcaster?.username;
  if (farcasterUser?.username && hasZoraFarcasterLink) {
    const normalized = farcasterUser.username.replace(/^@/, "");
    lines.push(`**Farcaster:** [@${normalized}](${buildFarcasterProfileUrl(normalized)})`);
  }

  if (creatorAddress) {
    lines.push(`**Deploy Address:**\n${formatAddress(creatorAddress, coin.chainId)}`);
  }

  // Only include wallet details if includeWallets is true (for page 2)
  if (farcasterUser && includeWallets) {
    lines.push(`**FID:** ${farcasterUser.fid}`);
    lines.push(
      `**Followers / Following:** ${farcasterUser.follower_count.toLocaleString()} / ${farcasterUser.following_count.toLocaleString()}`,
    );
    if (farcasterUser.custody_address) {
      lines.push(`**Custody:**\n${formatAddress(farcasterUser.custody_address)}`);
    }
    const ethAddresses = farcasterUser.verified_addresses?.eth_addresses ?? [];
    if (ethAddresses.length > 0) {
      lines.push(`**Verified ETH:**\n${formatAddressList(ethAddresses)}`);
    }
    const solAddresses = farcasterUser.verified_addresses?.sol_addresses ?? [];
    if (solAddresses.length > 0) {
      lines.push(`**Verified SOL:**\n${formatAddressList(solAddresses)}`);
    }
  }

  if (lines.length === 0) {
    return null;
  }

  return {
    name: "Creator",
    value: lines.join("\n"),
    inline: false,
  };
}

function buildSocialsField(
  profile: ZoraProfileSummary | null,
  coin: ZoraCoin,
  options?: { excludeFarcaster?: boolean; farcasterUser?: User },
): { name: string; value: string; inline: boolean } | null {
  let entries = collectSocialEntries(profile, coin, options?.farcasterUser);
  if (options?.excludeFarcaster) {
    entries = entries.filter(
      (entry) => !entry.toLowerCase().includes("warpcast.com"),
    );
  }
  if (entries.length === 0) {
    return null;
  }
  return {
    name: "Socials",
    value: entries.join(" • "),
    inline: false,
  };
}

export function buildCreatorCoinField(
  profile: ZoraProfileSummary | null,
  isCreatorCoin: boolean,
  creatorCoin?: ZoraCoin | null,
  marketCap?: number | null,
): { name: string; value: string; inline: boolean } | null {
  if (isCreatorCoin) {
    return null;
  }
  const creatorCoinAddress = creatorCoin?.address ?? profile?.creatorCoinAddress;
  if (!creatorCoinAddress) {
    return {
      name: "Creator Coin",
      value: "None",
      inline: false,
    };
  }
  const formatted = formatCoinReference(creatorCoin ?? null, creatorCoinAddress, marketCap, profile);
  let title = "Creator Coin";
  if (marketCap != null && marketCap > 0) {
    const formattedMC = formatCompactNumber(marketCap);
    title = `Creator Coin • MC: ${formattedMC}`;
  }
  return {
    name: title,
    value: formatted,
    inline: false,
  };
}

function collectSocialEntries(
  profile: ZoraProfileSummary | null,
  coin: ZoraCoin,
  farcasterUser?: User,
): string[] {
  const entries: string[] = [];
  const seen = new Set<string>();

  const addEntry = (label?: string | null, url?: string | null, followerCount?: number | null) => {
    if (!label || !url) {
      return;
    }
    const normalizedUrl = url.trim();
    let normalizedLabel = label.trim();
    if (!normalizedUrl || !normalizedLabel) {
      return;
    }
    const key = normalizedUrl.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    if (followerCount !== null && followerCount !== undefined) {
      normalizedLabel = `${normalizedLabel} (${followerCount.toLocaleString()})`;
    }
    entries.push(`[${normalizedLabel}](${normalizedUrl})`);
  };

  (profile?.socials ?? []).forEach((link) => addEntry(link.label, link.url));

  const socialAccounts = coin.creatorProfile?.socialAccounts;
  if (socialAccounts?.farcaster?.username) {
    const handle = socialAccounts.farcaster.username.replace(/^@/, "");
    const followerCount = socialAccounts.farcaster.followerCount ?? farcasterUser?.follower_count;
    addEntry(`fc/${handle}`, buildFarcasterProfileUrl(handle), followerCount);
  }
  if (socialAccounts?.twitter?.username) {
    const handle = socialAccounts.twitter.username.replace(/^@/, "");
    addEntry(handle, `https://x.com/${handle}`);
  }
  if (socialAccounts?.tiktok?.username) {
    const handle = socialAccounts.tiktok.username.replace(/^@/, "");
    addEntry(handle, `https://www.tiktok.com/@${handle}`);
  }
  if (socialAccounts?.instagram?.username) {
    const handle = socialAccounts.instagram.username.replace(/^@/, "");
    addEntry(handle, `https://www.instagram.com/${handle}/`);
  }

  return entries;
}

function formatCoinReference(
  coin: ZoraCoin | null,
  fallbackAddress: string,
  marketCap?: number | null,
  profile?: ZoraProfileSummary | null,
): string {
  const label =
    coin?.name ?? coin?.symbol ?? shortenAddress(fallbackAddress) ?? fallbackAddress;
  
  // For creator coin, link to the Zora profile instead of the coin contract
  let url: string | null = null;
  if (profile) {
    // Build Zora profile URL
    if (profile.handle) {
      url = `https://zora.co/@${profile.handle}`;
    } else if (profile.walletAddresses && profile.walletAddresses.length > 0) {
      // Fallback to wallet-based profile URL
      url = `https://zora.co/profile/${profile.walletAddresses[0]}`;
    }
  }
  
  // If no profile URL, fall back to coin URL (for non-creator coin references)
  if (!url && coin) {
    url = getZoraCoinUrl(coin);
  }
  
  const addressLink = formatAddress(
    coin?.address ?? fallbackAddress,
    coin?.chainId ?? BASE_CHAIN_ID,
  );
  return url ? `[${label}](${url})\n${addressLink}` : `${label}\n${addressLink}`;
}

export function formatAddress(address?: string | null, chainId?: number | null): string {
  if (!address) {
    return "N/A";
  }
  return ["```", address, "```"].join("\n");
}

function formatAddressList(addresses: string[]): string {
  if (addresses.length === 0) {
    return "None";
  }
  return ["```", ...addresses, "```"].join("\n");
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function shortenAddress(address?: string | null): string {
  if (!address) {
    return "Unknown";
  }
  const normalized = address.trim();
  if (normalized.length <= 10) {
    return normalized;
  }
  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatUsd(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (numeric >= 1) {
    return `$${numeric.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  if (numeric >= 0.01) {
    return `$${numeric.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  }
  return `$${numeric.toPrecision(2)}`;
}

function buildFarcasterLink(handle: string): string {
  const normalized = handle.replace(/^@/, "");
  const url = buildFarcasterProfileUrl(normalized);
  return `[fc/${normalized}](${url})`;
}

function buildChainSlug(chainId?: number | null): string {
  if (chainId === BASE_CHAIN_ID || chainId === null || chainId === undefined) {
    return "base";
  }
  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    return "base-sepolia";
  }
  return chainId?.toString() ?? "base";
}

type EmbedField = { name: string; value: string; inline: boolean };

function createEmptyField(): EmbedField {
  return { name: "\u200B", value: "\u200B", inline: true };
}

function padInlineFields(fields: EmbedField[], columns = 2): EmbedField[] {
  const padded = [...fields];
  if (padded.length === 0) {
    return padded;
  }
  const remainder = padded.length % columns;
  if (remainder === 0) {
    return padded;
  }
  for (let i = 0; i < columns - remainder; i += 1) {
    padded.push(createEmptyField());
  }
  return padded;
}

function formatContractBlock(address?: string | null, fallback = "Unknown"): string {
  if (!address) {
    return fallback;
  }
  return ["```", address, "```"].join("\n");
}

export async function appendZoraSummaryFields(
  embed: EmbedBuilder,
  summary: ZoraLookupResult | null | undefined,
  options?: { inline?: boolean; latestCast?: Cast | null; skipSocials?: boolean },
): Promise<void> {
  const profile = summary?.profile;
  const latestCast = options?.latestCast ?? null;

  if (!profile && !latestCast) {
    return;
  }

  const zoraLines: string[] = [];

  if (profile?.creatorCoinAddress) {
    // Fetch market cap for creator coin
    let creatorCoinMarketCap: number | null = null;
    const creatorCoin = summary?.createdCoins?.find(
      (c) => c.address?.toLowerCase() === profile.creatorCoinAddress?.toLowerCase()
    );
    if (creatorCoin?.marketCap) {
      const parsed = parseFloat(creatorCoin.marketCap);
      if (!isNaN(parsed) && parsed > 0) {
        creatorCoinMarketCap = parsed;
      }
    }
    // Fallback to DexScreener for Base chain
    if (!creatorCoinMarketCap && profile.creatorCoinAddress && (creatorCoin?.chainId === 8453 || creatorCoin?.chainId === BASE_CHAIN_ID || !creatorCoin)) {
      try {
        const { fetchBaseTokenData } = await import("../services/dexscreener");
        const metrics = await fetchBaseTokenData(profile.creatorCoinAddress);
        creatorCoinMarketCap = metrics?.marketCap ?? null;
      } catch (error) {
        // Silently fail
      }
    }
    
    // Highlight creator coin prominently
    let creatorCoinTitle = "⭐ Creator Coin";
    if (creatorCoinMarketCap != null && creatorCoinMarketCap > 0) {
      const formattedMC = formatCompactNumber(creatorCoinMarketCap);
      creatorCoinTitle = `⭐ Creator Coin • MC: ${formattedMC}`;
    }
    zoraLines.push(`**${creatorCoinTitle}:**\n${formatContractBlock(profile.creatorCoinAddress)}`);
  }

  // Prefer showing latest created coin over latest coin (which might be a purchase)
  const latestCreatedCoin = summary ? getLatestCreatedCoin(summary) : null;
  const coinToShow = latestCreatedCoin ?? summary?.latestCoin?.coin;
  const coinSource = summary?.latestCoin?.source; // "created" or "holding"
  
  // Don't show latest coin if it's the same as creator coin (already shown above)
  const isCreatorCoin = coinToShow && profile?.creatorCoinAddress && 
    coinToShow.address?.toLowerCase() === profile.creatorCoinAddress.toLowerCase();
  
  if (coinToShow && !isCreatorCoin) {
    // Fetch market cap for the coin
    let coinMarketCap: number | null = null;
    if (coinToShow.marketCap) {
      const parsed = parseFloat(coinToShow.marketCap);
      if (!isNaN(parsed) && parsed > 0) {
        coinMarketCap = parsed;
      }
    }
    // Fallback to DexScreener for Base chain
    if (!coinMarketCap && coinToShow.address && (coinToShow.chainId === 8453 || coinToShow.chainId === BASE_CHAIN_ID)) {
      try {
        const { fetchBaseTokenData } = await import("../services/dexscreener");
        const metrics = await fetchBaseTokenData(coinToShow.address);
        coinMarketCap = metrics?.marketCap ?? null;
      } catch (error) {
        // Silently fail
      }
    }
    // Use different label based on whether it's created or purchased
    // If we have latestCreatedCoin, it's definitely created; otherwise check the source
    const isCreated = latestCreatedCoin === coinToShow || coinSource === "created";
    const isPurchase = coinSource === "holding" && latestCreatedCoin !== coinToShow;
    const coinField = buildLatestCoinLine(coinToShow, coinMarketCap, isCreated, isPurchase);
    zoraLines.push(coinField);
  }

  if (zoraLines.length > 0) {
    embed.addFields({
      name: "\u200B",
      value: zoraLines.join("\n"),
      inline: false,
    });
  }

  if (latestCast) {
    embed.addFields({
      name: "Most Recent Cast",
      value: formatCastSummary(latestCast),
      inline: false,
    });
  }

  let mergedZoraSocial = false;
  const zoraHandle = profile?.handle;
  if (zoraHandle) {
    // Only create profile link if it's a valid handle (not a wallet address)
    const handle = zoraHandle.trim();
    const isValidHandle = handle && !handle.startsWith("0x") && handle.length < 50;
    const zoraLink = isValidHandle 
      ? `[Z](https://zora.co/@${handle})`
      : null; // Don't create broken links for wallet addresses
    const fields = embed.data.fields ?? [];
    const profileIndex = fields.findIndex((field) => field.name === "Profile");
    if (profileIndex >= 0) {
      const profileField = fields[profileIndex];
      const lines = profileField.value.split("\n");
      const socialsIndex = lines.findIndex((line) => line.startsWith("**Socials:**"));
      if (socialsIndex >= 0 && zoraLink) {
        if (!lines[socialsIndex].includes(zoraLink)) {
          lines[socialsIndex] = `${lines[socialsIndex]} • ${zoraLink}`;
        }
        mergedZoraSocial = true;
      } else if (zoraLink) {
        lines.splice(1, 0, `**Socials:** ${zoraLink}`);
        mergedZoraSocial = true;
      }
      embed.spliceFields(profileIndex, 1, {
        name: profileField.name,
        value: lines.join("\n"),
        inline: profileField.inline ?? false,
      });
    }
  }

  // Don't add socials here if they're already on page 1 (for paginated embeds)
  // The caller should handle adding socials to page 1
  const socialValue = profile ? formatSocialRow(profile) : null;
  if (socialValue && !mergedZoraSocial && !options?.skipSocials) {
    embed.addFields({
      name: "Socials",
      value: socialValue,
      inline: false,
    });
  }
}

export function formatSocialRow(profile: ZoraLookupResult["profile"]): string | null {
  if (!profile) {
    return null;
  }

  const parts: string[] = [];
  const socials = profile.socials ?? [];

  if (profile.farcasterHandle) {
    const handle = profile.farcasterHandle.replace(/^@/, "");
    parts.push(`[F](${buildFarcasterProfileUrl(handle)})`);
  }

  const xLink = socials.find((link) => link.platform === "X" || link.platform === "Twitter");
  if (xLink) {
    const url = xLink.url ?? `https://x.com/${(xLink.label ?? "").replace(/^@/, "")}`;
    parts.push(`[X](${url})`);
  }

  if (profile.handle) {
    // Only create profile link if it's a valid handle (not a wallet address)
    const handle = profile.handle.trim();
    const isValidHandle = handle && !handle.startsWith("0x") && handle.length < 50;
    if (isValidHandle) {
      parts.push(`[Z](https://zora.co/@${handle})`);
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" • ");
}

function formatCastSummary(cast: Cast): string {
  const text = cast.text?.trim() ?? "";
  const truncated =
    text.length === 0
      ? "_No text content._"
      : text.length > 180
      ? `${text.slice(0, 177)}…`
      : text;
  const url = buildCastUrl(cast.author.username, cast.hash);
  const timestamp = new Date(cast.timestamp).toLocaleString();
  const likes = cast.reactions?.likes_count ?? 0;
  const recasts = cast.reactions?.recasts_count ?? 0;
  return `${truncated}\n[Open Cast](${url}) • ${timestamp}\n👍 ${likes.toLocaleString()} • 🔁 ${recasts.toLocaleString()}`;
}

function buildLatestCoinLine(coin: ZoraCoin, marketCap?: number | null, isCreated = false, isPurchase = false): string {
  const rawLabel = coin.name ?? coin.symbol ?? coin.address ?? "Coin";
  const truncatedLabel = truncateLabel(rawLabel, 36);
  const url = getZoraCoinUrl(coin);
  const clickableLabel = url ? `[${truncatedLabel}](${url})` : truncatedLabel;
  let title: string;
  if (isCreated) {
    title = "Latest Created Coin";
  } else if (isPurchase) {
    title = "Latest Purchase";
  } else {
    title = "Latest Zora Coin";
  }
  if (marketCap != null && marketCap > 0) {
    const formattedMC = formatCompactNumber(marketCap);
    title = `${title} • MC: ${formattedMC}`;
  }
  return `**${title}:** ${clickableLabel}\n${formatContractBlock(coin.address)}`;
}

function truncateLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}


