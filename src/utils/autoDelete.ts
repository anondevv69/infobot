import { Message, MessageReplyOptions, InteractionResponse, MessageEditOptions } from "discord.js";
import { env } from "../config";

// Auto-delete is disabled by default. Set AUTO_DELETE_DELAY in seconds to enable (e.g., 60 for 1 minute)
const AUTO_DELETE_DELAY_MS = env.autoDeleteDelay ? env.autoDeleteDelay * 1000 : null;

/**
 * Automatically deletes a message after a specified delay
 * Only works if AUTO_DELETE_DELAY is set in environment variables
 */
export function scheduleAutoDelete(
  message: Message | null,
  delayMs: number | null = AUTO_DELETE_DELAY_MS,
): void {
  if (!message || !delayMs) {
    return; // Auto-delete is disabled
  }

  setTimeout(async () => {
    try {
      await message.delete();
    } catch (error) {
      // Message may have already been deleted or bot doesn't have permission
      // Silently fail
      console.debug("Failed to auto-delete message:", error);
    }
  }, delayMs);
}

/**
 * Wrapper for message.reply that automatically schedules deletion
 */
export async function replyWithAutoDelete(
  message: Message,
  options: string | MessageReplyOptions,
  delayMs: number | null = AUTO_DELETE_DELAY_MS,
): Promise<Message | null> {
  const reply = await message.reply(options);
  scheduleAutoDelete(reply, delayMs);
  return reply;
}

/**
 * Wrapper for interaction.reply that automatically schedules deletion
 */
export async function interactionReplyWithAutoDelete(
  interaction: { reply: (options: any) => Promise<InteractionResponse | null> },
  options: any,
  delayMs: number | null = AUTO_DELETE_DELAY_MS,
): Promise<InteractionResponse | null> {
  const response = await interaction.reply(options);
  
  // For interactions, we need to fetch the message to delete it
  if (response && delayMs && "fetch" in response) {
    try {
      const message = await response.fetch();
      scheduleAutoDelete(message as Message, delayMs);
    } catch (error) {
      console.debug("Failed to fetch interaction reply for auto-delete:", error);
    }
  }
  
  return response;
}

/**
 * Wrapper for interaction.editReply that automatically schedules deletion
 */
export async function interactionEditReplyWithAutoDelete(
  interaction: { editReply: (options: MessageEditOptions) => Promise<Message | null> },
  options: MessageEditOptions,
  delayMs: number | null = AUTO_DELETE_DELAY_MS,
): Promise<Message | null> {
  const message = await interaction.editReply(options);
  scheduleAutoDelete(message, delayMs);
  return message;
}

