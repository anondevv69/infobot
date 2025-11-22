import { EmbedBuilder } from "discord.js";
import { env } from "../config";

export type BrandingContext =
  | "wallet lookup"
  | "zora coin"
  | "zora profile"
  | "clanker"
  | "cast"
  | string;

export function applyBranding(
  embed: EmbedBuilder,
  context: BrandingContext,
  badge?: string | null,
): EmbedBuilder {
  const parts: string[] = [];
  const name = env.brandName ?? "InfoBot";
  const version = env.appVersion ?? "dev";
  parts.push(`${name} v${version}`);
  // Include Farcaster profile URL (Discord footers don't support markdown links)
  parts.push(`built by rayblanco.eth • https://farcaster.xyz/rayblanco.eth`);
  parts.push(context);
  if (badge) {
    parts.push(badge);
  }

  const text = parts.join(" • ");
  // Always include icon URL if available
  if (env.brandIconUrl) {
    embed.setFooter({ text, iconURL: env.brandIconUrl });
  } else {
    embed.setFooter({ text });
  }
  return embed;
}

