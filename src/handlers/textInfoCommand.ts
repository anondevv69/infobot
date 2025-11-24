import { Message } from "discord.js";
import { handleSearchCommand } from "../commands/search";
import { trackUser, trackSearch, trackResponseTime } from "../utils/botStats";
import { logger } from "../utils/logger";

/**
 * Handle text command "info <query>" in Discord messages
 * Reuses search logic from handleSearchCommand
 */
export async function handleTextInfoCommand(
  message: Message,
  query: string,
): Promise<void> {
  const userId = message.author.id;
  const guildId = message.guildId || undefined;
  const channelId = message.channelId;

  // Track user and search
  trackUser(userId, "discord");
  trackSearch();

  logger.command("info", "discord", userId, guildId, channelId, { query });

  if (!query) {
    await message.reply({
      content: "Please provide a wallet address, username, or token to search.\n\nUsage: `info <query>`\nExample: `info 0x1234...` or `info @username`",
    });
    return;
  }

  // Log search immediately
  logger.search(query, "discord", userId, guildId, channelId, {
    success: true,
    type: "pending",
  });

  // Track response time
  const startTime = Date.now();
  
  // Show typing indicator
  await message.channel.sendTyping();

  try {
    // Create a fake interaction to reuse handleSearchCommand logic
    const fakeInteraction: any = {
      options: {
        getString: (name: string) => (name === "query" ? query : null),
      },
      user: message.author,
      guildId: message.guildId,
      channelId: message.channelId,
      deferReply: async () => {
        await message.channel.sendTyping();
      },
      editReply: async (options: any) => {
        // For text commands, we want to reply without mentioning the user
        const replyMessage = await message.channel.send({
          embeds: options.embeds,
          components: options.components,
          content: options.content,
          allowedMentions: { repliedUser: false },
        });
        return replyMessage;
      },
      reply: async (options: any) => {
        const replyMessage = await message.channel.send({
          embeds: options.embeds,
          components: options.components,
          content: options.content,
          allowedMentions: { repliedUser: false },
        });
        return replyMessage;
      },
    };

    // Use the full search command handler which searches everything
    await handleSearchCommand(fakeInteraction);
  } catch (error) {
    logger.error(
      `Text info command failed for query: ${query}`,
      error,
      { query, userId, guildId, channelId, platform: "discord" }
    );

    logger.search(query, "discord", userId, guildId, channelId, {
      success: false,
    });

    await message.reply({
      content: "❌ An error occurred while processing your search. Please try again.",
    });
  } finally {
    // Track response time
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
  }
}


