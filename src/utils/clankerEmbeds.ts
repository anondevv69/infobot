import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import type { Cast, User } from "@neynar/nodejs-sdk/build/api";
import type { ClankerToken } from "../services/clanker";
import type { ZoraLookupResult } from "../services/zora";
import { findUserByUsername, findUserByWallet } from "../services/neynar";
import { formatAddressLink } from "./addressLinks";
import { appendZoraSummaryFields } from "./zoraEmbeds";
import { applyBranding } from "./branding";
import { buildFarcasterProfileUrl, buildCastUrl } from "./farcasterLinks";

const BASE_CHAIN_ID = 8453;

function buildDeployerField(
  user: User | null | undefined,
  fallbackAddresses: string[],
): { name: string; value: string; inline: boolean } | null {
  const normalized = new Map<string, string>();
  const addAddress = (addr: string | undefined | null) => {
    if (!addr) {
      return;
    }
    const key = addr.toLowerCase();
    if (!normalized.has(key)) {
      normalized.set(key, addr);
    }
  };

  const primaryVerified = user?.verified_addresses?.primary?.eth_address;
  const verifiedEth = user?.verified_addresses?.eth_addresses ?? [];

  if (primaryVerified) {
    addAddress(primaryVerified);
  }

  verifiedEth.forEach(addAddress);

  if (normalized.size === 0 && user?.custody_address) {
    addAddress(user.custody_address);
  }

  if (normalized.size === 0) {
    fallbackAddresses.forEach(addAddress);
  }

  if (normalized.size === 0) {
    return null;
  }

  const formatted = Array.from(normalized.values()).map(
    (addr) => formatAddress(addr) ?? addr,
  );

  return {
    name: "Deployer",
    value: formatted.join("\n"),
    inline: true,
  };
}
export interface ClankerDisplayEntry {
  label: string;
  token: ClankerToken;
}

export function getClankerDisplayEntries(
  tokens: ClankerToken[],
): ClankerDisplayEntry[] {
  const entries: ClankerDisplayEntry[] = [];
  if (tokens.length === 0) {
    return entries;
  }

  const sorted = sortClankerTokens(tokens);

  const firstToken = sorted[0];
  const latestToken = sorted[sorted.length - 1];

  if (firstToken) {
    entries.push({ label: "First Clanker", token: firstToken });
  }

  if (latestToken && latestToken.contract_address !== firstToken?.contract_address) {
    entries.push({ label: "Most Recent Clanker", token: latestToken });
  }

  return entries;
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

function formatCodeBlock(
  values: Array<string | null | undefined>,
  fallback = "None",
): string {
  const cleaned = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && value.length > 0));

  if (cleaned.length === 0) {
    return fallback;
  }

  return ["```", ...cleaned, "```"].join("\n");
}

export interface UserClankerEmbedResult {
  embed: EmbedBuilder;
  clankerEntries: ClankerDisplayEntry[];
}

export async function buildUserClankerEmbed(
  user: User,
  titleSuffix: string,
  tokens?: ClankerToken[],
): Promise<UserClankerEmbedResult> {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Farcaster Profile")
    .setURL(buildFarcasterProfileUrl(user.username))
    .setTimestamp(new Date());

  if (user.profile?.bio?.text) {
    embed.setDescription(user.profile.bio.text);
  }

  if (user.pfp_url) {
    embed.setThumbnail(user.pfp_url);
  }

  addProfileSection(embed, user);
  appendWalletFields(embed, user);

  const clankerEntries = tokens ? appendClankerFields(embed, tokens) : [];

  return { embed, clankerEntries };
}

export function addProfileSection(embed: EmbedBuilder, user: User, label = "Profile"): void {
  const profileUrl = buildFarcasterProfileUrl(user.username);
  const lines = [`**Username:** [@${user.username}](${profileUrl})`];
  const socials = formatUserSocials(user);
  if (socials) {
    lines.push(`**Socials:** ${socials}`);
  }
  lines.push(
    `**FID:** ${user.fid}`,
    `**Followers / Following:** ${user.follower_count.toLocaleString()} / ${user.following_count.toLocaleString()}`,
  );

  if (user.custody_address) {
    lines.push(`**Custody:**\n${formatCodeBlock([user.custody_address])}`);
  }

  embed.addFields({
    name: label,
    value: lines.join("\n"),
    inline: false,
  });
}

export function appendWalletFields(embed: EmbedBuilder, user: User): void {
  const ethAddresses = user.verified_addresses?.eth_addresses ?? [];
  const ethField: EmbedField = {
    name: "Verified ETH Addresses",
    value: formatCodeBlock(ethAddresses),
    inline: false,
  };

  const solAddresses = user.verified_addresses?.sol_addresses ?? [];
  const solField: EmbedField | null =
    solAddresses.length > 0
      ? {
          name: "Verified SOL Addresses",
          value: formatCodeBlock(solAddresses),
          inline: false,
        }
      : null;

  embed.addFields(ethField);
  if (solField) {
    embed.addFields(solField);
  }
}

export function appendClankerFields(
  embed: EmbedBuilder,
  tokens: ClankerToken[],
): ClankerDisplayEntry[] {
  if (tokens.length === 0) {
    embed.addFields({
      name: "Clanker Activity",
      value: "No Clanker deployments found.",
      inline: false,
    });
    return [];
  }

  const entries = getClankerDisplayEntries(tokens);
  const totalCount = tokens.length;
  const remainingFieldSlots = Math.max(25 - (embed.data.fields?.length ?? 0), 0);
  const limitedEntries = entries.slice(0, remainingFieldSlots);

  limitedEntries.forEach(({ label, token }) => {
    embed.addFields({
      name: formatClankerFieldLabel(label, token, totalCount),
      value: formatClankerTokenDetails(token),
      inline: false,
    });
  });

  return limitedEntries;
}

export interface BuildTokenEmbedOptions {
  farcasterUser?: User | null;
  clankerTokens?: ClankerToken[];
  latestCast?: Cast | null;
  earliestCast?: Cast | null;
  zoraSummary?: ZoraLookupResult | null;
  includeWallets?: boolean;
}

export async function buildTokenEmbed(
  token: ClankerToken,
  options?: BuildTokenEmbedOptions,
): Promise<EmbedBuilder> {
  const {
    farcasterUser = null,
    clankerTokens = [],
    latestCast = null,
    earliestCast = null,
    zoraSummary = null,
    includeWallets = true,
  } = options ?? {};

  const description =
    token.description?.trim() ||
    token.metadata?.description?.trim() ||
    "_No description provided._";

  const titleName = token.name ?? token.symbol ?? shortenForTitle(token.contract_address);
  const embed = new EmbedBuilder()
    .setColor(0x4338ca)
    .setTitle(`Clanker • ${titleName}`)
    .setDescription(description)
    .setTimestamp(new Date());

  // Add trading links right after title for Base chain tokens
  if (token.contract_address && (token.chain_id === 8453 || token.chain_id === BASE_CHAIN_ID)) {
    const { buildTradingLinks } = await import("./tradingButtons");
    embed.addFields({
      name: "💱 Trade",
      value: buildTradingLinks(token.contract_address),
      inline: false,
    });
  }

  if (token.contract_address) {
    embed.setURL(`https://www.clanker.world/clanker/${token.contract_address}`);
  }

  if (token.img_url) {
    embed.setThumbnail(token.img_url);
  }

  const sortedTokens = clankerTokens.length > 0 ? sortClankerTokens(clankerTokens) : [];
  const totalClanks = sortedTokens.length;
  const clankIndex = token.contract_address
    ? sortedTokens.findIndex(
        (entry) =>
          entry.contract_address?.toLowerCase() === token.contract_address?.toLowerCase(),
      )
    : -1;
  const clankNumber = clankIndex >= 0 ? clankIndex + 1 : null;

  const deploymentLines: string[] = [];
  const deployedAt = token.deployed_at ?? token.created_at ?? null;
  if (clankNumber) {
    const suffix = totalClanks > 0 ? ` of ${totalClanks}` : "";
    deploymentLines.push(`Clank #${clankNumber}${suffix}`);
  }
  if (deployedAt) {
    deploymentLines.push(formatTimestamp(deployedAt));
  }
  if (token.msg_sender) {
    deploymentLines.push(`By ${formatAddress(token.msg_sender) ?? token.msg_sender}`);
  }

  const interfaceName =
    token.social_context?.interface ?? token.metadata?.interface ?? null;
  const platformName =
    token.social_context?.platform ?? token.metadata?.platform ?? null;
  
  // Fetch market cap for the primary token
  let marketCap: number | null = token.related?.market?.marketCap ?? null;
  
  // Fallback to DexScreener for Base chain tokens if Clanker API doesn't provide it
  if (!marketCap && token.contract_address && (token.chain_id === 8453 || token.chain_id === BASE_CHAIN_ID)) {
    try {
      const { fetchBaseTokenData } = await import("../services/dexscreener");
      const metrics = await fetchBaseTokenData(token.contract_address);
      marketCap = metrics?.marketCap ?? null;
    } catch (error) {
      // Silently fail
    }
  }
  
  const tokenLines = [
    token.symbol ? `Symbol: ${token.symbol}` : null,
    `Chain: ${formatChainName(token.chain_id)}`,
    marketCap != null && marketCap > 0 ? `MC: ${formatCompactNumber(marketCap)}` : null,
    interfaceName ? `Interface: ${interfaceName}` : null,
    platformName ? `Platform: ${platformName}` : null,
  ].filter(Boolean);

  embed.addFields({
    name: "Token",
    value: tokenLines.length > 0 ? tokenLines.join(" • ") : "—",
    inline: false,
  });

  embed.addFields({
    name: "Deployment",
    value: deploymentLines.length > 0 ? deploymentLines.join(" \u2022 ") : "Unknown",
    inline: false,
  });

  embed.addFields(buildContractField(token));

  const tokenSocials = formatTokenSocialLinks(token, { farcasterUser });
  if (tokenSocials) {
    embed.addFields({
      name: "Token Socials",
      value: tokenSocials,
      inline: false,
    });
  }

  if (earliestCast) {
    embed.addFields({
      name: "Earliest Token Cast",
      value: formatRecentCastSummary(earliestCast),
      inline: false,
    });
  }

  if (farcasterUser) {
    addProfileSection(embed, farcasterUser, "Dev Profile");
    // Only include wallet fields if includeWallets is true
    if (includeWallets) {
    appendWalletFields(embed, farcasterUser);
    }
  }

  if (clankerTokens.length > 0) {
    const entries = getClankerDisplayEntries(clankerTokens);
    const currentAddress = token.contract_address?.toLowerCase();
    entries
      .filter((entry) => {
        const entryAddress = entry.token.contract_address?.toLowerCase();
        if (entry.label === "First Clanker" && entryAddress && entryAddress === currentAddress) {
          return false;
        }
        return true;
      })
      .forEach(({ label, token: entryToken }) => {
        embed.addFields({
          name: label,
          value: formatClankerTokenDetails(entryToken),
          inline: false,
        });
      });
  }

  if (zoraSummary) {
    await appendZoraSummaryFields(embed, zoraSummary, { latestCast: null });
  }

  if (latestCast) {
    embed.addFields({
      name: "Latest Dev Cast",
      value: formatRecentCastSummary(latestCast),
      inline: false,
    });
  }

  applyBranding(embed, "clanker");

  return embed;
}

/**
 * Add trading links to a Clanker token embed
 */
export function addTradingLinksToEmbed(embed: EmbedBuilder, contractAddress: string, chainId?: number | string | null): void {
  // Only add trading links for Base chain tokens
  const isBaseChain = chainId === 8453 || chainId === "8453" || chainId === "base";
  if (!isBaseChain) {
    return;
  }

  const { buildTradingLinks } = require("./tradingButtons");
  embed.addFields({
    name: "💱 Trade",
    value: buildTradingLinks(contractAddress),
    inline: false,
  });
}

export async function resolveUserFromToken(
  token: ClankerToken,
): Promise<User | null> {
  // Run both lookups in parallel for speed (major performance improvement)
  const promises: Promise<User | null>[] = [];

  if (token.related?.user?.username) {
    promises.push(
      findUserByUsername(token.related.user.username).catch((error) => {
        console.warn("Failed to resolve user by username from token", error);
        return null;
      })
    );
  }

  if (token.msg_sender) {
    promises.push(
      findUserByWallet(token.msg_sender).catch((error) => {
        console.warn("Failed to resolve user by wallet from token", error);
        return null;
      })
    );
  }

  if (promises.length === 0) {
    return null;
  }

  // Wait for first successful result with timeout
  try {
    const results = await Promise.race([
      Promise.all(promises),
      new Promise<User[]>((resolve) => 
        setTimeout(() => resolve([]), 3000) // 3 second timeout
      ),
    ]);
    
    // Return first non-null result
    for (const user of results) {
      if (user) {
        return user;
      }
    }
  } catch (error) {
    console.warn("Error resolving user from token", error);
  }

  return null;
}

export function sortClankerTokens(tokens: ClankerToken[]): ClankerToken[] {
  return [...tokens].sort((a, b) => {
    const aDate = new Date(a.deployed_at ?? a.created_at ?? 0).getTime();
    const bDate = new Date(b.deployed_at ?? b.created_at ?? 0).getTime();
    return aDate - bDate;
  });
}

export function formatClankerTokenDetails(token: ClankerToken): string {
  const symbol = token.symbol ? token.symbol.toUpperCase() : null;
  const baseLabel = token.name
    ? symbol
      ? `${token.name} (${symbol})`
      : token.name
    : symbol ?? "Clanker Token";

  const url = token.contract_address
    ? `https://www.clanker.world/clanker/${token.contract_address}`
    : null;
  const contractBlock = token.contract_address
    ? formatCodeBlock([token.contract_address])
    : "Unknown contract";

  let title = url ? `[${baseLabel}](${url})` : baseLabel;
  
  // Add market cap if available
  const marketCap = token.related?.market?.marketCap;
  if (marketCap != null && marketCap > 0) {
    const formattedMC = formatCompactNumber(marketCap);
    title = `${title} • MC: ${formattedMC}`;
  }

  return `${title}\n${contractBlock}`;
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatUserSocials(user: User): string | null {
  const entries: string[] = [];
  const verifiedAccounts = user.verified_accounts ?? [];
  verifiedAccounts.forEach((account) => {
    if (!account?.username) {
      return;
    }
    const handle = account.username.replace(/^@/, "");
    if (!handle) {
      return;
    }
    if (account.platform === "x") {
      entries.push(`[X](https://x.com/${handle})`);
    } else if (account.platform === "github") {
      entries.push(`[GitHub](https://github.com/${handle})`);
    }
  });

  if (entries.length === 0) {
    return null;
  }

  return entries.join(" • ");
}

function buildContractField(token: ClankerToken): EmbedField {
  const contract = token.contract_address;
  const codeBlock = contract ? formatCodeBlock([contract]) : "Unknown";
  const links: string[] = [];

  if (contract) {
    links.push(`[X • CA](https://x.com/search?q=${encodeURIComponent(contract)})`);
    if (token.symbol) {
      const ticker = `$${token.symbol.toUpperCase()}`;
      links.push(
        `[X • ${ticker}](https://x.com/search?q=${encodeURIComponent(ticker)})`,
      );
    } else if (token.name) {
      links.push(
        `[X • ${token.name}](https://x.com/search?q=${encodeURIComponent(token.name)})`,
      );
    }
  }

  const linkLine = links.length > 0 ? `\n${links.join(" • ")}` : "";

  return {
    name: "Contract",
    value: `${codeBlock}${linkLine}`,
    inline: false,
  };
}

function formatTokenSocialLinks(
  token: ClankerToken,
  options?: { farcasterUser?: User | null },
): string | null {
  const socials = token.metadata?.socialMediaUrls ?? [];
  const entries = socials
    .map((item) => formatTokenSocialEntry(item, options))
    .filter((entry): entry is string => Boolean(entry));

  if (entries.length === 0) {
    return null;
  }

  return entries.join(" • ");
}

function formatTokenSocialLabel(platform?: string | null): string {
  if (!platform) {
    return "Link";
  }
  const normalized = platform.toLowerCase();
  if (normalized.includes("farcaster") || normalized.includes("warp")) {
    return "F";
  }
  if (normalized.includes("twitter") || normalized === "x") {
    return "X";
  }
  if (normalized.includes("zora")) {
    return "Z";
  }
  if (normalized.includes("discord")) {
    return "Discord";
  }
  return platform.length <= 4 ? platform.toUpperCase() : platform;
}

function formatTokenSocialEntry(
  item: { platform?: string | null; url?: string | null },
  options?: { farcasterUser?: User | null },
): string | null {
  if (!item?.url) {
    return null;
  }

  const label = formatTokenSocialLabel(item.platform);
  const prefix = isSuspiciousSocial(item, options) ? "⚠️ " : "";
  return `${prefix}[${label}](${item.url})`;
}

function isSuspiciousSocial(
  item: { platform?: string | null; url?: string | null },
  options?: { farcasterUser?: User | null },
): boolean {
  if (!item?.url) {
    return false;
  }

  const platform = item.platform?.toLowerCase() ?? "";
  const url = item.url.toLowerCase();

  const looksLikeFarcaster =
    platform === "farcaster" ||
    url.includes("farcaster.xyz/") ||
    url.includes("warpcast.com/");

  if (!looksLikeFarcaster) {
    return false;
  }

  const handle = extractFarcasterHandleFromUrl(item.url);
  if (!handle) {
    return true;
  }

  const userHandle = options?.farcasterUser?.username?.toLowerCase();
  return !userHandle || userHandle !== handle.toLowerCase();
}

function extractFarcasterHandleFromUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase();
    if (!host.includes("farcaster") && !host.includes("warpcast")) {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return null;
    }
    return segments[0].replace(/^@/, "");
  } catch {
    return null;
  }
}

function formatAddressList(addresses: string[]): string {
  if (addresses.length === 0) {
    return "None";
  }
  const preview = addresses
    .slice(0, 3)
    .map((addr) => formatAddressLink(addr))
    .join(" • ");
  const remaining = addresses.length - 3;
  return remaining > 0 ? `${preview} • …+${remaining}` : preview;
}

export const TOKEN_DETAIL_BUTTON_PREFIX = "token_detail:";

export function buildTokenDetailButton(token: ClankerToken): ButtonBuilder | null {
  const address = token.contract_address;
  if (!address) {
    return null;
  }

  const label = buildSeeMoreLabel(token);

  return new ButtonBuilder()
    .setCustomId(`${TOKEN_DETAIL_BUTTON_PREFIX}${address.toLowerCase()}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(label);
}

export function buildTokenDetailRows(
  tokens: ClankerToken[],
  options?: { maxButtons?: number; includeButtons?: boolean },
): ActionRowBuilder<ButtonBuilder>[] {
  return [];
}

export function formatRecentCastSummary(cast: Cast): string {
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

function formatChainName(chainId?: number | null): string {
  if (chainId === null || chainId === undefined) {
    return "Unknown";
  }
  const map: Record<number, string> = {
    1: "Ethereum",
    5: "Goerli",
    10: "Optimism",
    56: "BSC",
    137: "Polygon",
    324: "zkSync",
    8453: "Base",
    42161: "Arbitrum",
  };
  return map[chainId] ?? chainId.toString();
}

function formatAddress(address?: string | null): string | undefined {
  if (!address) {
    return undefined;
  }
  return formatAddressLink(address);
}

function buildSeeMoreLabel(token: ClankerToken): string {
  if (token.symbol) {
    return `See more • ${token.symbol}`;
  }
  if (token.name) {
    return `See more • ${token.name}`;
  }
  const address = token.contract_address;
  if (address) {
    return `See more • ${address.slice(0, 6)}…${address.slice(-4)}`;
  }
  return "See more";
}

export function getOrderedTokensForDisplay(
  tokens: ClankerToken[],
): ClankerToken[] {
  return getClankerDisplayEntries(tokens).map((entry) => entry.token);
}

export function extractAddressFromDetailCustomId(customId: string): string | null {
  if (!customId.startsWith(TOKEN_DETAIL_BUTTON_PREFIX)) {
    return null;
  }
  const address = customId.slice(TOKEN_DETAIL_BUTTON_PREFIX.length);
  return address ? address.toLowerCase() : null;
}

function formatTimestamp(value: string): string {
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

function shortenForTitle(value?: string | null): string {
  if (!value) {
    return "Token";
  }
  const trimmed = value.trim();
  if (trimmed.length <= 10) {
    return trimmed;
  }
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function formatCompactClankerEntry(token: ClankerToken): string {
  const label = token.name ?? token.symbol ?? shortenForTitle(token.contract_address);
  const url = token.contract_address
    ? `https://www.clanker.world/clanker/${token.contract_address}`
    : null;
  const contract = token.contract_address
    ? formatAddressLink(token.contract_address)
    : "Unknown";
  const deployed = token.deployed_at ?? token.created_at ?? null;
  const date = deployed ? formatTimestamp(deployed) : "Unknown date";
  const details = `${contract} • ${date}`;
  return url ? `[${label}](${url})\n${details}` : `${label}\n${details}`;
}

function formatClankerFieldLabel(label: string, token: ClankerToken, totalCount: number): string {
  const deployedAt = token.deployed_at ?? token.created_at ?? null;
  const timestamp = deployedAt ? formatTimestamp(deployedAt) : "Unknown date";
  const countSuffix = totalCount > 0 ? ` (${totalCount})` : "";

  switch (label) {
    case "First Clanker":
      return `First Clank${countSuffix} - ${timestamp}`;
    case "Most Recent Clanker":
      return `Latest Clank${countSuffix} - ${timestamp}`;
    default:
      return `${label}${countSuffix} - ${timestamp}`;
  }
}