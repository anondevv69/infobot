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
import { findUserByWallet } from "../services/neynar";
import { findBestZoraSummary } from "../services/zora";
import { buildTradingLinks } from "./tradingButtons";

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
  paragraphCoin?: { id: string; contractAddress: string; symbol: string; postId: string } | null,
  paragraphPostAuthor?: { name?: string | null; bio?: string | null; farcaster?: { username: string } | null; publicationId?: string | null } | null,
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

  // Add caution symbol for ApeStore and Fey tokens
  const factoryName = factory?.name ?? metrics?.factoryName ?? null;
  const needsCaution = factoryName === "ApeStore" || factoryName === "Fey";
  const titlePrefix = needsCaution ? "⚠️ 🪙" : "🪙";

  // Use DexScreener URL if available, otherwise fallback to Basescan
  const embedUrl = metrics?.dexUrl ?? `https://basescan.org/address/${contractAddress}`;

  const embed = new EmbedBuilder()
    .setColor(0x0052ff) // Base blue
    .setTitle(`${titlePrefix} ${title}`)
    .setURL(embedUrl);

  // Add warning description for ApeStore tokens
  if (factoryName === "ApeStore") {
    embed.setDescription("⚠️ **We do not recommend ApeStore coins.**");
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

  // Add trading links right after Token Details (which contains the contract address)
  embed.addFields({
    name: "\u200b", // Zero-width space to make it appear on same line
    value: buildTradingLinks(contractAddress),
    inline: false,
  });

  // Add Paragraph post info if available
  if (paragraphCoin) {
    // The postId from the API is the post slug/ID, use it directly in the URL
    // Format: https://paragraph.com/@post/{postId}
    const paragraphPostUrl = `https://paragraph.com/@post/${paragraphCoin.postId}`;
    const paragraphLines: string[] = [];
    paragraphLines.push(`**Post:** [View on Paragraph](${paragraphPostUrl})`);
    
    // Add post author information if available
    if (paragraphPostAuthor) {
      if (paragraphPostAuthor.name) {
        paragraphLines.push(`**Author:** ${paragraphPostAuthor.name}`);
      }
      if (paragraphPostAuthor.farcaster) {
        paragraphLines.push(`**Farcaster:** [@${paragraphPostAuthor.farcaster.username}](https://farcaster.xyz/${paragraphPostAuthor.farcaster.username})`);
      }
      if (paragraphPostAuthor.publicationId) {
        const authorProfileUrl = `https://paragraph.xyz/@${paragraphPostAuthor.publicationId}`;
        paragraphLines.push(`**Paragraph:** [View Profile](${authorProfileUrl})`);
      }
    }
    
    embed.addFields({
      name: "📝 Paragraph Post",
      value: paragraphLines.join("\n"),
      inline: false,
    });
  }

  // Token Metrics section removed - market cap is shown in Token Details section

  // Trading Activity (compact - all in one row)
  if (metrics?.trades24h) {
    const trades = metrics.trades24h;
    const buys = trades.buys ?? 0;
    const sells = trades.sells ?? 0;
    const total = buys + sells;
    
    if (total > 0) {
      embed.addFields({
        name: "24H Activity",
        value: `🟢 Buys: ${buys.toLocaleString()} • 🔴 Sells: ${sells.toLocaleString()} • 📊 Total: ${total.toLocaleString()}`,
        inline: false,
      });
    }
  }

  // Removed Pool Info section as requested

  // Token Info Section (Creator, Creation Transaction, Farcaster, Zora)
  const finalCreatorAddress = creatorAddress ?? metrics?.creatorAddress ?? null;
  const tokenInfo: string[] = [];
  
  if (finalCreatorAddress) {
    tokenInfo.push(`👤 Creator: \`${finalCreatorAddress}\``);
    
    // Creation Transaction (moved right after creator)
    if (creationTxHash && creationTxHash.trim() !== "") {
      const txLink = `https://basescan.org/tx/${creationTxHash}`;
      tokenInfo.push(`🔗 [Creation Transaction](${txLink})`);
    }
    
    // Check for Farcaster and Zora accounts
    try {
      const [farcasterUser, zoraSummary] = await Promise.all([
        findUserByWallet(finalCreatorAddress).catch(() => null),
        findBestZoraSummary([finalCreatorAddress.toLowerCase()]).catch(() => null),
      ]);
      
      // Farcaster account
      if (farcasterUser) {
        const farcasterUrl = `https://farcaster.xyz/${farcasterUser.username}?ref=2ORGMS`;
        tokenInfo.push(`📱 Farcaster: [@${farcasterUser.username}](${farcasterUrl})`);
      } else {
        tokenInfo.push(`📱 Farcaster: None`);
      }
      
      // Zora account
      if (zoraSummary && (zoraSummary.latestCoin?.coin || (zoraSummary.createdCoins ?? []).length > 0)) {
        const zoraHandle = zoraSummary.profile.handle || zoraSummary.profile.farcasterHandle || "Profile";
        const zoraUrl = zoraSummary.profile.handle 
          ? `https://zora.co/${zoraSummary.profile.handle}`
          : `https://zora.co/profile/${finalCreatorAddress}`;
        tokenInfo.push(`🎨 Zora: [${zoraHandle}](${zoraUrl})`);
      } else {
        tokenInfo.push(`🎨 Zora: None`);
      }
    } catch (error) {
      console.error(`[Base Token] Failed to check Farcaster/Zora for creator ${finalCreatorAddress}:`, error);
      tokenInfo.push(`📱 Farcaster: None`);
      tokenInfo.push(`🎨 Zora: None`);
    }
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


