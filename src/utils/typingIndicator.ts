/**
 * Typing indicator utilities for Discord and Telegram
 * Shows users that the bot is processing their request
 */

import { Message } from "discord.js";
import TelegramBot from "node-telegram-bot-api";

/**
 * Show typing indicator for Discord messages
 * Adds an eye emoji reaction to indicate the bot is processing
 */
export async function showDiscordTypingIndicator(message: Message): Promise<void> {
  try {
    // Add eye emoji reaction to show bot is processing
    await message.react("👁️");
  } catch (error) {
    // Ignore errors (e.g., if bot doesn't have permission to react)
    console.warn("Failed to add typing indicator reaction:", error);
  }
}

/**
 * Show typing indicator for Discord slash commands
 * Uses deferReply to show typing indicator
 */
export async function showDiscordCommandTyping(interaction: any): Promise<void> {
  try {
    // For slash commands, we can use deferReply which shows a typing indicator
    // But we'll also try to add a reaction if it's a message command
    if (interaction.isMessageContextMenuCommand()) {
      const message = interaction.targetMessage;
      if (message) {
        await message.react("👁️").catch(() => {});
      }
    }
  } catch (error) {
    // Ignore errors
    console.warn("Failed to show command typing indicator:", error);
  }
}

/**
 * Show typing indicator for Telegram
 * Sends a chat action to show typing indicator
 */
export async function showTelegramTypingIndicator(
  bot: TelegramBot,
  chatId: number,
): Promise<void> {
  try {
    // Send typing action (shows "typing..." indicator)
    await bot.sendChatAction(chatId, "typing");
  } catch (error) {
    // Ignore errors
    console.warn("Failed to send Telegram typing indicator:", error);
  }
}

/**
 * Show eye emoji message for Telegram (alternative to typing indicator)
 * Replies to the original message with eye emoji, then deletes it after processing
 */
export async function showTelegramEyeIndicator(
  bot: TelegramBot,
  chatId: number,
  replyToMessageId?: number,
): Promise<number | null> {
  try {
    // Reply to the original message with eye emoji
    const sentMessage = await bot.sendMessage(chatId, "👁️", {
      reply_to_message_id: replyToMessageId,
      parse_mode: "HTML",
    });
    return sentMessage.message_id;
  } catch (error) {
    console.warn("Failed to send Telegram eye indicator:", error);
    return null;
  }
}

/**
 * Delete a Telegram message (used to remove eye emoji after processing)
 */
export async function deleteTelegramMessage(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
): Promise<void> {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch (error) {
    // Ignore errors (message might already be deleted or bot doesn't have permission)
    console.warn("Failed to delete Telegram message:", error);
  }
}

