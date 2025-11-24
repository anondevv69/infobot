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

  // Check for Ethereum or Solana addresses
  const address = extractFirstAddress(content);
  if (address && (isEthAddress(address) || isSolAddress(address))) {
    // Only trigger if it's a standalone address (not part of a URL or command)
    const isStandalone = /^0x[a-fA-F0-9]{40}$/i.test(content.trim()) || /^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(content.trim());
    if (isStandalone || content.trim() === address) {
      return { type: "contract", query: address };
    }
  }

  // Check for X/Twitter links
  const twitterMatch = content.match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([a-zA-Z0-9_]+)/i);
  if (twitterMatch) {
    return { type: "x_link", query: twitterMatch[0] };
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

