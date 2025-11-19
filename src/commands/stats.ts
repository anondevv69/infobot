import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { logger } from "../utils/logger";
import { getBotStats } from "../utils/botStats";

export async function handleStatsCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const stats = await getBotStats(interaction.client);
    
    const embed = new EmbedBuilder()
      .setTitle("📊 Bot Statistics")
      .setColor(0x5865f2)
      .addFields(
        {
          name: "🖥️ Discord Servers",
          value: `**${stats.discordServers}** servers`,
          inline: true,
        },
        {
          name: "👥 Total Users",
          value: `**${stats.totalUsers}** unique users`,
          inline: true,
        },
        {
          name: "📱 Telegram Chats",
          value: `**${stats.telegramChats}** groups/channels`,
          inline: true,
        },
        {
          name: "🔍 Total Searches",
          value: `**${stats.totalSearches}** searches performed`,
          inline: true,
        },
        {
          name: "⏰ Uptime",
          value: stats.uptime,
          inline: true,
        },
        {
          name: "💾 Memory Usage",
          value: stats.memoryUsage,
          inline: true,
        },
      )
      .setTimestamp()
      .setFooter({ text: "InfoBot Statistics" });

    await interaction.editReply({ embeds: [embed] });

    // Send stats to webhook
    logger.system(
      `📊 **STATS COMMAND EXECUTED**\n` +
      `**User:** ${interaction.user.tag} (${interaction.user.id})\n` +
      `**Server:** ${interaction.guild?.name || "DM"} (${interaction.guild?.id || "N/A"})\n\n` +
      `**Bot Statistics:**\n` +
      `• Discord Servers: ${stats.discordServers}\n` +
      `• Total Users: ${stats.totalUsers}\n` +
      `• Telegram Chats: ${stats.telegramChats}\n` +
      `• Total Searches: ${stats.totalSearches}\n` +
      `• Uptime: ${stats.uptime}\n` +
      `• Memory: ${stats.memoryUsage}`,
      {
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
        command: "stats",
        stats,
      }
    );
  } catch (error) {
    logger.error("Failed to get bot stats", error, {
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
    });
    
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("Failed to retrieve bot statistics.")
          .setColor(0xff0000),
      ],
    });
  }
}

