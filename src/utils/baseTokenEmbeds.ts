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

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp * 1000);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export async function buildBaseTokenEmbed(
  contractAddress: string,
  tokenName?: string | null,
  tokenSymbol?: string | null,
  metrics?: TokenMetrics | null,
  factory?: BaseFactory | null,
  creatorAddress?: string | null,
  createdAt?: number | null,
): Promise<{
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  // Use token name/symbol from metrics if not provided, fallback to provided values
  const finalTokenName = tokenName ?? metrics?.tokenName ?? null;
  const finalTokenSymbol = tokenSymbol ?? metrics?.tokenSymbol ?? null;
  
  const title = finalTokenSymbol && finalTokenName
    ? `${finalTokenSymbol} • ${finalTokenName}`
    : finalTokenName ?? finalTokenSymbol ?? "Base Token";

  // Use DexScreener URL if available, otherwise fallback to Basescan
  const embedUrl = metrics?.dexUrl ?? `https://basescan.org/address/${contractAddress}`;

  const embed = new EmbedBuilder()
    .setColor(0x0052ff) // Base blue
    .setTitle(`🪙 ${title}`)
    .setURL(embedUrl);

  // Chain Information
  embed.addFields({
    name: "🔗 Chain",
    value: "Base",
    inline: false,
  });

  // Token Name
  if (finalTokenName) {
    embed.addFields({
      name: "🏠 Name",
      value: finalTokenName,
      inline: false,
    });
  }

  // Token Symbol
  if (finalTokenSymbol) {
    embed.addFields({
      name: "🔖 Symbol",
      value: finalTokenSymbol,
      inline: false,
    });
  }

  // Contract Address
  embed.addFields({
    name: "🔑 Address",
    value: `\`\`\`\n${contractAddress}\n\`\`\``,
    inline: false,
  });

  // Created At
  const finalCreatedAt = createdAt ?? metrics?.createdAt ?? null;
  if (finalCreatedAt) {
    embed.addFields({
      name: "Created at",
      value: formatDate(finalCreatedAt),
      inline: false,
    });
  }

  // Developer/Creator Address
  const finalCreatorAddress = creatorAddress ?? metrics?.creatorAddress ?? null;
  if (finalCreatorAddress) {
    embed.addFields({
      name: "🛠️ Dev",
      value: `\`\`\`\n${finalCreatorAddress}\n\`\`\``,
      inline: false,
    });
  }

  // Market Cap
  if (metrics?.marketCap != null) {
    embed.addFields({
      name: "💸 MarketCap",
      value: formatCurrency(metrics.marketCap),
      inline: false,
    });
  }

  // Additional Token Metrics (if available)
  const additionalMetrics: string[] = [];
  
  if (metrics?.priceUsd != null) {
    additionalMetrics.push(`💰 Price: ${formatCurrency(metrics.priceUsd)}`);
  }
  
  if (metrics?.fdv != null && metrics.fdv !== metrics.marketCap) {
    additionalMetrics.push(`💎 FDV: ${formatCurrency(metrics.fdv)}`);
  }
  
  if (metrics?.liquidity != null) {
    additionalMetrics.push(`💧 Liq: ${formatCurrency(metrics.liquidity)}`);
  }
  
  if (metrics?.volume24h != null) {
    additionalMetrics.push(`📊 Vol 24H: ${formatCurrency(metrics.volume24h)}`);
  }
  
  if (metrics?.priceChange24h != null) {
    const change = metrics.priceChange24h;
    const emoji = change >= 0 ? "📈" : "📉";
    additionalMetrics.push(`${emoji} 24H: ${formatPercentage(change)}`);
  }

  if (additionalMetrics.length > 0) {
    embed.addFields({
      name: "Token Metrics",
      value: additionalMetrics.join("\n"),
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

  // Pool/Token Info Section (like the example bot)
  const poolInfo: string[] = [];
  
  // Factory Information (check both factory parameter and metrics)
  const finalFactoryName = factory?.name ?? metrics?.factoryName ?? null;
  const isKnownFactory = factory !== null; // If factory object exists, it's a known factory
  
  if (finalFactoryName) {
    // Add checkmark for known factories
    const factoryDisplay = isKnownFactory 
      ? `🏭 Factory: ${finalFactoryName} ✅`
      : `🏭 Factory: ${finalFactoryName}`;
    poolInfo.push(factoryDisplay);
  }

  // Add liquidity warning if very low (like the example)
  if (metrics?.liquidity != null && metrics.liquidity < 1000) {
    poolInfo.push(`🚱 VERY LOW LIQUIDITY 🚱`);
  }

  // Add DEX info if available
  if (metrics?.dexName) {
    // Format DEX name nicely (e.g., "uniswap" -> "UNISWAP V3")
    const dexDisplay = metrics.dexName.toUpperCase().replace(/_/g, " ");
    poolInfo.push(`🦄 DEX: ${dexDisplay}`);
  }

  // Add market cap and liquidity to pool info
  if (metrics?.marketCap != null) {
    poolInfo.push(`📊 Mcap: ${formatCurrency(metrics.marketCap)}`);
  }
  
  if (metrics?.liquidity != null) {
    poolInfo.push(`💧 Liq: ${formatCurrency(metrics.liquidity)}`);
  }

  if (poolInfo.length > 0) {
    embed.addFields({
      name: "Pool Info",
      value: poolInfo.join("\n"),
      inline: false,
    });
  }

  // Token Info Section (additional token details)
  const tokenInfo: string[] = [];
  
  // Add creator info to token info section (full address in code block)
  if (finalCreatorAddress) {
    tokenInfo.push(`👤 Creator:\n\`\`\`\n${finalCreatorAddress}\n\`\`\``);
  }

  if (tokenInfo.length > 0) {
    embed.addFields({
      name: "Token Info",
      value: tokenInfo.join("\n"),
      inline: false,
    });
  }

  applyBranding(embed, "base token");
  return { embed, components: [] };
}


