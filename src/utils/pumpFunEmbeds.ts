import { EmbedBuilder } from "discord.js";
import { PumpFunToken } from "../services/pumpfun";
import { applyBranding } from "./branding";

function formatCurrency(value?: number | null, currency?: string | null): string | null {
  if (value == null) {
    return null;
  }
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    maximumFractionDigits: value >= 1 ? 2 : 6,
  });
  try {
    return formatter.format(value);
  } catch {
    return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
}

function formatPercentage(raw?: number | null): string | null {
  if (raw == null) {
    return null;
  }
  return `${(raw * 100).toFixed(2)}%`;
}

function formatDate(raw?: string | null): string | null {
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleString();
}

export function buildPumpFunEmbed(token: PumpFunToken): EmbedBuilder {
  const title =
    token.symbol && token.name
      ? `${token.symbol} • ${token.name}`
      : token.name ?? token.symbol ?? "Pump.fun Token";

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setURL(`https://pump.fun/coin/${token.mint}`)
    .addFields({
      name: "Token",
      value: [
        token.name ? `**Name:** ${token.name}` : null,
        token.symbol ? `**Symbol:** ${token.symbol}` : null,
        `**Mint:**\n\`\`\`\n${token.mint}\n\`\`\``,
      ]
        .filter(Boolean)
        .join("\n"),
      inline: false,
    });

  if (token.creatorAddress) {
    embed.addFields({
      name: "Creator",
      value: `\`\`\`\n${token.creatorAddress}\n\`\`\``,
      inline: false,
    });
  }

  const stats: string[] = [];
  if (token.bondingCurveProgress != null) {
    stats.push(`**Bonding Curve:** ${formatPercentage(token.bondingCurveProgress)}`);
  }
  if (token.price?.value != null) {
    stats.push(
      `**Price:** ${formatCurrency(token.price.value, token.price.currency) ?? token.price.value}`,
    );
  }
  if (token.marketCap != null) {
    stats.push(`**Market Cap:** ${formatCurrency(token.marketCap, "USD") ?? token.marketCap}`);
  }
  if (token.liquidity != null) {
    stats.push(`**Liquidity:** ${formatCurrency(token.liquidity, "USD") ?? token.liquidity}`);
  }

  if (stats.length > 0) {
    embed.addFields({
      name: "Stats",
      value: stats.join("\n"),
      inline: false,
    });
  }

  const createdAt = formatDate(token.createdAt);
  if (createdAt) {
    embed.addFields({
      name: "Created",
      value: createdAt,
      inline: false,
    });
  }

  if (token.imageUrl) {
    embed.setThumbnail(token.imageUrl);
  }

  return applyBranding(embed, "pump.fun");
}

