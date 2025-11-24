import TelegramBot from "node-telegram-bot-api";
import { isEthAddress, isSolAddress } from "../../../utils/address";
import { handleTelegramCommand } from "./command";
import { logger } from "../../../utils/logger";
import { trackSearch, trackResponseTime } from "../../../utils/botStats";

/**
 * Enhanced info command handler for Telegram that:
 * 1. Auto-detects specific URLs (Farcaster, Clanker, Zora, Basescan) and searches immediately
 * 2. Shows confirmation prompt for ambiguous cases (contracts, X links)
 * 3. Handles all other queries normally
 */
export async function handleTelegramInfoCommand(
  bot: TelegramBot,
  chatId: number,
  query: string,
  userId?: number,
): Promise<void> {
  trackSearch();

  logger.command("info", "telegram", userId?.toString(), chatId.toString(), undefined, { query });

  if (!query) {
    await bot.sendMessage(
      chatId,
      "Please provide a wallet address, username, link, or token to search.\n\nUsage: <code>info &lt;query&gt;</code>\nExample: <code>info 0x1234...</code> or <code>info @username</code> or <code>info https://...</code>",
      { parse_mode: "HTML" }
    );
    return;
  }

  const startTime = Date.now();
  await bot.sendChatAction(chatId, "typing");

  try {
    // 1. Check for specific URLs that should auto-search (no confirmation needed)
    const autoSearchUrls = detectAutoSearchUrls(query);
    if (autoSearchUrls.length > 0) {
      // Handle each URL type
      for (const urlType of autoSearchUrls) {
        const handled = await handleAutoSearchUrl(bot, chatId, query, urlType, userId);
        if (handled) {
          const responseTime = Date.now() - startTime;
          trackResponseTime(responseTime);
          logger.search(query, "telegram", userId?.toString(), chatId.toString(), undefined, {
            success: true,
            type: urlType,
          });
          return;
        }
      }
    }

    // 2. For explicit "info" commands, skip confirmation and search directly
    // Only show confirmation for auto-detected pasted content, not explicit commands
    // 3. Use full search command handler
    await executeSearch(bot, chatId, query, userId);
  } catch (error) {
    logger.error(
      `Telegram info command failed for query: ${query}`,
      error,
      { query, chatId, platform: "telegram" }
    );

    logger.search(query, "telegram", userId?.toString(), chatId.toString(), undefined, {
      success: false,
    });

    await bot.sendMessage(
      chatId,
      "❌ An error occurred while processing your search. Please try again.",
    );
  } finally {
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
  }
}

/**
 * Detect URLs that should auto-search immediately (no confirmation)
 */
function detectAutoSearchUrls(query: string): string[] {
  const detected: string[] = [];
  
  // Farcaster links
  if (/https?:\/\/(?:www\.)?(?:farcaster\.xyz|warpcast\.com|fcast\.me)\/[^\s<>()]+/i.test(query)) {
    detected.push("farcaster");
  }
  
  // Clanker links
  if (/https?:\/\/(?:www\.)?clanker\.world\/[^\s<>()]+/i.test(query)) {
    detected.push("clanker");
  }
  
  // Zora links
  if (/https?:\/\/(?:www\.)?zora\.co\/[^\s<>()]+/i.test(query)) {
    detected.push("zora");
  }
  
  // Paragraph links
  if (/https?:\/\/(?:www\.)?paragraph\.(?:com|xyz)\/[^\s<>()]+/i.test(query)) {
    detected.push("paragraph");
  }
  
  // Base social posts
  if (/https?:\/\/(?:www\.)?base\.(?:org|app)\/[^\s<>()]+/i.test(query)) {
    detected.push("base");
  }
  
  // Explorer links (Basescan, Etherscan, etc.)
  if (/https?:\/\/(?:www\.)?(?:basescan|etherscan|polygonscan|arbiscan|optimistic\.etherscan|snowtrace|ftmscan|explorer\.mantle|monadscan)\.(?:org|com|xyz)\/[^\s<>()]+/i.test(query)) {
    detected.push("explorer");
  }
  
  return detected;
}

/**
 * Detect queries that need confirmation (contracts, X links, etc.)
 */
function detectNeedsConfirmation(query: string): string | null {
  // Contract addresses
  if (isEthAddress(query) || isSolAddress(query)) {
    return "contract";
  }
  
  // X/Twitter links
  if (/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>()]+/i.test(query)) {
    return "x_link";
  }
  
  // X/Twitter handles (without @)
  if (/^(?:x|twitter)\.com\/[a-zA-Z0-9_]+$/i.test(query)) {
    return "x_handle";
  }
  
  return null;
}

/**
 * Handle auto-search URLs (no confirmation needed) for Telegram
 */
async function handleAutoSearchUrl(
  bot: TelegramBot,
  chatId: number,
  query: string,
  urlType: string,
  userId?: number,
): Promise<boolean> {
  // For Telegram, we can reuse the existing message handler logic
  // by creating a fake message and processing it
  const fakeMessage = {
    chat: { id: chatId },
    text: query,
    from: userId ? { id: userId } : undefined,
  } as TelegramBot.Message;

  switch (urlType) {
    case "farcaster":
    case "zora":
    case "paragraph":
    case "base":
    case "clanker":
      // These are already handled by the message handler
      // Just use the search command which will route to the right handler
      await handleTelegramCommand(bot, fakeMessage, "search", query);
      return true;
      
    case "explorer":
      // Extract address or transaction hash from explorer link
      const explorerMatch = query.match(/(?:address|tx)\/(0x[a-fA-F0-9]{64}|0x[a-fA-F0-9]{40})/i);
      if (explorerMatch) {
        const extracted = explorerMatch[1];
        await executeSearch(bot, chatId, extracted, userId);
        return true;
      }
      break;
  }
  
  return false;
}

/**
 * Show confirmation prompt for ambiguous queries (Telegram)
 */
async function showConfirmationPrompt(
  bot: TelegramBot,
  chatId: number,
  query: string,
  queryType: string,
  userId?: number,
): Promise<void> {
  let promptText = "";
  
  if (queryType === "contract") {
    promptText = `🔍 Found a contract address: <code>${query}</code>\n\nWould you like me to search for information about this contract?`;
  } else if (queryType === "x_link" || queryType === "x_handle") {
    const username = extractXUsername(query);
    promptText = `🔍 Found an X/Twitter ${queryType === "x_link" ? "link" : "handle"}: ${username ? `@${username}` : query}\n\nWould you like me to search for the linked Farcaster profile?`;
  }
  
  // Create a safe callback data (Telegram has a 64 byte limit)
  const safeQuery = query.substring(0, 15).replace(/[^a-zA-Z0-9]/g, "_");
  const callbackData = `info_confirm_${chatId}_${queryType}_${safeQuery}`;
  
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
  const { storeInfoConfirmation } = await import("../../../utils/infoConfirmationStore");
  storeInfoConfirmation(callbackData, {
    query,
    searchType: queryType,
    userId: userId?.toString() || "",
    guildId: chatId.toString(),
    channelId: chatId.toString(),
    messageId: sentMessage.message_id.toString(),
  });
  
  // Auto-expire confirmation after 60 seconds
  setTimeout(async () => {
    try {
      const stored = await import("../../../utils/infoConfirmationStore");
      stored.removeInfoConfirmation(callbackData);
      await bot.editMessageText(`${promptText}\n\n⏰ This confirmation expired. Use <code>info ${query}</code> to search again.`, {
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

/**
 * Extract X/Twitter username from link or handle
 */
function extractXUsername(query: string): string | null {
  // Match x.com/username or twitter.com/username
  const linkMatch = query.match(/(?:x|twitter)\.com\/([a-zA-Z0-9_]+)/i);
  if (linkMatch) {
    return linkMatch[1];
  }
  
  // Match @username
  const handleMatch = query.match(/@?([a-zA-Z0-9_]+)/);
  if (handleMatch) {
    return handleMatch[1];
  }
  
  return null;
}

/**
 * Execute the actual search
 */
async function executeSearch(
  bot: TelegramBot,
  chatId: number,
  query: string,
  userId?: number,
): Promise<void> {
  logger.search(query, "telegram", userId?.toString(), chatId.toString(), undefined, {
    success: true,
    type: "pending",
  });

  await handleTelegramCommand(bot, { chat: { id: chatId } } as TelegramBot.Message, "search", query);
}

