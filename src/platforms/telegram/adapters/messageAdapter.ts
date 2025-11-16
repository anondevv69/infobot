import type { EmbedBuilder } from "discord.js";

/**
 * Escape Telegram Markdown special characters
 * Only escape the essential characters that break Telegram Markdown
 * Don't escape periods, exclamation marks, etc. - they're usually fine
 */
function escapeTelegramMarkdown(text: string): string {
  if (!text) return "";
  
  // Only escape characters that commonly break Telegram Markdown
  // Don't escape periods, exclamation marks, etc. unless they're in problematic contexts
  return text
    .replace(/\*/g, "\\*")  // Asterisks for bold
    .replace(/_/g, "\\_")   // Underscores for italic
    .replace(/`/g, "\\`")   // Backticks for code
    .replace(/\[/g, "\\[")  // Square brackets (but we'll handle links separately)
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")  // Parentheses (but we'll handle links separately)
    .replace(/\)/g, "\\)");
}

/**
 * Escape text but preserve markdown links [text](url)
 * This is the main function to use for Telegram messages
 */
function escapeTelegramButPreserveLinks(text: string): string {
  if (!text) return "";
  
  // Extract all markdown links first
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ full: string; text: string; url: string; placeholder: string }> = [];
  let match;
  let linkIndex = 0;
  const originalText = text;
  
  // Find all links and replace with placeholders
  while ((match = linkRegex.exec(originalText)) !== null) {
    const placeholder = `__LINK_${linkIndex}__`;
    links.push({
      full: match[0],
      text: match[1],
      url: match[2], // URLs should NOT be escaped
      placeholder,
    });
    text = text.replace(match[0], placeholder);
    linkIndex++;
  }
  
  // Escape the rest of the text (but not the placeholders)
  text = escapeTelegramMarkdown(text);
  
  // Restore links - escape the link text, but NOT the URL
  links.forEach((link) => {
    // Escape the link text, but NOT the URL
    const escapedText = escapeTelegramMarkdown(link.text);
    text = text.replace(link.placeholder, `[${escapedText}](${link.url})`);
  });
  
  return text;
}

/**
 * Convert Discord embed to Telegram message format
 * Clean, concise format matching Discord's appearance
 */
export function convertToTelegramMessage(embed: EmbedBuilder): string {
  const data = embed.data;
  const parts: string[] = [];

  // Title - make it clickable if there's a URL
  if (data.title) {
    let title = cleanMarkdownText(data.title);
    // Escape title text first
    const escapedTitle = escapeTelegramMarkdown(title);
    
    // If embed has a URL, make the title clickable
    if (data.url) {
      // URL should NOT be escaped - Telegram handles URLs in markdown links
      title = `[${escapedTitle}](${data.url})`;
    } else {
      title = escapedTitle;
    }
    // Wrap in bold asterisks (these are markdown, not escaped)
    parts.push(`*${title}*`);
  }

  // Description (if present)
  if (data.description) {
    const desc = cleanMarkdownText(data.description);
    if (desc.trim()) {
      // Escape description but preserve any links
      parts.push(escapeTelegramButPreserveLinks(desc));
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
          // Escape field name
          const escapedName = escapeTelegramMarkdown(name);
          parts.push(`*${escapedName}*`);
        }
      }

      if (field.value) {
        const value = formatFieldValue(field.value);
        if (value.trim()) {
          // formatFieldValue should have restored all placeholders, but if any remain, remove them
          // Then escape but preserve links
          let processedValue = value;
          
          // Remove any remaining placeholders (they should have been restored)
          processedValue = processedValue.replace(/__[A-Z_]+_\d+__/gi, "");
          
          // Now escape but preserve links
          parts.push(escapeTelegramButPreserveLinks(processedValue));
        }
      }
    }
  }

  // Footer (minimal)
  if (data.footer?.text) {
    parts.push("");
    const footer = cleanMarkdownText(data.footer.text);
    // Escape footer text, then wrap in italic underscores (these are markdown, not escaped)
    const escapedFooter = escapeTelegramMarkdown(footer);
    parts.push(`_${escapedFooter}_`);
  }

  // Join all parts and do final cleanup
  let finalMessage = parts.join("\n").trim();
  
  // CRITICAL: Remove ALL placeholders before sending
  // Placeholders with underscores break Telegram Markdown
  // Try multiple patterns to catch all variants
  const placeholderPatterns = [
    /__[A-Z_]+_\d+__/gi,
    /__LINK_\d+__/gi,
    /__TELEGRAM_LINK_\d+__/gi,
    /__EXISTING_LINK_\d+__/gi,
    /__TEMP_LINK_\d+__/gi,
    /__TEMP_PLACEHOLDER_\d+__/gi,
    /__LINK_PLACEHOLDER_\d+__/gi,
    /\\_\\_[A-Z_]+_\d+\\_\\_/gi,  // Escaped placeholders
  ];
  
  placeholderPatterns.forEach((pattern) => {
    finalMessage = finalMessage.replace(pattern, "");
  });
  
  // Also remove any lines that only contain placeholders
  finalMessage = finalMessage.replace(/^.*__[A-Z_]+_\d+__.*$/gm, "");
  
  // Final cleanup: remove any leftover placeholders, extra asterisks, backticks
  finalMessage = finalCleanup(finalMessage);

  return finalMessage;
}

/**
 * Final cleanup to remove any leftover placeholders and formatting artifacts
 * CRITICAL: This must remove ALL placeholders, as they will break Telegram formatting
 */
function finalCleanup(text: string): string {
  if (!text) return "";
  
  // AGGRESSIVE: Remove ALL placeholder variants (they should have been restored by now)
  // If any remain, they'll break Telegram Markdown parsing
  const placeholderPatterns = [
    // Standard placeholders
    /__[A-Z_]+_\d+__/gi,
    // Escaped placeholders
    /\\?__[A-Z_]+_\d+\\?__/gi,
    // Fully escaped placeholders
    /\\_\\_[A-Z_]+_\d+\\_\\_/gi,
    // Placeholders without underscores
    /(?:TEMP_LINK|TEMP_PLACEHOLDER|LINK_PLACEHOLDER|EXISTING_LINK|PLACEHOLDER|TELEGRAM_LINK)\d+/gi,
    // Lines containing only placeholders
    /^.*__(?:TEMP_|PLACEHOLDER_|LINK_|EXISTING_).*$/gm,
  ];
  
  placeholderPatterns.forEach((pattern) => {
    text = text.replace(pattern, "");
  });
  
  // Remove triple or more asterisks (*** or more)
  text = text.replace(/\*{3,}/g, "");
  
  // Remove any leftover backticks (we've already converted addresses to links)
  text = text.replace(/`/g, "");
  
  // Remove any escaped backticks that are now unnecessary
  text = text.replace(/\\`/g, "");
  
  // Remove any double spaces
  text = text.replace(/  +/g, " ");
  
  // Remove any empty lines with just whitespace
  text = text.replace(/^\s+$/gm, "");
  
  // Clean up multiple newlines (max 2)
  text = text.replace(/\n{3,}/g, "\n\n");
  
  return text.trim();
}

/**
 * Format field value for Telegram - handle code blocks, links, etc.
 */
function formatFieldValue(value: string): string {
  // First, preserve existing markdown links by extracting them
  // We'll restore them at the end after all processing
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const existingLinks: Array<{ full: string; text: string; url: string; placeholder: string }> = [];
  let linkMatch;
  let linkIndex = 0;
  const seenLinks = new Map<string, number>();
  
  // Extract all existing links first
  let tempValue = value;
  while ((linkMatch = linkRegex.exec(value)) !== null) {
    const fullMatch = linkMatch[0];
    const linkText = linkMatch[1];
    const linkUrl = linkMatch[2];
    const linkKey = `${linkText}|${linkUrl}`;
    
    if (!seenLinks.has(linkKey)) {
      const placeholder = `__EXISTING_LINK_${linkIndex}__`;
      seenLinks.set(linkKey, linkIndex);
      existingLinks.push({
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
        // Make it clickable - Telegram will show as clickable link
        const basescanUrl = `https://basescan.org/address/${trimmed}`;
        return `[${trimmed}](${basescanUrl})`;
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
    
    // Skip if it's inside a placeholder
    if (/__(?:TEMP_LINK_|TEMP_PLACEHOLDER_|LINK_PLACEHOLDER_|EXISTING_LINK_|PLACEHOLDER_)\d+__/.test(before + ethMatch[0] + after)) {
      continue;
    }
    
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
    
    // Skip if it's inside a placeholder
    if (/__(?:TEMP_LINK_|TEMP_PLACEHOLDER_|LINK_PLACEHOLDER_|EXISTING_LINK_|PLACEHOLDER_)\d+__/.test(before + solMatch[0] + after)) {
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
  // But preserve our temporary link placeholders
  value = value.replace(/__(?!TEMP_LINK_|TEMP_PLACEHOLDER_|LINK_PLACEHOLDER_|EXISTING_LINK_)([^_]+)__/g, "$1");

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
    
    // Skip if it's inside a placeholder
    if (/__(?:TEMP_LINK_|TEMP_PLACEHOLDER_|LINK_PLACEHOLDER_|EXISTING_LINK_|PLACEHOLDER_)\d+__/.test(before + usernameMatch2[0] + after)) {
      continue;
    }
    
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

  // CRITICAL: Restore the original links we preserved at the start (BEFORE escaping)
  // This MUST happen before escapeMarkdownButPreserveLinks, otherwise the placeholders
  // will be treated as plain text and not extracted as links
  // Do this multiple times to ensure all are restored
  for (let restoreAttempt = 0; restoreAttempt < 5; restoreAttempt++) {
    let restoredAny = false;
    existingLinks.forEach((link) => {
      // Try multiple regex patterns to catch escaped or modified placeholders
      const patterns = [
        new RegExp(link.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        new RegExp(link.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '\\_'), 'gi'),
        new RegExp(link.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/__/g, '__'), 'gi'),
      ];
      
      patterns.forEach((pattern) => {
        if (value.includes(link.placeholder) || pattern.test(value)) {
          const beforeReplace = value;
          value = value.replace(pattern, `[${link.text}](${link.url})`);
          if (value !== beforeReplace) {
            restoredAny = true;
          }
        }
      });
    });
    
    // If we didn't restore anything in this attempt, break early
    if (!restoredAny) {
      break;
    }
  }

  // Verify all EXISTING_LINK placeholders are restored before proceeding
  const remainingExisting = value.match(/__EXISTING_LINK_\d+__/gi);
  if (remainingExisting && remainingExisting.length > 0) {
    console.warn("Warning: Some EXISTING_LINK placeholders remain after restoration attempts:", remainingExisting);
    // Try one more aggressive pass
    existingLinks.forEach((link) => {
      const placeholderPattern = new RegExp(link.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      value = value.replace(placeholderPattern, `[${link.text}](${link.url})`);
    });
  }

  // Now escape markdown but preserve all links (both original and newly created)
  // This function will extract ALL links (including ones we just restored and newly created),
  // escape markdown, then restore them
  value = escapeMarkdownButPreserveLinks(value);

  // Final aggressive restoration: if any placeholders remain, try to restore them
  // This is a safety net in case some placeholders weren't caught earlier
  existingLinks.forEach((link) => {
    // Try to restore any remaining placeholders
    const placeholderPattern = new RegExp(link.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (placeholderPattern.test(value)) {
      value = value.replace(placeholderPattern, `[${link.text}](${link.url})`);
    }
  });

  // Before final cleanup, try one more time to restore any escaped placeholders
  // Handle cases where placeholders were escaped (e.g., \_\_TEMP_LINK_0\_\_)
  existingLinks.forEach((link) => {
    // Try to restore escaped placeholders
    const escapedPlaceholder = link.placeholder.replace(/_/g, '\\_');
    const escapedPattern = new RegExp(escapedPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (escapedPattern.test(value)) {
      value = value.replace(escapedPattern, `[${link.text}](${link.url})`);
    }
  });

  // CRITICAL: If we still have TEMP_PLACEHOLDER_X or EXISTING_LINK_X placeholders, 
  // we need to restore them aggressively. The issue is that these placeholders might
  // have been escaped or modified, so we need to try multiple approaches.
  
  // First, try to restore EXISTING_LINK placeholders one more time with very aggressive matching
  const existingLinkPattern = /__EXISTING_LINK_(\d+)__/gi;
  let existingLinkMatch;
  while ((existingLinkMatch = existingLinkPattern.exec(value)) !== null) {
    const index = parseInt(existingLinkMatch[1], 10);
    if (index < existingLinks.length) {
      const link = existingLinks[index];
      // Replace this specific occurrence
      value = value.replace(existingLinkMatch[0], `[${link.text}](${link.url})`);
    }
  }
  
  // Also try escaped versions
  const escapedExistingLinkPattern = /\\_\\_EXISTING_LINK_(\d+)\\_\\_/gi;
  let escapedExistingLinkMatch;
  while ((escapedExistingLinkMatch = escapedExistingLinkPattern.exec(value)) !== null) {
    const index = parseInt(escapedExistingLinkMatch[1], 10);
    if (index < existingLinks.length) {
      const link = existingLinks[index];
      value = value.replace(escapedExistingLinkMatch[0], `[${link.text}](${link.url})`);
    }
  }
  
  // Extract all markdown links from the value to see if we can match TEMP_PLACEHOLDER indices
  const allLinksRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const allLinks: Array<{ text: string; url: string }> = [];
  let allLinksMatch;
  while ((allLinksMatch = allLinksRegex.exec(value)) !== null) {
    allLinks.push({ text: allLinksMatch[1], url: allLinksMatch[2] });
  }
  
  // Try to restore TEMP_PLACEHOLDER_X - these should have been restored by escapeMarkdown
  // but if they weren't, try to match them with links we've seen
  const tempPlaceholderPattern = /__TEMP_PLACEHOLDER_(\d+)__/gi;
  let tempPlaceholderMatch;
  while ((tempPlaceholderMatch = tempPlaceholderPattern.exec(value)) !== null) {
    const index = parseInt(tempPlaceholderMatch[1], 10);
    // Try to find a corresponding link - this is a best-effort fallback
    // The index might correspond to a link that was extracted by escapeMarkdownButPreserveLinks
    // but we don't have access to that data here, so we'll try to match by position
    if (index < allLinks.length) {
      const link = allLinks[index];
      value = value.replace(tempPlaceholderMatch[0], `[${link.text}](${link.url})`);
    } else if (index < existingLinks.length) {
      // Fallback to existingLinks
      const link = existingLinks[index];
      value = value.replace(tempPlaceholderMatch[0], `[${link.text}](${link.url})`);
    }
  }
  
  // Also try escaped versions of TEMP_PLACEHOLDER
  const escapedTempPlaceholderPattern = /\\_\\_TEMP_PLACEHOLDER_(\d+)\\_\\_/gi;
  let escapedTempPlaceholderMatch;
  while ((escapedTempPlaceholderMatch = escapedTempPlaceholderPattern.exec(value)) !== null) {
    const index = parseInt(escapedTempPlaceholderMatch[1], 10);
    if (index < allLinks.length) {
      const link = allLinks[index];
      value = value.replace(escapedTempPlaceholderMatch[0], `[${link.text}](${link.url})`);
    } else if (index < existingLinks.length) {
      const link = existingLinks[index];
      value = value.replace(escapedTempPlaceholderMatch[0], `[${link.text}](${link.url})`);
    }
  }

  // Final cleanup: ensure no placeholders remain (only after all restoration attempts)
  // Also handle escaped versions - but ONLY if they're truly unrecoverable
  // First, try one more aggressive pass to restore EXISTING_LINK placeholders
  const remainingExistingLinks = value.match(/__EXISTING_LINK_\d+__/gi);
  if (remainingExistingLinks) {
    // Try to restore them by matching with existingLinks array
    remainingExistingLinks.forEach((placeholder) => {
      const match = placeholder.match(/__EXISTING_LINK_(\d+)__/i);
      if (match) {
        const index = parseInt(match[1], 10);
        if (index < existingLinks.length) {
          const link = existingLinks[index];
          value = value.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), `[${link.text}](${link.url})`);
        }
      }
    });
  }
  
  // CRITICAL: Remove any remaining placeholders that couldn't be restored
  // If placeholders remain, they'll break Telegram formatting
  // Try one more aggressive pass to remove ALL placeholder variants
  const allPlaceholderPatterns = [
    /__[A-Z_]+_\d+__/gi,  // Any placeholder format
    /\\?__[A-Z_]+_\d+\\?__/gi,  // Escaped placeholders
    /\\_\\_[A-Z_]+_\d+\\_\\_/gi,  // Fully escaped placeholders
  ];
  
  allPlaceholderPatterns.forEach((pattern) => {
    value = value.replace(pattern, "");
  });
  
  // Remove triple asterisks
  value = value.replace(/\*{3,}/g, "");
  
  // Remove any leftover backticks (Telegram doesn't need them for addresses)
  // We've already converted addresses to links, so backticks are no longer needed
  value = value.replace(/`/g, "");

  return value.trim();
}

/**
 * Escape markdown but preserve markdown links
 */
function escapeMarkdownButPreserveLinks(text: string): string {
  // Extract all markdown links first, tracking their positions
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ full: string; text: string; url: string; placeholder: string; index: number }> = [];
  let match;
  const originalText = text;
  let linkIndex = 0;
  
  // Find all links with their positions
  while ((match = linkRegex.exec(originalText)) !== null) {
    const placeholder = `__TEMP_LINK_${linkIndex}__`;
    links.push({
      full: match[0],
      text: match[1],
      url: match[2],
      placeholder,
      index: match.index,
    });
    linkIndex++;
  }
  
  // Replace links with temporary placeholders (replace from end to start to preserve indices)
  let processed = text;
  for (let i = links.length - 1; i >= 0; i--) {
    const link = links[i];
    // Replace at the original position
    const start = link.index;
    const end = start + link.full.length;
    if (processed.substring(start, end) === link.full) {
      processed = processed.substring(0, start) + link.placeholder + processed.substring(end);
    }
  }
  
  // Escape markdown in the rest
  processed = escapeMarkdown(processed);

  // Restore links (in reverse order to preserve indices)
  // Do this multiple times to ensure all are restored
  for (let restoreAttempt = 0; restoreAttempt < 3; restoreAttempt++) {
    for (let i = links.length - 1; i >= 0; i--) {
      const link = links[i];
      // Try multiple patterns to catch escaped placeholders
      const patterns = [
        new RegExp(link.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        new RegExp(link.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '\\_'), 'gi'),
      ];
      
      patterns.forEach((pattern) => {
        if (processed.includes(link.placeholder) || pattern.test(processed)) {
          processed = processed.replace(pattern, `[${link.text}](${link.url})`);
        }
      });
    }
  }
  
  // Final safety check: if any TEMP_LINK placeholders remain, they should have been restored
  // If they weren't, something went wrong - try to restore them
  // Also check for escaped versions
  const remainingPlaceholders = processed.match(/\\?__(?:TEMP_LINK_|TEMP_PLACEHOLDER_)\d+\\?__/g);
  if (remainingPlaceholders && remainingPlaceholders.length > 0) {
    console.warn("Warning: Some TEMP_LINK placeholders were not restored:", remainingPlaceholders);
    // Try one more aggressive restoration with multiple patterns
    links.forEach((link) => {
      const patterns = [
        new RegExp(link.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        new RegExp(link.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '\\_'), 'gi'),
        new RegExp(link.placeholder.replace(/_/g, '\\\\_'), 'gi'), // Fully escaped
      ];
      
      patterns.forEach((pattern) => {
        if (pattern.test(processed)) {
          processed = processed.replace(pattern, `[${link.text}](${link.url})`);
        }
      });
    });
  }
  
  return processed;
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
  // But preserve our temporary link placeholders
  text = text.replace(/__(?!TEMP_LINK_|TEMP_PLACEHOLDER_|LINK_PLACEHOLDER_|EXISTING_LINK_)([^_]+)__/g, "$1");
  
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
  
  // Preserve existing markdown links
  text = escapeMarkdownButPreserveLinks(text);
  
  // Final cleanup: ensure no placeholders remain
  text = text.replace(/__(?:TEMP_LINK_|TEMP_PLACEHOLDER_|LINK_PLACEHOLDER_|EXISTING_LINK_|PLACEHOLDER_)\d+__/gi, "");
  
  // Remove triple asterisks
  text = text.replace(/\*{3,}/g, "");
  
  // Remove any leftover backticks (Telegram doesn't need them)
  text = text.replace(/`/g, "");
  
  return text;
}

/**
 * Escape markdown special characters for Telegram
 */
function escapeMarkdown(text: string): string {
  // Telegram uses * for bold, _ for italic, ` for code, [](url) for links
  // We need to escape these if they're not part of a link
  // But preserve our temporary link placeholders
  // First, temporarily replace placeholders with a unique marker that won't be escaped
  const placeholderRegex = /__TEMP_LINK_\d+__/g;
  const placeholders: Array<{ original: string; temp: string }> = [];
  let placeholderIndex = 0;
  
  // Find all placeholders and replace them (from end to start to preserve indices)
  let processed = text;
  const tempPlaceholderRegex = /__TEMP_LINK_(\d+)__/g;
  const matches: Array<{ original: string; temp: string; index: number }> = [];
  
  // Find all matches first
  let match;
  while ((match = tempPlaceholderRegex.exec(text)) !== null) {
    const original = match[0];
    const tempPlaceholder = `__TEMP_PLACEHOLDER_${placeholderIndex}__`;
    matches.push({ original, temp: tempPlaceholder, index: match.index });
    placeholders.push({ original, temp: tempPlaceholder });
    placeholderIndex++;
  }
  
  // Replace from end to start
  for (let i = matches.length - 1; i >= 0; i--) {
    const { original, temp, index } = matches[i];
    processed = processed.substring(0, index) + temp + processed.substring(index + original.length);
  }
  
  // Escape markdown
  processed = processed
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/`/g, "\\`");
  
  // Restore placeholders (they don't need escaping)
  // Restore in reverse order to preserve indices
  // CRITICAL: After escaping, underscores in placeholders become \_, so we need to handle that
  // Do this multiple times to ensure all are restored
  for (let restoreAttempt = 0; restoreAttempt < 5; restoreAttempt++) {
    let restoredAny = false;
    for (let i = placeholders.length - 1; i >= 0; i--) {
      const { original, temp } = placeholders[i];
      // Try multiple patterns to catch escaped placeholders
      // The temp placeholder might be escaped as \_\_TEMP_PLACEHOLDER_X\_\_
      const patterns = [
        // Normal (unescaped) version
        new RegExp(temp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        // Fully escaped version (all underscores escaped)
        new RegExp(temp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '\\\\_'), 'gi'),
        // Partially escaped (some underscores escaped)
        new RegExp(temp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/__/g, '\\\\_\\\\_'), 'gi'),
      ];
      
      patterns.forEach((pattern) => {
        const beforeReplace = processed;
        if (processed.includes(temp) || pattern.test(processed)) {
          processed = processed.replace(pattern, original);
          if (processed !== beforeReplace) {
            restoredAny = true;
          }
        }
      });
    }
    
    // If we didn't restore anything in this attempt, break early
    if (!restoredAny) {
      break;
    }
  }
  
  // Final verification: if any TEMP_PLACEHOLDER placeholders remain, they were escaped
  // Try one more aggressive pass to restore them
  const remainingTempPlaceholders = processed.match(/\\?__TEMP_PLACEHOLDER_\d+\\?__/gi);
  if (remainingTempPlaceholders && remainingTempPlaceholders.length > 0) {
    // Try to restore them by matching with the original TEMP_LINK placeholders
    placeholders.forEach(({ original, temp }) => {
      // Try to find escaped versions of temp and restore to original
      const escapedTemp = temp.replace(/_/g, '\\\\_');
      const escapedPattern = new RegExp(escapedTemp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      if (escapedPattern.test(processed)) {
        processed = processed.replace(escapedPattern, original);
      }
    });
  }
  
  return processed;
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

