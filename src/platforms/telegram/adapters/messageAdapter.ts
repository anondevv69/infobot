import type { EmbedBuilder } from "discord.js";

/**
 * Convert Discord embed to Telegram message format
 */
export function convertToTelegramMessage(embed: EmbedBuilder): string {
  const data = embed.data;
  const parts: string[] = [];

  // Title
  if (data.title) {
    parts.push(`*${data.title}*`);
  }

  // Description
  if (data.description) {
    parts.push(data.description);
  }

  // Fields
  if (data.fields) {
    for (const field of data.fields) {
      if (field.name) {
        parts.push(`\n*${field.name}*`);
      }
      if (field.value) {
        parts.push(field.value);
      }
    }
  }

  // Footer
  if (data.footer?.text) {
    parts.push(`\n_${data.footer.text}_`);
  }

  // URL (if present, add as link)
  if (data.url) {
    parts.push(`\n[View Details](${data.url})`);
  }

  return parts.join("\n");
}

/**
 * Format address for Telegram
 */
export function formatAddressForTelegram(address: string, chainId?: number): string {
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const basescanUrl = chainId === 8453 
    ? `https://basescan.org/address/${address}`
    : `https://etherscan.io/address/${address}`;
  
  return `[${shortAddress}](${basescanUrl})`;
}

/**
 * Format compact number for Telegram
 */
export function formatCompactNumberForTelegram(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

