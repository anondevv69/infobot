import TelegramBot from "node-telegram-bot-api";
import type { InlineKeyboardButton } from "node-telegram-bot-api";

export interface TelegramPaginationData {
  identifier: string;
  currentPage: number;
  totalPages: number;
  pageLabels?: string[];
}

/**
 * Build inline keyboard buttons for pagination
 */
export function buildTelegramPaginationButtons(
  currentPage: number,
  totalPages: number,
  identifier: string,
  pageLabels?: string[],
): InlineKeyboardButton[][] {
  const buttons: InlineKeyboardButton[] = [];

  // Previous button
  if (currentPage > 0) {
    const prevLabel = pageLabels && pageLabels[currentPage - 1] 
      ? `◀ ${pageLabels[currentPage - 1]}` 
      : "◀ Previous";
    buttons.push({
      text: prevLabel,
      callback_data: `page_${currentPage - 1}|${identifier}`,
    });
  }

  // Page indicator
  const pageLabel = pageLabels && pageLabels[currentPage]
    ? `${pageLabels[currentPage]} (${currentPage + 1}/${totalPages})`
    : `Page ${currentPage + 1}/${totalPages}`;
  buttons.push({
    text: pageLabel,
    callback_data: `page_info_${identifier}`, // Non-functional button for display
  });

  // Next button
  if (currentPage < totalPages - 1) {
    const nextLabel = pageLabels && pageLabels[currentPage + 1]
      ? `${pageLabels[currentPage + 1]} ▶`
      : "Next ▶";
    buttons.push({
      text: nextLabel,
      callback_data: `page_${currentPage + 1}|${identifier}`,
    });
  }

  return [buttons];
}

/**
 * Store pagination data for a message
 */
const paginationStore = new Map<string, {
  embeds: string[];
  totalPages: number;
  pageLabels?: string[];
}>();

export function storeTelegramPagination(
  identifier: string,
  embeds: string[],
  pageLabels?: string[],
): void {
  paginationStore.set(identifier, {
    embeds,
    totalPages: embeds.length,
    pageLabels,
  });
}

export function getTelegramPagination(identifier: string): {
  embeds: string[];
  totalPages: number;
  pageLabels?: string[];
} | null {
  return paginationStore.get(identifier) ?? null;
}

/**
 * Clean up old pagination data (optional, for memory management)
 */
export function clearTelegramPagination(identifier: string): void {
  paginationStore.delete(identifier);
}

/**
 * Handle pagination callback
 */
export async function handleTelegramPagination(
  bot: TelegramBot,
  callbackQuery: TelegramBot.CallbackQuery,
  page: number,
  identifier: string,
): Promise<void> {
  const chatId = callbackQuery.message?.chat.id;
  const messageId = callbackQuery.message?.message_id;

  if (!chatId || !messageId) {
    return;
  }

  const paginationData = getTelegramPagination(identifier);
  if (!paginationData) {
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "This pagination has expired.",
      show_alert: false,
    });
    return;
  }

  const { embeds, totalPages, pageLabels } = paginationData;

  if (page < 0 || page >= totalPages) {
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "Invalid page.",
      show_alert: false,
    });
    return;
  }

  // Update the message with the new page
  const keyboard = buildTelegramPaginationButtons(page, totalPages, identifier, pageLabels);
  
  await bot.editMessageText(embeds[page], {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });

  await bot.answerCallbackQuery(callbackQuery.id);
}

