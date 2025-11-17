import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { MultiChainTokenData } from "../services/dexscreener";
import { applyBranding } from "./branding";

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

function getChainExplorerUrl(chainId: string, address: string): string {
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
  };
  return explorerMap[chainId.toLowerCase()] ?? `https://etherscan.io/address/${address}`;
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
  };
  return colorMap[chainId.toLowerCase()] ?? 0x627eea;
}

export function buildMultiChainTokenEmbed(
  contractAddress: string,
  tokenData: MultiChainTokenData,
): {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const title = tokenData.tokenSymbol && tokenData.tokenName
    ? `${tokenData.tokenSymbol} • ${tokenData.tokenName}`
    : tokenData.tokenName ?? tokenData.tokenSymbol ?? `${tokenData.chainName} Token`;

  const explorerUrl = getChainExplorerUrl(tokenData.chainId, contractAddress);
  const chainColor = getChainColor(tokenData.chainId);

  const embed = new EmbedBuilder()
    .setColor(chainColor)
    .setTitle(`🪙 ${title}`)
    .setURL(explorerUrl);

  // Chain Information
  embed.addFields({
    name: "Chain",
    value: `🔗 ${tokenData.chainName}`,
    inline: false,
  });

  // Token Metrics
  const metricsLines: string[] = [];
  
  if (tokenData.priceUsd != null) {
    metricsLines.push(`💰 Price: ${formatCurrency(tokenData.priceUsd)}`);
  }
  
  if (tokenData.marketCap != null) {
    metricsLines.push(`💎 MC: ${formatCurrency(tokenData.marketCap)}`);
  }
  
  if (tokenData.fdv != null && tokenData.fdv !== tokenData.marketCap) {
    metricsLines.push(`💎 FDV: ${formatCurrency(tokenData.fdv)}`);
  }
  
  if (tokenData.liquidity != null) {
    metricsLines.push(`💧 Liq: ${formatCurrency(tokenData.liquidity)}`);
  }
  
  if (tokenData.volume24h != null) {
    metricsLines.push(`📊 Vol 24H: ${formatCurrency(tokenData.volume24h)}`);
  }
  
  if (tokenData.priceChange24h != null) {
    const change = tokenData.priceChange24h;
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
  if (tokenData.trades24h) {
    const trades = tokenData.trades24h;
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

  // Contract Address
  embed.addFields({
    name: "Contract",
    value: `\`\`\`\n${contractAddress}\n\`\`\``,
    inline: false,
  });

  // Add DEX link button if available
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (tokenData.dexUrl) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("View on DEX")
        .setURL(tokenData.dexUrl)
        .setStyle(ButtonStyle.Link),
    );
    components.push(row);
  }

  // Add explorer link button
  const explorerRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(`View on ${tokenData.chainName} Explorer`)
      .setURL(explorerUrl)
      .setStyle(ButtonStyle.Link),
  );
  components.push(explorerRow);

  applyBranding(embed, `${tokenData.chainName.toLowerCase()} token`);
  return { embed, components };
}

