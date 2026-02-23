import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { isEthAddress, isSolAddress, extractFirstAddress } from "../utils/address";
import { storeInfoConfirmation } from "../utils/infoConfirmationStore";
import { logger } from "../utils/logger";
import { trackUser, trackSearch } from "../utils/botStats";

/**
 * Detect if a message contains searchable content that should trigger a confirmation prompt
 * Returns the detected type and query, or null if nothing detected
 */
export function detectPastedContent(message: Message): { type: string; query: string } | null {
  const content = message.content?.trim() || "";
  if (!content) {
    return null;
  }

  // Check for Ethereum or Solana addresses (wallets/contracts)
  // Allow addresses to be detected even if there's some whitespace or formatting
  const address = extractFirstAddress(content);
  if (address && (isEthAddress(address) || isSolAddress(address))) {
    // Trigger if the address is the main content (allowing for whitespace, markdown, etc.)
    // Don't trigger if it's part of a URL (has http:// or https://)
    const isUrl = /https?:\/\//i.test(content);
    if (!isUrl) {
      // Remove markdown formatting and normalize whitespace
      const cleanedContent = content.replace(/[`*_~]/g, "").replace(/\s+/g, " ").trim();
      const normalizedAddress = address.toLowerCase();
      const normalizedContent = cleanedContent.toLowerCase();
      
      // Check if content is exactly the address (allowing whitespace)
      if (normalizedContent === normalizedAddress) {
        return { type: "contract", query: address };
      }
      
      // Check if content is mostly just the address (remove all non-alphanumeric and compare)
      const addressOnly = cleanedContent.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const addressOnlyClean = address.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (addressOnly === addressOnlyClean) {
        // If the cleaned content is just the address with minimal extra characters, trigger
        const extraChars = cleanedContent.length - address.length;
        if (extraChars <= 5) { // Allow up to 5 extra characters (whitespace, formatting, etc.)
          return { type: "contract", query: address };
        }
      }
    }
  }

  // Check for X/Twitter links
  const twitterMatch = content.match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([a-zA-Z0-9_]+)/i);
  if (twitterMatch) {
    return { type: "x_link", query: twitterMatch[0] };
  }

  // Check for Bankr launch URLs
  const bankrMatch = content.match(/https?:\/\/(?:www\.)?bankr\.bot\/launches\/(0x[a-fA-F0-9]{40})/i);
  if (bankrMatch) {
    return { type: "bankr", query: bankrMatch[1] };
  }

  // Check for Zora links (but not if it's already being handled by URL handlers)
  if (/https?:\/\/zora\.co\/[^\s<>()]+/i.test(content)) {
    // Extract address from Zora URL if present
    const zoraAddressMatch = content.match(/0x[a-fA-F0-9]{40}/i);
    if (zoraAddressMatch) {
      return { type: "zora", query: zoraAddressMatch[0] };
    }
    return { type: "zora", query: content };
  }

  // Check for Farcaster URLs (should show confirmation when pasted)
  const farcasterUrlMatch = content.match(/https?:\/\/(?:www\.)?(?:farcaster\.xyz|warpcast\.com|fcast\.me)\/[^\s<>()]+/i);
  if (farcasterUrlMatch) {
    return { type: "farcaster_link", query: farcasterUrlMatch[0] };
  }

  // Check for Farcaster usernames (standalone @username)
  const farcasterMatch = content.match(/^@([a-z0-9][a-z0-9_.-]{0,31})$/i);
  if (farcasterMatch) {
    return { type: "farcaster_username", query: content };
  }

  return null;
}

/**
 * Show confirmation prompt for auto-detected pasted content
 */
export async function showAutoDetectPrompt(
  message: Message,
  detected: { type: string; query: string },
): Promise<void> {
  // Prevent duplicate prompts for the same message
  const { hasMessagePrompt, markMessagePrompt } = await import("../utils/infoConfirmationStore");
  if (hasMessagePrompt(message.id)) {
    logger.debug(`[AutoDetect] Skipping duplicate prompt for message ${message.id}`, {}, true);
    return;
  }
  
  const userId = message.author.id;
  const guildId = message.guildId || undefined;
  const channelId = message.channelId;

  trackUser(userId, "discord");
  trackSearch();

  let promptText = "";
  let searchType = "";

  if (detected.type === "contract") {
    promptText = `🔍 Found a contract address: \`${detected.query}\`\n\nWould you like me to search for information about this contract?`;
    searchType = "contract";
  } else if (detected.type === "x_link") {
    const username = detected.query.match(/(?:x|twitter)\.com\/([a-zA-Z0-9_]+)/i)?.[1];
    promptText = `🔍 Found an X/Twitter link: ${username ? `@${username}` : detected.query}\n\nWould you like me to search for the linked Farcaster profile?`;
    searchType = "x_account";
  } else if (detected.type === "bankr") {
    promptText = `🔍 Found a Bankr token link: \`${detected.query}\`\n\nWould you like me to look up this Bankr token (deployer, fee recipient, X, Farcaster)?`;
    searchType = "contract";
  } else if (detected.type === "zora") {
    promptText = `🔍 Found a Zora link or address: \`${detected.query}\`\n\nWould you like me to search for this Zora profile or token?`;
    searchType = "zora";
  } else if (detected.type === "farcaster_link") {
    promptText = `🔍 Found a Farcaster link: \`${detected.query}\`\n\nWould you like me to search for this Farcaster profile or cast?`;
    searchType = "farcaster_link";
  } else if (detected.type === "farcaster_username") {
    promptText = `🔍 Found a Farcaster username: \`${detected.query}\`\n\nWould you like me to search for their Farcaster profile?`;
    searchType = "farcaster_username";
  }

  // Create a safe custom ID (Discord has a 100 char limit)
  const safeQuery = detected.query.substring(0, 20).replace(/[^a-zA-Z0-9]/g, "_");
  const customId = `info_confirm_${message.id}_${searchType}_${safeQuery}`;

  const confirmButton = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel("Yes, search")
    .setStyle(ButtonStyle.Success);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`info_cancel_${message.id}`)
    .setLabel("No, cancel")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(confirmButton, cancelButton);

  const embed = new EmbedBuilder()
    .setTitle("🔍 Search Confirmation")
    .setDescription(promptText)
    .setColor(0x00d4ff);

  const reply = await message.reply({
    embeds: [embed],
    components: [row],
  });

  // Mark this message as having a prompt (prevent duplicates)
  markMessagePrompt(message.id);

  // Store the query for button handler
  storeInfoConfirmation(customId, {
    query: detected.query,
    searchType,
    userId: message.author.id,
    guildId: message.guildId || undefined,
    channelId: message.channelId,
    messageId: reply.id,
  });

  logger.search(detected.query, "discord", userId, guildId, channelId, {
    success: true,
    type: `auto_detect_prompt_${searchType}`,
  });

  // Auto-expire confirmation after 60 seconds
  setTimeout(async () => {
    try {
      const { removeInfoConfirmation } = await import("../utils/infoConfirmationStore");
      removeInfoConfirmation(customId);
      await reply.edit({
        components: [],
        embeds: [embed.setDescription(`${promptText}\n\n⏰ This confirmation expired. Use \`info ${detected.query}\` to search again.`)],
      });
    } catch (error) {
      // Ignore errors
    }
  }, 60000);
}

