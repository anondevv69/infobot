import TelegramBot from "node-telegram-bot-api";
import { handleTelegramInfoCommand as handleTelegramInfoCommandEnhanced } from "./infoCommandHandler";

/**
 * Handle text command "info <query>" in Telegram
 * Uses enhanced handler with auto-detection and confirmation prompts
 */
export async function handleTelegramInfoCommand(
  bot: TelegramBot,
  chatId: number,
  query: string,
  userId?: number,
): Promise<void> {
  await handleTelegramInfoCommandEnhanced(bot, chatId, query, userId);
}


