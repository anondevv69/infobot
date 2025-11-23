import { ChatInputCommandInteraction } from "discord.js";
import { handleSearchCommand } from "./search";
import { isEthAddress, isSolAddress } from "../utils/address";

// Wallet lookup command - uses /search but validates it's a wallet address
export async function handleWCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const query = interaction.options.getString("query", true).trim();
  
  // Validate it's a wallet address
  if (!isEthAddress(query) && !isSolAddress(query)) {
    await interaction.reply({
      content: `\`${query}\` is not a valid wallet address. Please provide an Ethereum (0x...) or Solana address.`,
      ephemeral: true,
    });
    return;
  }

  // Use the search command handler which already handles wallet lookups
  await handleSearchCommand(interaction);
}

