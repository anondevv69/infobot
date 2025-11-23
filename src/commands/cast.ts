import { ChatInputCommandInteraction } from "discord.js";
import { handleCastsCommand } from "./casts";

// Alias for /casts command
export async function handleCastCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handleCastsCommand(interaction);
}

