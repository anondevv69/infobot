import { Message } from "discord.js";
import { handleInfoCommand } from "./infoCommandHandler";

/**
 * Handle text command "info <query>" in Discord messages
 * Uses enhanced handler with auto-detection and confirmation prompts
 */
export async function handleTextInfoCommand(
  message: Message,
  query: string,
): Promise<void> {
  await handleInfoCommand(message, query);
}


