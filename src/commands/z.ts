import { ChatInputCommandInteraction } from "discord.js";
import { handleZoraProfileCommand } from "./zora";

// Alias for /zora command
export async function handleZCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handleZoraProfileCommand(interaction);
}

