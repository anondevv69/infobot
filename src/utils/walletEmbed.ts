import type { ButtonBuilder } from "discord.js";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder as Button, ButtonStyle } from "discord.js";
import type { Cast, User } from "@neynar/nodejs-sdk/build/api";
import type { ZoraLookupResult } from "../services/zora";
import type { ClankerToken } from "../services/clanker";
import { splitClankerTokens } from "./clankerAssociation";
import { applyBranding } from "./branding";
import { buildUserClankerEmbed, getClankerDisplayEntries, formatClankerTokenDetails } from "./clankerEmbeds";
import { appendZoraSummaryFields } from "./zoraEmbeds";
import { splitEmbedIntoPages, buildPaginationButtons, type PageInfo } from "./pagination";
import { storeEmbedForPagination } from "../handlers/pagination";

interface WalletProfileParams {
  wallet: string;
  user: User;
  zoraSummary?: ZoraLookupResult | null;
  clankerTokens?: ClankerToken[];
  latestCast?: Cast | null;
}

interface ZoraWalletProfileParams {
  wallet: string;
  summary: ZoraLookupResult;
}

export interface WalletProfileResponse {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

type EmbedField = { name: string; value: string; inline: boolean };

export async function buildWalletProfileResponse(
  params: WalletProfileParams,
): Promise<WalletProfileResponse> {
  const { wallet, user, zoraSummary, latestCast } = params;
  const shortWallet = formatShortWallet(wallet);

  const { deployed } = splitClankerTokens(params.clankerTokens ?? [], user);
  const { embed } = await buildUserClankerEmbed(user, "Wallet Lookup", deployed);

  embed
    .setTitle(`${shortWallet} • Wallet Profile`)
    .setURL(`https://basescan.org/address/${wallet}`);

  const existingFields = embed.data.fields ? [...embed.data.fields] : [];
  embed.setFields({ name: "Input Wallet", value: formatCodeBlock([wallet]), inline: false }, ...existingFields);

  const zoraWallets = zoraSummary?.profile?.walletAddresses ?? [];
  if (zoraWallets.length > 0) {
    embed.addFields({
      name: "Zora Wallets",
      value: formatCodeBlock(zoraWallets),
      inline: false,
    });
  }

  // Page 1: Profile, wallets, cast (without Clankers and Zora)
  // Remove Clanker and Zora fields from page 1
  const page1Fields = embed.data.fields?.filter(field => 
    !field.name.includes("First Clank") && 
    !field.name.includes("Latest Clank") &&
    !field.name.includes("Creator Coin") &&
    !field.name.includes("Latest Zora Coin")
  ) ?? [];
  
  const page1Embed = new EmbedBuilder()
    .setColor(embed.data.color ?? null)
    .setTitle(embed.data.title ?? null)
    .setDescription(embed.data.description ?? null)
    .setThumbnail(embed.data.thumbnail?.url ?? null)
    .setURL(embed.data.url ?? null)
    .addFields(page1Fields);
  
  applyBranding(page1Embed, "wallet lookup");

  const embeds: EmbedBuilder[] = [page1Embed];
  let totalPages = 1;

  // Page 2: Clankers + Zora (if available)
  const hasClankers = deployed.length > 0;
  const hasZora = zoraSummary !== null && zoraSummary !== undefined;
  
  if (hasClankers || hasZora) {
    let page2Title = "Wallet Profile";
    if (hasClankers && hasZora) {
      page2Title += " • Clankers & Zora";
    } else if (hasClankers) {
      page2Title += " • Clankers";
    } else if (hasZora) {
      page2Title += " • Zora";
    }
    
    const page2Embed = new EmbedBuilder()
      .setColor(embed.data.color ?? null)
      .setTitle(page2Title);

    // Add Clanker coin details (first and recent)
    if (hasClankers) {
      const clankerDisplayEntries = getClankerDisplayEntries(deployed);
      if (clankerDisplayEntries.length > 0) {
        clankerDisplayEntries.forEach(({ label, token }) => {
          const details = formatClankerTokenDetails(token);
          page2Embed.addFields({
            name: label,
            value: details,
            inline: false,
          });
        });
      }
    }

    // Add Zora info if available
    if (hasZora && zoraSummary) {
      await appendZoraSummaryFields(page2Embed, zoraSummary, {
        latestCast: null, // Don't duplicate latest cast
      });
    }

    applyBranding(page2Embed, "wallet lookup");
    embeds.push(page2Embed);
    totalPages = 2;
  }

  const identifier = `wallet_profile_${wallet}`;

  // Store embeds for pagination
  if (totalPages > 1) {
    storeEmbedForPagination(identifier, embeds[0]);
    if (embeds.length > 1) {
      storeEmbedForPagination(`${identifier}_page2`, embeds[1]);
    }
  }

  // Add pagination buttons if needed
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    const pageLabels: PageInfo[] = [
      { label: "Profile" }, // Page 1
      { label: hasClankers && hasZora ? "Clankers & Zora" : hasClankers ? "Clankers" : "Zora" }, // Page 2
    ];
    components.push(...buildPaginationButtons(0, totalPages, identifier, pageLabels));
  }

  return {
    embeds: [embeds[0]], // Return first page only
    components,
  };
}

export function buildZoraWalletProfileResponse(
  params: ZoraWalletProfileParams,
): WalletProfileResponse {
  const { wallet, summary } = params;
  const shortWallet = formatShortWallet(wallet);
  const profile = summary.profile;

  const embed = new EmbedBuilder().setColor(0x1d4ed8).setTitle(`${shortWallet} • Zora Profile`);
  if (profile.handle) {
    // Only use profile handle URL if it's a valid handle (not a wallet address)
    const handle = profile.handle.trim();
    if (handle && !handle.startsWith("0x") && handle.length < 50) {
      embed.setURL(`https://zora.co/@${handle}`);
    }
  }
  if (profile.displayName) {
    embed.setDescription(profile.displayName);
  }

  const profileLines: string[] = [];
  if (profile.handle) {
    profileLines.push(`Handle: @${profile.handle}`);
  }
  if (profile.farcasterHandle) {
    const handle = profile.farcasterHandle.replace(/^@/, "");
    profileLines.push(`Farcaster: @${handle}`);
  }

  embed.addFields({
    name: "Profile",
    value: profileLines.length > 0 ? profileLines.join("\n") : "—",
    inline: false,
  });

  embed.addFields({
    name: "Input Wallet",
    value: formatCodeBlock([wallet]),
    inline: false,
  });

  if (profile.walletAddresses.length > 0) {
    embed.addFields({
      name: "Zora Wallets",
      value: formatCodeBlock(profile.walletAddresses),
      inline: false,
    });
  }

  // Split into pages if needed (Zora profile might be long)
  const embeds = splitEmbedIntoPages(embed, 15);
  const totalPages = embeds.length;
  const identifier = `zora_wallet_${wallet}`;

  // Store for pagination
  if (totalPages > 1) {
    embeds.forEach((embed, index) => {
      if (index === 0) {
        storeEmbedForPagination(identifier, embed);
      } else {
        storeEmbedForPagination(`${identifier}_page${index + 1}`, embed);
      }
    });
  }

  applyBranding(embeds[0], "wallet lookup");

  // Add pagination buttons if needed
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    components.push(...buildPaginationButtons(0, totalPages, identifier));
  }

  return {
    embeds: [embeds[0]], // Return first page only
    components,
  };
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

function formatShortWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

