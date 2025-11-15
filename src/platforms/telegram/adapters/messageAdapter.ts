import type { EmbedBuilder } from "discord.js";

/**
 * Convert Discord embed to Telegram message format
 * Clean, concise format matching Discord's appearance
 */
export function convertToTelegramMessage(embed: EmbedBuilder): string {
  const data = embed.data;
  const parts: string[] = [];

  // Title
  if (data.title) {
    const title = cleanMarkdownText(data.title);
    parts.push(`*${title}*`);
  }

  // Description (if present)
  if (data.description) {
    const desc = cleanMarkdownText(data.description);
    if (desc.trim()) {
      parts.push(desc);
    }
  }

  // Fields - format cleanly
  if (data.fields && data.fields.length > 0) {
    for (const field of data.fields) {
      if (!field.name && !field.value) continue;

      // Skip empty, "None", or separator fields
      const valueTrimmed = field.value?.trim() || "";
      if (valueTrimmed === "None" || valueTrimmed === "" || valueTrimmed === "---" || /^---+$/.test(valueTrimmed)) {
        continue;
      }
      
      // Skip fields with only separators or placeholders
      if (valueTrimmed.includes("__LINK_") && !valueTrimmed.match(/\[.*\]\(.*\)/)) {
        // If it only has broken link placeholders, skip it
        continue;
      }

      parts.push(""); // Spacing between fields

      if (field.name) {
        const name = cleanMarkdownText(field.name);
        // Only show field name if there's actual content
        if (field.value && field.value.trim()) {
          parts.push(`*${name}*`);
        }
      }

      if (field.value) {
        const value = formatFieldValue(field.value);
        if (value.trim()) {
          parts.push(value);
        }
      }
    }
  }

  // Footer (minimal)
  if (data.footer?.text) {
    parts.push("");
    const footer = cleanMarkdownText(data.footer.text);
    parts.push(`_${footer}_`);
  }

  return parts.join("\n").trim();
}

/**
 * Format field value for Telegram - handle code blocks, links, etc.
 */
function formatFieldValue(value: string): string {
  // Handle code blocks (```address```) - convert to monospace
  value = value.replace(/```([^`]+)```/g, (match, content) => {
    // If it's a single address, format it cleanly
    const trimmed = content.trim();
    if (/^0x[a-fA-F0-9]{40}$/i.test(trimmed) || /^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(trimmed)) {
      return `\`${trimmed}\``;
    }
    // Multiple addresses or other code blocks
    return trimmed.split("\n").map((line: string) => `\`${line.trim()}\``).join("\n");
  });

  // Handle inline code (`code`)
  value = value.replace(/`([^`]+)`/g, "`$1`");

  // Remove @ symbols from usernames (Telegram auto-links @ mentions)
  // Process before link preservation to avoid breaking links
  // Remove @ from common patterns: "Handle: @username", "Farcaster: @username", "@username"
  // But preserve @ in URLs (they contain :// or are in markdown links)
  value = value.replace(/@([a-zA-Z0-9_]+)/g, (match, username, offset, fullString) => {
    // Check if this @ is part of a URL or markdown link
    const before = fullString.substring(0, offset);
    const after = fullString.substring(offset + match.length);
    
    // Check if it's in a URL (has http:// or https:// before it)
    if (/https?:\/\/[^\s]*$/.test(before)) {
      return match; // Keep @ in URLs
    }
    
    // Check if it's inside a markdown link [text](url)
    // Look backwards for [ and forwards for ](
    const linkStart = before.lastIndexOf('[');
    const linkEnd = after.indexOf('](');
    if (linkStart !== -1 && linkEnd !== -1 && linkStart < offset) {
      // Check if there's no ] between linkStart and our position
      const between = before.substring(linkStart);
      if (!between.includes(']')) {
        return match; // Keep @ if it's inside markdown link text
      }
    }
    
    return username; // Remove @ for standalone usernames
  });

  // Clean up separators and extra formatting
  value = value
    .replace(/^---+\s*$/gm, "") // Remove separator lines
    .replace(/^\.\.\.\+\d+$/gm, "") // Remove "...+1" type indicators
    .replace(/\n{3,}/g, "\n\n") // Max 2 newlines
    .replace(/^\s+|\s+$/gm, "") // Trim lines
    .replace(/^None$/gm, "") // Remove standalone "None" values
    .replace(/\*\*None\*\*/g, ""); // Remove bold "None"

  // Preserve markdown links
  value = preserveMarkdownLinks(value);

  return value.trim();
}

/**
 * Clean markdown text - remove unnecessary formatting
 */
function cleanMarkdownText(text: string): string {
  if (!text) return "";
  
  // Remove code block markers that weren't processed
  text = text.replace(/```/g, "");
  
  // Remove @ symbols from usernames (Telegram auto-links @ mentions)
  // But preserve @ in URLs and markdown links
  text = text.replace(/@([a-zA-Z0-9_]+)/g, (match, username, offset, fullString) => {
    // Check if it's in a URL
    const before = fullString.substring(0, offset);
    if (/https?:\/\/[^\s]*$/.test(before)) {
      return match; // Keep @ in URLs
    }
    
    // Check if it's inside a markdown link [text](url)
    const linkStart = before.lastIndexOf('[');
    const linkEnd = fullString.substring(offset + match.length).indexOf('](');
    if (linkStart !== -1 && linkEnd !== -1) {
      const between = before.substring(linkStart);
      if (!between.includes(']')) {
        return match; // Keep @ if it's inside markdown link text
      }
    }
    
    return username; // Remove @ for standalone usernames
  });
  
  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, "\n\n");
  
  // Escape markdown but preserve links
  return preserveMarkdownLinks(text);
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
 * Fixed to properly handle link replacement
 */
function preserveMarkdownLinks(text: string): string {
  if (!text) return "";
  
  // Match markdown links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ full: string; text: string; url: string; placeholder: string }> = [];
  let match;
  let linkIndex = 0;
  
  // Extract all unique links
  const seenLinks = new Map<string, number>();
  
  while ((match = linkRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const linkText = match[1];
    const linkUrl = match[2];
    const linkKey = `${linkText}|${linkUrl}`;
    
    if (!seenLinks.has(linkKey)) {
      const placeholder = `__TELEGRAM_LINK_${linkIndex}__`;
      seenLinks.set(linkKey, linkIndex);
      links.push({
        full: fullMatch,
        text: linkText,
        url: linkUrl,
        placeholder,
      });
      linkIndex++;
    }
  }
  
  // Replace links with unique placeholders
  let processed = text;
  links.forEach((link) => {
    // Use a more unique placeholder to avoid conflicts
    processed = processed.replace(link.full, link.placeholder);
  });
  
  // Escape markdown in the rest of the text
  processed = escapeMarkdown(processed);
  
  // Restore links
  links.forEach((link) => {
    processed = processed.replace(link.placeholder, `[${link.text}](${link.url})`);
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

