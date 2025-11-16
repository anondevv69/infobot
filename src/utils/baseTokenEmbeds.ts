import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { TokenMetrics } from "../services/dexscreener";
import { BaseFactory } from "../services/baseFactories";
import { applyBranding } from "./branding";
import { getContractCreation } from "../services/basescan";

function formatCurrency(value?: number | null): string {
  if (value == null) return "N/A";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(6)}`;
}

function formatPercentage(value?: number | null): string {
  if (value == null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export async function buildBaseTokenEmbed(
  contractAddress: string,
  tokenName?: string | null,
  tokenSymbol?: string | null,
  metrics?: TokenMetrics | null,
  factory?: BaseFactory | null,
  creatorAddress?: string | null,
): Promise<{
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const title = tokenSymbol && tokenName
    ? `${tokenSymbol} • ${tokenName}`
    : tokenName ?? tokenSymbol ?? "Base Token";

  const embed = new EmbedBuilder()
    .setColor(0x0052ff) // Base blue
    .setTitle(`🪙 ${title}`)
    .setURL(`https://basescan.org/address/${contractAddress}`);

  // Token Metrics
  const metricsLines: string[] = [];
  
  if (metrics?.priceUsd != null) {
    metricsLines.push(`💰 Price: ${formatCurrency(metrics.priceUsd)}`);
  }
  
  if (metrics?.marketCap != null) {
    metricsLines.push(`💎 MC: ${formatCurrency(metrics.marketCap)}`);
  }
  
  if (metrics?.fdv != null && metrics.fdv !== metrics.marketCap) {
    metricsLines.push(`💎 FDV: ${formatCurrency(metrics.fdv)}`);
  }
  
  if (metrics?.liquidity != null) {
    metricsLines.push(`💧 Liq: ${formatCurrency(metrics.liquidity)}`);
  }
  
  if (metrics?.volume24h != null) {
    metricsLines.push(`📊 Vol 24H: ${formatCurrency(metrics.volume24h)}`);
  }
  
  if (metrics?.priceChange24h != null) {
    const change = metrics.priceChange24h;
    const emoji = change >= 0 ? "📈" : "📉";
    metricsLines.push(`${emoji} 24H: ${formatPercentage(change)}`);
  }

  if (metricsLines.length > 0) {
    embed.addFields({
      name: "Token Metrics",
      value: metricsLines.join("\n"),
      inline: false,
    });
  }

  // Trading Activity
  if (metrics?.trades24h) {
    const trades = metrics.trades24h;
    const buys = trades.buys ?? 0;
    const sells = trades.sells ?? 0;
    const total = buys + sells;
    
    if (total > 0) {
      embed.addFields({
        name: "24H Activity",
        value: `🟢 Buys: ${buys.toLocaleString()}\n🔴 Sells: ${sells.toLocaleString()}\n📊 Total: ${total.toLocaleString()}`,
        inline: false,
      });
    }
  }

  // Factory Information
  if (factory) {
    embed.addFields({
      name: "Factory",
      value: `🏭 ${factory.name}`,
      inline: false,
    });
  }

  // Creator Address (if available)
  if (creatorAddress) {
    embed.addFields({
      name: "Creator",
      value: `\`\`\`\n${creatorAddress}\n\`\`\``,
      inline: false,
    });
  }

  // Contract Address
  embed.addFields({
    name: "Contract",
    value: `\`\`\`\n${contractAddress}\n\`\`\``,
    inline: false,
  });

  applyBranding(embed, "base token");
  return { embed, components: [] };
}


