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
  // First, preserve markdown links BEFORE processing other formatting
  // This ensures links are protected during processing
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ full: string; text: string; url: string; placeholder: string }> = [];
  let linkMatch;
  let linkIndex = 0;
  const seenLinks = new Map<string, number>();
  
  // Extract all links first
  let tempValue = value;
  while ((linkMatch = linkRegex.exec(value)) !== null) {
    const fullMatch = linkMatch[0];
    const linkText = linkMatch[1];
    const linkUrl = linkMatch[2];
    const linkKey = `${linkText}|${linkUrl}`;
    
    if (!seenLinks.has(linkKey)) {
      const placeholder = `__LINK_PLACEHOLDER_${linkIndex}__`;
      seenLinks.set(linkKey, linkIndex);
      links.push({
        full: fullMatch,
        text: linkText,
        url: linkUrl,
        placeholder,
      });
      tempValue = tempValue.replace(fullMatch, placeholder);
      linkIndex++;
    }
  }
  value = tempValue;

  // Handle code blocks (```address```) - convert addresses/contracts to clickable code links
  // For Telegram: use code formatting with clickable links [code](url)
  value = value.replace(/```([^`]+)```/g, (match, content) => {
    const lines = content.trim().split("\n");
    return lines.map((line: string) => {
      const trimmed = line.trim();
      // Check if it's an Ethereum address/contract
      if (/^0x[a-fA-F0-9]{40}$/i.test(trimmed)) {
        // Make it clickable code: [address](url) - Telegram will show as clickable code
        const basescanUrl = `https://basescan.org/address/${trimmed}`;
        return `[\`${trimmed}\`](${basescanUrl})`;
      }
      // Check if it's a Solana address
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/i.test(trimmed)) {
        const solscanUrl = `https://solscan.io/account/${trimmed}`;
        return `[${trimmed}](${solscanUrl})`;
      }
      // Not an address, keep as code block
      return `\`${trimmed}\``;
    }).join("\n");
  });

  // Handle inline code (`code`) - convert addresses/contracts to clickable code links
  value = value.replace(/`([^`]+)`/g, (match, content) => {
    const trimmed = content.trim();
    // Check if it's an Ethereum address/contract
    if (/^0x[a-fA-F0-9]{40}$/i.test(trimmed)) {
      // Make it clickable - Telegram will show as clickable link
      const basescanUrl = `https://basescan.org/address/${trimmed}`;
      return `[${trimmed}](${basescanUrl})`;
    }
    // Check if it's a Solana address
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/i.test(trimmed)) {
      const solscanUrl = `https://solscan.io/account/${trimmed}`;
      return `[${trimmed}](${solscanUrl})`;
    }
    // Not an address, keep as code
    return `\`${trimmed}\``;
  });
  
  // Convert plain addresses (not in links) to clickable links
  // Process addresses that appear in plain text (after code blocks are processed)
  // Find all addresses and convert them if they're not already in links
  const ethAddressRegex = /\b(0x[a-fA-F0-9]{40})\b/gi;
  const ethMatches: Array<{ address: string; index: number }> = [];
  let ethMatch;
  let originalValue = value;
  
  while ((ethMatch = ethAddressRegex.exec(originalValue)) !== null) {
    const before = originalValue.substring(0, ethMatch.index);
    const after = originalValue.substring(ethMatch.index + ethMatch[0].length);
    
    // Skip if it's already in a markdown link [text](url)
    const linkStart = before.lastIndexOf('[');
    const linkEnd = after.indexOf('](');
    if (linkStart !== -1 && linkEnd !== -1) {
      const between = before.substring(linkStart);
      if (!between.includes(']')) {
        continue; // Already in a link
      }
    }
    
    // Skip if it's in a URL
    if (/https?:\/\/[^\s]*$/.test(before)) {
      continue;
    }
    
    ethMatches.push({
      address: ethMatch[1],
      index: ethMatch.index,
    });
  }
  
  // Replace from end to start to preserve indices
  for (let i = ethMatches.length - 1; i >= 0; i--) {
    const { address, index } = ethMatches[i];
    const basescanUrl = `https://basescan.org/address/${address}`;
    // Format as clickable code: [address](url) - Telegram will show as clickable
    // Note: Can't nest backticks in Telegram links, so just make it a clickable link
    value = value.substring(0, index) + `[${address}](${basescanUrl})` + value.substring(index + address.length);
  }
  
  // Convert Solana addresses
  const solAddressRegex = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/gi;
  const solMatches: Array<{ address: string; index: number }> = [];
  let solMatch;
  originalValue = value; // Use updated value
  
  while ((solMatch = solAddressRegex.exec(originalValue)) !== null) {
    const before = originalValue.substring(0, solMatch.index);
    const after = originalValue.substring(solMatch.index + solMatch[0].length);
    
    // Skip if it's already in a markdown link
    const linkStart = before.lastIndexOf('[');
    const linkEnd = after.indexOf('](');
    if (linkStart !== -1 && linkEnd !== -1) {
      const between = before.substring(linkStart);
      if (!between.includes(']')) {
        continue; // Already in a link
      }
    }
    
    // Skip if it's in a URL
    if (/https?:\/\/[^\s]*$/.test(before)) {
      continue;
    }
    
    solMatches.push({
      address: solMatch[1],
      index: solMatch.index,
    });
  }
  
  // Replace from end to start
  for (let i = solMatches.length - 1; i >= 0; i--) {
    const { address, index } = solMatches[i];
    const solscanUrl = `https://solscan.io/account/${address}`;
    // Format as clickable link
    value = value.substring(0, index) + `[${address}](${solscanUrl})` + value.substring(index + address.length);
  }
  
  // Remove Discord markdown that Telegram doesn't support well
  // Convert **bold** to *bold* (Telegram uses single asterisk)
  value = value.replace(/\*\*([^*]+)\*\*/g, "*$1*");
  
  // Remove __underline__ (Telegram doesn't support underline)
  value = value.replace(/__([^_]+)__/g, "$1");

  // Convert usernames to clickable links in Telegram
  // Match patterns like: "Handle: @username", "Farcaster: @username", "Username: @username"
  // Convert to: "Handle: [username](url)", "Farcaster: [username](url)", etc.
  const { buildFarcasterProfileUrl } = require("../../../utils/farcasterLinks");
  
  // First, convert labeled usernames (Handle:, Farcaster:, Username:)
  value = value.replace(/(Handle|Farcaster|Username):\s*@([a-zA-Z0-9_]+)/g, (match, label, username, offset, fullString) => {
    // Check if this is already inside a markdown link
    const before = fullString.substring(0, offset);
    const linkStart = before.lastIndexOf('[');
    const linkEnd = fullString.substring(offset + match.length).indexOf('](');
    if (linkStart !== -1 && linkEnd !== -1) {
      const between = before.substring(linkStart);
      if (!between.includes(']')) {
        return match; // Already in a link, don't modify
      }
    }
    
    // Build Farcaster profile URL
    const url = buildFarcasterProfileUrl(username);
    return `${label}: [${username}](${url})`;
  });
  
  // Then handle standalone @username patterns (not in a label and not already converted)
  // Process from end to start to avoid index issues
  let processedValue = value;
  const usernameRegex = /@([a-zA-Z0-9_]+)/g;
  const usernameMatches2: Array<{ match: string; username: string; offset: number }> = [];
  let usernameMatch2;
  
  while ((usernameMatch2 = usernameRegex.exec(value)) !== null) {
    const before = value.substring(0, usernameMatch2.index);
    const after = value.substring(usernameMatch2.index + usernameMatch2[0].length);
    
    // Skip if it's in a URL
    if (/https?:\/\/[^\s]*$/.test(before)) {
      continue;
    }
    
    // Skip if it's already in a markdown link
    const linkStart = before.lastIndexOf('[');
    const linkEnd = after.indexOf('](');
    if (linkStart !== -1 && linkEnd !== -1) {
      const between = before.substring(linkStart);
      if (!between.includes(']')) {
        continue; // Already in a link
      }
    }
    
    // Skip if it's part of a label we already processed (Handle:, Farcaster:, Username:)
    if (/(Handle|Farcaster|Username):\s*\[/.test(before)) {
      continue;
    }
    
    usernameMatches2.push({
      match: usernameMatch2[0],
      username: usernameMatch2[1],
      offset: usernameMatch2.index,
    });
  }
  
  // Replace from end to start to preserve offsets
  for (let i = usernameMatches2.length - 1; i >= 0; i--) {
    const { match: matchStr, username, offset } = usernameMatches2[i];
    const url = buildFarcasterProfileUrl(username);
    processedValue = processedValue.substring(0, offset) + `[${username}](${url})` + processedValue.substring(offset + matchStr.length);
  }
  
  value = processedValue;

  // Clean up separators and extra formatting
  value = value
    .replace(/^---+\s*$/gm, "") // Remove separator lines
    .replace(/^\.\.\.\+\d+$/gm, "") // Remove "...+1" type indicators
    .replace(/\n{3,}/g, "\n\n") // Max 2 newlines
    .replace(/^\s+|\s+$/gm, "") // Trim lines
    .replace(/^None$/gm, "") // Remove standalone "None" values
    .replace(/\*None\*/g, ""); // Remove bold "None"

  // Restore markdown links (replace placeholders back to actual links)
  // Links are already in markdown format, so they'll work in Telegram
  links.forEach((link) => {
    // Use a more specific replacement to avoid conflicts
    const placeholderRegex = new RegExp(link.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    value = value.replace(placeholderRegex, `[${link.text}](${link.url})`);
  });

  // Don't escape markdown here - links are already in correct format
  // Telegram will handle the markdown links correctly

  return value.trim();
}

/**
 * Clean markdown text - remove unnecessary formatting
 */
function cleanMarkdownText(text: string): string {
  if (!text) return "";
  
  // Preserve links first
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ full: string; text: string; url: string; placeholder: string }> = [];
  let linkMatch2;
  let linkIndex = 0;
  const seenLinks = new Map<string, number>();
  
  let tempText = text;
  while ((linkMatch2 = linkRegex.exec(text)) !== null) {
    const fullMatch = linkMatch2[0];
    const linkText = linkMatch2[1];
    const linkUrl = linkMatch2[2];
    const linkKey = `${linkText}|${linkUrl}`;
    
    if (!seenLinks.has(linkKey)) {
      const placeholder = `__LINK_PLACEHOLDER_${linkIndex}__`;
      seenLinks.set(linkKey, linkIndex);
      links.push({
        full: fullMatch,
        text: linkText,
        url: linkUrl,
        placeholder,
      });
      tempText = tempText.replace(fullMatch, placeholder);
      linkIndex++;
    }
  }
  text = tempText;
  
  // Remove code block markers
  text = text.replace(/```/g, "");
  
  // Remove backticks
  text = text.replace(/`/g, "");
  
  // Convert **bold** to *bold* (Telegram uses single asterisk)
  text = text.replace(/\*\*([^*]+)\*\*/g, "*$1*");
  
  // Remove __underline__
  text = text.replace(/__([^_]+)__/g, "$1");
  
  // Convert usernames to clickable links
  const { buildFarcasterProfileUrl } = require("../../../utils/farcasterLinks");
  
  // Convert labeled usernames
  text = text.replace(/(Handle|Farcaster|Username):\s*@([a-zA-Z0-9_]+)/g, (match, label, username) => {
    const url = buildFarcasterProfileUrl(username);
    return `${label}: [${username}](${url})`;
  });
  
  // Convert standalone @username patterns
  let processedText = text;
  const usernameRegex = /@([a-zA-Z0-9_]+)/g;
  const usernameMatches: Array<{ match: string; username: string; offset: number }> = [];
  
  while ((linkMatch2 = usernameRegex.exec(text)) !== null) {
    const before = text.substring(0, linkMatch2.index);
    const after = text.substring(linkMatch2.index + linkMatch2[0].length);
    
    // Skip if it's in a URL
    if (/https?:\/\/[^\s]*$/.test(before)) {
      continue;
    }
    
    // Skip if it's already in a markdown link
    const linkStart = before.lastIndexOf('[');
    const linkEnd = after.indexOf('](');
    if (linkStart !== -1 && linkEnd !== -1) {
      const between = before.substring(linkStart);
      if (!between.includes(']')) {
        continue;
      }
    }
    
    // Skip if it's part of a label we already processed
    if (/(Handle|Farcaster|Username):\s*\[/.test(before)) {
      continue;
    }
    
    usernameMatches.push({
      match: linkMatch2[0],
      username: linkMatch2[1],
      offset: linkMatch2.index,
    });
  }
  
  // Replace from end to start
  for (let i = usernameMatches.length - 1; i >= 0; i--) {
    const { match: matchStr, username, offset } = usernameMatches[i];
    const url = buildFarcasterProfileUrl(username);
    processedText = processedText.substring(0, offset) + `[${username}](${url})` + processedText.substring(offset + matchStr.length);
  }
  
  text = processedText;
  
  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, "\n\n");
  
  // Restore links first (they're already in markdown format)
  links.forEach((link) => {
    const placeholderRegex = new RegExp(link.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    text = text.replace(placeholderRegex, `[${link.text}](${link.url})`);
  });
  
  // Don't escape markdown - links are already in correct format for Telegram
  // Only escape if there are no links (to avoid breaking link syntax)
  if (links.length === 0) {
    text = escapeMarkdown(text);
  }
  
  return text;
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
 * Format address for Telegram - makes it clickable
 */
export function formatAddressForTelegram(address: string, chainId?: number): string {
  // For Telegram, show full address as clickable link
  // Users can long-press to copy, or click to open in browser
  if (chainId === 8453) {
    return `[${address}](https://basescan.org/address/${address})`;
  }
  // Check if it's a Solana address
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/i.test(address)) {
    return `[${address}](https://solscan.io/account/${address})`;
  }
  // Default to Etherscan for Ethereum addresses
  return `[${address}](https://etherscan.io/address/${address})`;
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

