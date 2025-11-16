import TelegramBot from "node-telegram-bot-api";
import type { EmbedBuilder } from "discord.js";
import { embedsToTelegram } from "../adapters/telegramAdapter";
import {
  buildTelegramPaginationButtons,
  storeTelegramPagination,
} from "./pagination";

/**
 * Send paginated embeds to Telegram with inline keyboard navigation
 * Similar to Discord's button pagination
 */
export async function sendPaginatedTelegramMessage(
  bot: TelegramBot,
  chatId: number,
  embeds: EmbedBuilder[],
  identifier: string,
  pageLabels?: string[],
): Promise<void> {
  if (embeds.length === 0) {
    return;
  }

  // Convert all embeds to Telegram messages
  const messages = embedsToTelegram(embeds);

  // Store pagination data
  storeTelegramPagination(identifier, messages, pageLabels);

  // Send first page with pagination buttons if multiple pages
  const keyboard =
    embeds.length > 1
      ? buildTelegramPaginationButtons(0, embeds.length, identifier, pageLabels)
      : undefined;

  await bot.sendMessage(chatId, messages[0], {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard
      ? {
          inline_keyboard: keyboard,
        }
      : undefined,
  });
}

