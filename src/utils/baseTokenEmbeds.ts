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
  creationTxHash?: string | null,
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

  // Add caution symbol for AperStore and Fey tokens
  const factoryName = factory?.name ?? metrics?.factoryName ?? null;
  const needsCaution = factoryName === "AperStore" || factoryName === "Fey";
  const titlePrefix = needsCaution ? "⚠️ 🪙" : "🪙";

  // Use DexScreener URL if available, otherwise fallback to Basescan
  const embedUrl = metrics?.dexUrl ?? `https://basescan.org/address/${contractAddress}`;

  const embed = new EmbedBuilder()
    .setColor(0x0052ff) // Base blue
    .setTitle(`${titlePrefix} ${title}`)
    .setURL(embedUrl);

  // Add warning description for AperStore tokens
  if (factoryName === "AperStore") {
    embed.setDescription("⚠️ **We do not recommend AperStore coins.**");
  }

  // Factory Information (moved to top section)
  const finalFactoryName = factory?.name ?? metrics?.factoryName ?? null;
  const isKnownFactory = factory !== null;
  let factoryDisplay = "";
  if (finalFactoryName) {
    const cleanFactoryName = finalFactoryName.startsWith("Factory: ") 
      ? finalFactoryName.replace(/^Factory: /, "")
      : finalFactoryName;
    factoryDisplay = isKnownFactory 
      ? `🏭 Factory: ${cleanFactoryName} ✅`
      : `🏭 Factory: ${cleanFactoryName}`;
  }

  // Top Section: Chain, Name, Symbol, Address, Factory, Created At, Market Cap
  const topSection: string[] = [];
  topSection.push("🔗 Chain: Base");
  
  if (finalTokenName) {
    topSection.push(`🏠 Name: ${finalTokenName}`);
  }
  
  if (finalTokenSymbol) {
    topSection.push(`🔖 Symbol: ${finalTokenSymbol}`);
  }
  
  topSection.push(`🔑 Address: \`${contractAddress}\``);
  
  if (factoryDisplay) {
    topSection.push(factoryDisplay);
  }
  
  const finalCreatedAt = createdAt ?? metrics?.createdAt ?? null;
  if (finalCreatedAt) {
    topSection.push(`Created at: ${formatDate(finalCreatedAt)}`);
  }
  
  // Add Market Cap to top section
  if (metrics?.marketCap != null) {
    topSection.push(`💸 MarketCap: ${formatCurrency(metrics.marketCap)}`);
  }

  embed.addFields({
    name: "Token Details",
    value: topSection.join("\n"),
    inline: false,
  });

  // Token Metrics section removed - market cap is shown in Token Details section

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

  // Removed Pool Info section as requested

  // Token Info Section (Creator and Creation Transaction only)
  const finalCreatorAddress = creatorAddress ?? metrics?.creatorAddress ?? null;
  const tokenInfo: string[] = [];
  
  if (finalCreatorAddress) {
    tokenInfo.push(`👤 Creator: \`${finalCreatorAddress}\``);
  }

  if (creationTxHash && creationTxHash.trim() !== "") {
    const txLink = `https://basescan.org/tx/${creationTxHash}`;
    tokenInfo.push(`🔗 [Creation Transaction](${txLink})`);
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


