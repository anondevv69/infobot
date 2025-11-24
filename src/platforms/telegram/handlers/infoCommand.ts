import TelegramBot from "node-telegram-bot-api";
import { trackSearch, trackResponseTime } from "../../../utils/botStats";
import { logger } from "../../../utils/logger";

/**
 * Handle text command "info <query>" in Telegram
 * Reuses search logic from handleTelegramCommand
 */
export async function handleTelegramInfoCommand(
  bot: TelegramBot,
  chatId: number,
  query: string,
): Promise<void> {
  // Track user and search (we don't have user ID in this context, so skip user tracking)
  trackSearch();

  logger.command("info", "telegram", undefined, chatId.toString(), undefined, { query });

  if (!query) {
    await bot.sendMessage(
      chatId,
      "Please provide a wallet address, username, or token to search.\n\nUsage: <code>info &lt;query&gt;</code>\nExample: <code>info 0x1234...</code> or <code>info @username</code>",
      { parse_mode: "HTML" }
    );
    return;
  }

  // Log search immediately
  logger.search(query, "telegram", undefined, chatId.toString(), undefined, {
    success: true,
    type: "pending",
  });

  // Track response time
  const startTime = Date.now();
  
  // Show typing indicator
  await bot.sendChatAction(chatId, "typing");

  try {
    // Use the full search command handler which searches everything
    const { handleTelegramCommand } = await import("./command");
    await handleTelegramCommand(bot, { chat: { id: chatId } } as TelegramBot.Message, "search", query);
  } catch (error) {
    logger.error(
      `Telegram info command failed for query: ${query}`,
      error,
      { query, chatId, platform: "telegram" }
    );

    logger.search(query, "telegram", undefined, chatId.toString(), undefined, {
      success: false,
    });

    await bot.sendMessage(
      chatId,
      "❌ An error occurred while processing your search. Please try again.",
    );
  } finally {
    // Track response time
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
  }
}


