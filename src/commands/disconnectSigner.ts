import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getSIWFSession } from "../services/siwf";
import { env } from "../config";

export async function handleDisconnectSignerCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;

  await interaction.deferReply({ ephemeral: true });

  try {
    // Check if user is connected
    const session = await getSIWFSession(userId, "discord", env.backendUrl);
    if (!session) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Not Connected")
            .setDescription(`You're not connected to Farcaster. Use \`/connect\` to connect.`)
            .setColor(0xff0000),
        ],
      });
      return;
    }

    // Remove signer from backend
    try {
      const response = await fetch(`${env.backendUrl}/api/siwf/signer`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          platform: "discord",
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || "Failed to remove signer");
      }
    } catch (error: any) {
      console.error("[DisconnectSigner] Failed to remove signer:", error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Removal Failed")
            .setDescription(
              `Failed to remove your signer. Please try again.\n\n` +
              `**Error:** ${error.message || "Unknown error"}`
            )
            .setColor(0xff0000),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ Signer Disconnected")
          .setDescription(
            `Your trading signer has been removed.\n\n` +
            `You can no longer use trading commands until you add a new signer with \`/connect-signer\`.`
          )
          .setColor(0x00ff00),
      ],
    });
  } catch (error: any) {
    console.error("[DisconnectSigner] Error:", error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription(`An unexpected error occurred: ${error.message || "Unknown error"}`)
          .setColor(0xff0000),
      ],
    });
  }
}

