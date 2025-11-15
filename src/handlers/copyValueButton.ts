import { ButtonInteraction } from "discord.js";
import { resolveCopyPayload } from "../utils/copyButtons";

export async function handleCopyValueButton(interaction: ButtonInteraction): Promise<void> {
  const payload = resolveCopyPayload(interaction.customId);
  if (!payload) {
    await interaction.reply({
      content: "Unable to copy value. Please try again.",
    });
    return;
  }

  await interaction.reply({
    content: `**${payload.label}**\n\n\`${payload.value}\``,
  });
}
