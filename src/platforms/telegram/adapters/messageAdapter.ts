import type { EmbedBuilder } from "discord.js";

/**
 * Convert Discord embed to Telegram message format
 */
export function convertToTelegramMessage(embed: EmbedBuilder): string {
  const data = embed.data;
  const parts: string[] = [];

  // Title
  if (data.title) {
    // Escape markdown special characters in title
    const title = escapeMarkdown(data.title);
    parts.push(`*${title}*`);
  }

  // Description
  if (data.description) {
    parts.push(escapeMarkdown(data.description));
  }

  // Fields
  if (data.fields && data.fields.length > 0) {
    for (const field of data.fields) {
      if (field.name || field.value) {
        parts.push(""); // Add spacing between fields
        if (field.name) {
          const name = escapeMarkdown(field.name);
          parts.push(`*${name}*`);
        }
        if (field.value) {
          // Field values may contain markdown links, so we preserve them
          // Only escape if it's not already a markdown link
          const value = preserveMarkdownLinks(field.value);
          parts.push(value);
        }
      }
    }
  }

  // Footer
  if (data.footer?.text) {
    parts.push("");
    parts.push(`_${escapeMarkdown(data.footer.text)}_`);
  }

  // URL (if present, add as link)
  if (data.url) {
    parts.push("");
    parts.push(`[View Details](${data.url})`);
  }

  return parts.join("\n").trim();
}

/**
 * Escape markdown special characters for Telegram
 */
function escapeMarkdown(text: string): string {
  // Telegram uses * for bold, _ for italic, ` for code, [](url) for links
  // We need to escape these if they're not part of a link
  return text
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/`/g, "\\`");
}

/**
 * Preserve markdown links while escaping other markdown
 */
function preserveMarkdownLinks(text: string): string {
  // Match markdown links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ full: string; text: string; url: string }> = [];
  let match;
  
  // Extract all links
  while ((match = linkRegex.exec(text)) !== null) {
    links.push({
      full: match[0],
      text: match[1],
      url: match[2],
    });
  }
  
  // Replace links with placeholders (replace all occurrences)
  let processed = text;
  links.forEach((link, index) => {
    // Use global replace with a function to replace all occurrences
    processed = processed.split(link.full).join(`__LINK_${index}__`);
  });
  
  // Escape markdown in the rest of the text
  processed = escapeMarkdown(processed);
  
  // Restore links (replace all occurrences)
  links.forEach((link, index) => {
    processed = processed.split(`__LINK_${index}__`).join(`[${link.text}](${link.url})`);
  });
  
  return processed;
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

