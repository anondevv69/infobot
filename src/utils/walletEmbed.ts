import type { ActionRowBuilder, ButtonBuilder } from "discord.js";
import { EmbedBuilder } from "discord.js";
import type { Cast, User } from "@neynar/nodejs-sdk/build/api";
import type { ZoraLookupResult } from "../services/zora";
import type { ClankerToken } from "../services/clanker";
import { splitClankerTokens } from "./clankerAssociation";
import { applyBranding } from "./branding";
import { buildUserClankerEmbed } from "./clankerEmbeds";
import { appendZoraSummaryFields } from "./zoraEmbeds";

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

export function buildWalletProfileResponse(
  params: WalletProfileParams,
): WalletProfileResponse {
  const { wallet, user, zoraSummary, latestCast } = params;
  const shortWallet = formatShortWallet(wallet);

  const { deployed } = splitClankerTokens(params.clankerTokens ?? [], user);
  const { embed } = buildUserClankerEmbed(user, "Wallet Lookup", deployed);

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

  appendZoraSummaryFields(embed, zoraSummary, { latestCast: latestCast ?? null });
  applyBranding(embed, "wallet lookup");

  return {
    embeds: [embed],
    components: [],
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

  appendZoraSummaryFields(embed, summary);
  applyBranding(embed, "wallet lookup");

  return {
    embeds: [embed],
    components: [],
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

