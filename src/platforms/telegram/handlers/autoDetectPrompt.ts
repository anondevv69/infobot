import TelegramBot from "node-telegram-bot-api";
import { isEthAddress, isSolAddress, extractFirstAddress } from "../../../utils/address";
import { storeInfoConfirmation } from "../../../utils/infoConfirmationStore";
import { logger } from "../../../utils/logger";
import { trackSearch } from "../../../utils/botStats";

/**
 * Detect if a message contains searchable content that should trigger a confirmation prompt
 * Returns the detected type and query, or null if nothing detected
 */
export function detectPastedContent(text: string): { type: string; query: string } | null {
  const content = text.trim();
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
 * Show confirmation prompt for auto-detected pasted content (Telegram)
 */
export async function showAutoDetectPrompt(
  bot: TelegramBot,
  chatId: number,
  detected: { type: string; query: string },
  userId?: number,
): Promise<void> {
  trackSearch();

  let promptText = "";

  if (detected.type === "contract") {
    promptText = `🔍 Found a contract address: <code>${detected.query}</code>\n\nWould you like me to search for information about this contract?`;
  } else if (detected.type === "x_link") {
    const username = detected.query.match(/(?:x|twitter)\.com\/([a-zA-Z0-9_]+)/i)?.[1];
    promptText = `🔍 Found an X/Twitter link: ${username ? `@${username}` : detected.query}\n\nWould you like me to search for the linked Farcaster profile?`;
  } else if (detected.type === "zora") {
    promptText = `🔍 Found a Zora link or address: <code>${detected.query}</code>\n\nWould you like me to search for this Zora profile or token?`;
  } else if (detected.type === "farcaster_link") {
    promptText = `🔍 Found a Farcaster link: <code>${detected.query}</code>\n\nWould you like me to search for this Farcaster profile or cast?`;
  } else if (detected.type === "farcaster_username") {
    promptText = `🔍 Found a Farcaster username: <code>${detected.query}</code>\n\nWould you like me to search for their Farcaster profile?`;
  }

  // Create a safe callback data (Telegram has a 64 byte limit)
  const safeQuery = detected.query.substring(0, 15).replace(/[^a-zA-Z0-9]/g, "_");
  const callbackData = `info_confirm_${chatId}_${detected.type}_${safeQuery}`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Yes, search", callback_data: callbackData },
        { text: "❌ No, cancel", callback_data: `info_cancel_${chatId}` },
      ],
    ],
  };

  const sentMessage = await bot.sendMessage(chatId, promptText, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });

  // Store confirmation for callback handler
  storeInfoConfirmation(callbackData, {
    query: detected.query,
    searchType: detected.type,
    userId: userId?.toString() || "",
    guildId: chatId.toString(),
    channelId: chatId.toString(),
    messageId: sentMessage.message_id.toString(),
  });

  logger.search(detected.query, "telegram", userId?.toString(), chatId.toString(), undefined, {
    success: true,
    type: `auto_detect_prompt_${detected.type}`,
  });

  // Auto-expire confirmation after 60 seconds
  setTimeout(async () => {
    try {
      const { removeInfoConfirmation } = await import("../../../utils/infoConfirmationStore");
      removeInfoConfirmation(callbackData);
      await bot.editMessageText(`${promptText}\n\n⏰ This confirmation expired. Use <code>info ${detected.query}</code> to search again.`, {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "HTML",
        reply_markup: undefined,
      });
    } catch (error) {
      // Ignore errors
    }
  }, 60000);
}

