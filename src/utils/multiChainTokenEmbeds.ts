import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js";
import { MultiChainTokenData } from "../services/dexscreener";
import { applyBranding } from "./branding";
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

function getChainExplorerUrl(chainId: string | number, address: string): string {
  // Normalize chainId to string and lowercase, trim whitespace
  const normalizedChainId = String(chainId).toLowerCase().trim();
  const explorerMap: Record<string, string> = {
    "1": `https://etherscan.io/address/${address}`,
    "eth": `https://etherscan.io/address/${address}`,
    "ethereum": `https://etherscan.io/address/${address}`,
    "56": `https://bscscan.com/address/${address}`,
    "bsc": `https://bscscan.com/address/${address}`,
    "137": `https://polygonscan.com/address/${address}`,
    "polygon": `https://polygonscan.com/address/${address}`,
    "42161": `https://arbiscan.io/address/${address}`,
    "arbitrum": `https://arbiscan.io/address/${address}`,
    "10": `https://optimistic.etherscan.io/address/${address}`,
    "optimism": `https://optimistic.etherscan.io/address/${address}`,
    "8453": `https://basescan.org/address/${address}`,
    "base": `https://basescan.org/address/${address}`,
    "43114": `https://snowtrace.io/address/${address}`,
    "avalanche": `https://snowtrace.io/address/${address}`,
    "250": `https://ftmscan.com/address/${address}`,
    "fantom": `https://ftmscan.com/address/${address}`,
    "5000": `https://explorer.mantle.xyz/address/${address}`,
    "mantle": `https://explorer.mantle.xyz/address/${address}`,
    "5001": `https://monadscan.com/address/${address}`,
    "monad": `https://monadscan.com/address/${address}`,
  };
  
  const explorerUrl = explorerMap[normalizedChainId];
  if (!explorerUrl) {
    console.warn(`[MultiChainToken] Unknown chainId: "${chainId}" (normalized: "${normalizedChainId}"), falling back to Etherscan`);
    console.warn(`[MultiChainToken] Available chainIds in map: ${Object.keys(explorerMap).join(", ")}`);
    return `https://etherscan.io/address/${address}`;
  }
  
  // Debug logging for Monad
  if (normalizedChainId === "monad" || normalizedChainId === "5001") {
    console.log(`[MultiChainToken] Monad explorer URL generated: "${explorerUrl}" for address "${address}"`);
  }
  
  return explorerUrl;
}

function getChainTxExplorerUrl(chainId: string | number, txHash: string): string {
  // Normalize chainId to string and lowercase
  const chainIdLower = String(chainId).toLowerCase();
  const txExplorerMap: Record<string, string> = {
    "1": `https://etherscan.io/tx/${txHash}`,
    "eth": `https://etherscan.io/tx/${txHash}`,
    "ethereum": `https://etherscan.io/tx/${txHash}`,
    "56": `https://bscscan.com/tx/${txHash}`,
    "bsc": `https://bscscan.com/tx/${txHash}`,
    "137": `https://polygonscan.com/tx/${txHash}`,
    "polygon": `https://polygonscan.com/tx/${txHash}`,
    "42161": `https://arbiscan.io/tx/${txHash}`,
    "arbitrum": `https://arbiscan.io/tx/${txHash}`,
    "10": `https://optimistic.etherscan.io/tx/${txHash}`,
    "optimism": `https://optimistic.etherscan.io/tx/${txHash}`,
    "8453": `https://basescan.org/tx/${txHash}`,
    "base": `https://basescan.org/tx/${txHash}`,
    "43114": `https://snowtrace.io/tx/${txHash}`,
    "avalanche": `https://snowtrace.io/tx/${txHash}`,
    "250": `https://ftmscan.com/tx/${txHash}`,
    "fantom": `https://ftmscan.com/tx/${txHash}`,
    "5000": `https://explorer.mantle.xyz/tx/${txHash}`,
    "mantle": `https://explorer.mantle.xyz/tx/${txHash}`,
    "5001": `https://monadscan.com/tx/${txHash}`,
    "monad": `https://monadscan.com/tx/${txHash}`,
  };
  return txExplorerMap[chainIdLower] ?? `https://etherscan.io/tx/${txHash}`;
}

function getChainColor(chainId: string): number {
  const colorMap: Record<string, number> = {
    "1": 0x627eea, // Ethereum blue
    "eth": 0x627eea,
    "ethereum": 0x627eea,
    "56": 0xf3ba2f, // BSC yellow
    "bsc": 0xf3ba2f,
    "137": 0x8247e5, // Polygon purple
    "polygon": 0x8247e5,
    "42161": 0x28a0f0, // Arbitrum blue
    "arbitrum": 0x28a0f0,
    "10": 0xff0420, // Optimism red
    "optimism": 0xff0420,
    "8453": 0x0052ff, // Base blue
    "base": 0x0052ff,
    "43114": 0xe84142, // Avalanche red
    "avalanche": 0xe84142,
    "250": 0x1969ff, // Fantom blue
    "fantom": 0x1969ff,
    "5000": 0x3eb489, // Mantle green
    "mantle": 0x3eb489,
    "5001": 0x00ff00, // Monad green
    "monad": 0x00ff00,
  };
  return colorMap[chainId.toLowerCase()] ?? 0x627eea;
}

export async function buildMultiChainTokenEmbed(
  contractAddress: string,
  tokenData: MultiChainTokenData,
): Promise<{
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const title = tokenData.tokenSymbol && tokenData.tokenName
    ? `${tokenData.tokenSymbol} • ${tokenData.tokenName}`
    : tokenData.tokenName ?? tokenData.tokenSymbol ?? `${tokenData.chainName} Token`;

  // Always use the chain-specific explorer URL, not DexScreener's dexUrl
  // DexScreener's dexUrl might point to a DEX interface, not the chain explorer
  const explorerUrl = getChainExplorerUrl(tokenData.chainId, contractAddress);
  const chainColor = getChainColor(tokenData.chainId);

  // Debug logging for Monad tokens
  if (tokenData.chainId?.toLowerCase() === "monad" || tokenData.chainId === "5001") {
    console.log(`[MultiChainToken] Monad token detected - chainId: "${tokenData.chainId}", explorerUrl: "${explorerUrl}"`);
  }

  const embed = new EmbedBuilder()
    .setColor(chainColor)
    .setTitle(`🪙 ${title}`)
    .setURL(explorerUrl);

  // Chain Information
  embed.addFields({
    name: "🔗 Chain",
    value: tokenData.chainName,
    inline: false,
  });

  // Token Name
  if (tokenData.tokenName) {
    embed.addFields({
      name: "🏠 Name",
      value: tokenData.tokenName,
      inline: false,
    });
  }

  // Token Symbol
  if (tokenData.tokenSymbol) {
    embed.addFields({
      name: "🔖 Symbol",
      value: tokenData.tokenSymbol,
      inline: false,
    });
  }

  // Contract Address (make it clickable to explorer)
  embed.addFields({
    name: "🔑 Address",
    value: `[${contractAddress}](${explorerUrl})`,
    inline: false,
  });

  // Add trading links right after contract address (for Base and Monad chain tokens)
  const chainIdLower = String(tokenData.chainId).toLowerCase();
  if (chainIdLower === "8453" || chainIdLower === "base" || chainIdLower === "5001" || chainIdLower === "monad") {
    embed.addFields({
      name: "\u200b", // Zero-width space to make it appear on same line
      value: buildTradingLinks(contractAddress, tokenData.chainId),
      inline: false,
    });
  }

  // Created At
  if (tokenData.createdAt) {
    embed.addFields({
      name: "Created at",
      value: formatDate(tokenData.createdAt),
      inline: false,
    });
  }

  // Creator Address and Profile Info (if available)
  const creatorAddress = tokenData.creatorAddress;
  if (creatorAddress) {
    const creatorInfo: string[] = [];
    creatorInfo.push(`🛠️ Dev: \`${creatorAddress}\``);
    
    // Add creation transaction link if we have the tx hash
    if (tokenData.creationTxHash) {
      const txExplorerUrl = getChainTxExplorerUrl(tokenData.chainId, tokenData.creationTxHash);
      creatorInfo.push(`🔗 [Creation Transaction](${txExplorerUrl})`);
    } else if (tokenData.createdAt) {
      const explorerUrl = getChainExplorerUrl(tokenData.chainId, contractAddress);
      creatorInfo.push(`🔗 [View Contract](${explorerUrl})`);
    }
    
    // Check for Farcaster and Zora accounts (with shorter timeout for speed)
    try {
      // Reduced timeout to 3 seconds for faster response
      const profileLookupPromise = Promise.all([
        findUserByWallet(creatorAddress).catch(() => null),
        findBestZoraSummary([creatorAddress.toLowerCase()]).catch(() => null),
      ]);
      
      const timeoutPromise = new Promise<[null, null]>((resolve) => {
        setTimeout(() => resolve([null, null]), 3000); // 3 second timeout (reduced from 10)
      });
      
      const [farcasterUser, zoraSummary] = await Promise.race([
        profileLookupPromise,
        timeoutPromise,
      ]);
      
      // Farcaster account
      if (farcasterUser) {
        const farcasterUrl = `https://farcaster.xyz/${farcasterUser.username}?ref=2ORGMS`;
        creatorInfo.push(`📱 Farcaster: [@${farcasterUser.username}](${farcasterUrl})`);
      } else {
        creatorInfo.push(`📱 Farcaster: None`);
      }
      
      // Zora account
      if (zoraSummary && (zoraSummary.latestCoin?.coin || (zoraSummary.createdCoins ?? []).length > 0)) {
        const zoraHandle = zoraSummary.profile.handle || zoraSummary.profile.farcasterHandle || "Profile";
        const zoraUrl = zoraSummary.profile.handle 
          ? `https://zora.co/${zoraSummary.profile.handle}`
          : `https://zora.co/profile/${creatorAddress}`;
        creatorInfo.push(`🎨 Zora: [${zoraHandle}](${zoraUrl})`);
      } else {
        creatorInfo.push(`🎨 Zora: None`);
      }
    } catch (error) {
      console.error(`[Multi-Chain Token] Failed to check Farcaster/Zora for creator ${creatorAddress}:`, error);
      creatorInfo.push(`📱 Farcaster: None`);
      creatorInfo.push(`🎨 Zora: None`);
    }
    
    embed.addFields({
      name: "🛠️ Developer",
      value: creatorInfo.join("\n"),
      inline: false,
    });
  }

  // Market Cap
  if (tokenData.marketCap != null) {
    embed.addFields({
      name: "💸 MarketCap",
      value: formatCurrency(tokenData.marketCap),
      inline: false,
    });
  }

  // Factory Information (if available)
  if (tokenData.factoryName) {
    embed.addFields({
      name: "Factory",
      value: `🏭 ${tokenData.factoryName}`,
      inline: false,
    });
  }

  // Additional Token Metrics (if available)
  const additionalMetrics: string[] = [];
  
  if (tokenData.priceUsd != null) {
    additionalMetrics.push(`💰 Price: ${formatCurrency(tokenData.priceUsd)}`);
  }
  
  if (tokenData.fdv != null && tokenData.fdv !== tokenData.marketCap) {
    additionalMetrics.push(`💎 FDV: ${formatCurrency(tokenData.fdv)}`);
  }
  
  if (tokenData.liquidity != null) {
    additionalMetrics.push(`💧 Liq: ${formatCurrency(tokenData.liquidity)}`);
  }
  
  if (tokenData.volume24h != null) {
    additionalMetrics.push(`📊 Vol 24H: ${formatCurrency(tokenData.volume24h)}`);
  }
  
  if (tokenData.priceChange24h != null) {
    const change = tokenData.priceChange24h;
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

  // Trading Activity (compact - all in one row, matching Base token layout)
  if (tokenData.trades24h) {
    const trades = tokenData.trades24h;
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

  applyBranding(embed, `${tokenData.chainName.toLowerCase()} token`);
  return { embed, components: [] };
}








