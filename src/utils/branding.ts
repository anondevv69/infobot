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
  const name = env.brandName ?? "WarpBot";
  const version = env.appVersion ?? "dev";
  parts.push(`${name} v${version}`);
  parts.push("built by rayblanco.eth");
  parts.push(context);
  if (badge) {
    parts.push(badge);
  }

  const text = parts.join(" • ");
  if (env.brandIconUrl) {
    embed.setFooter({ text, iconURL: env.brandIconUrl });
  } else {
    embed.setFooter({ text });
  }
  return embed;
}

