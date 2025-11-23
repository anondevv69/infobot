import { ChatInputCommandInteraction } from "discord.js";
import { handleSearchCommand } from "./search";

// Universal search command - alias for /search
export async function handleInfoCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await handleSearchCommand(interaction);
}

