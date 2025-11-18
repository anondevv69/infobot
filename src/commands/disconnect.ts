import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { clearSIWFSession, getSIWFSession } from "../services/siwf";

export async function handleDisconnectCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;

  const session = getSIWFSession(userId, "discord");
  if (!session) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Not Connected")
      .setDescription("You're not connected to Farcaster.")
      .setColor(0xff0000);

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  clearSIWFSession(userId, "discord");

  const embed = new EmbedBuilder()
    .setTitle("✅ Disconnected")
    .setDescription("Your Farcaster account has been disconnected.")
    .setColor(0x00ff00);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

