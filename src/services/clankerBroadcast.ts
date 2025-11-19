import { Client, EmbedBuilder, TextChannel } from "discord.js";
import type { ClankerToken } from "./clanker";
import { buildTokenEmbed } from "../utils/clankerEmbeds";
// Logger - use console for now
const logger = {
  info: (...args: any[]) => console.log("[INFO]", ...args),
  warn: (...args: any[]) => console.warn("[WARN]", ...args),
  error: (...args: any[]) => console.error("[ERROR]", ...args),
  debug: (...args: any[]) => console.debug("[DEBUG]", ...args),
};
import { env, requireEnv } from "../config";

let discordClient: Client | null = null;

/**
 * Initialize Discord client for broadcasting
 */
export function initializeBroadcastClient(client: Client): void {
  discordClient = client;
  logger.info("[Clanker Broadcast] Discord client initialized for broadcasting");
}

/**
 * Get all channels that should receive broadcasts
 * Returns all channels from all guilds (for global broadcasts)
 */
export async function getAllBroadcastChannels(): Promise<Array<{ guildId: string; channelId: string }>> {
  // For now, we'll need to track all channels
  // This could be enhanced with a dedicated broadcast_channels table
  // For now, we'll use a different approach: broadcast to all channels in all guilds
  // where the bot is present
  
  if (!discordClient) {
    logger.warn("[Clanker Broadcast] Discord client not initialized");
    return [];
  }
  
  const channels: Array<{ guildId: string; channelId: string }> = [];
  
  // Get all guilds the bot is in
  discordClient.guilds.cache.forEach((guild) => {
    // Get all text channels in the guild
    guild.channels.cache.forEach((channel) => {
      if (channel.isTextBased() && !channel.isDMBased()) {
        channels.push({
          guildId: guild.id,
          channelId: channel.id,
        });
      }
    });
  });
  
  logger.info(`[Clanker Broadcast] Found ${channels.length} channels for broadcasting`);
  return channels;
}

/**
 * Broadcast a Clanker deployment to all Discord servers
 */
export async function broadcastClankerDeployment(
  token: ClankerToken,
  deployerFid: number,
  deployerScore: number,
  deployerUsername?: string,
): Promise<{ success: number; failed: number }> {
  if (!discordClient) {
    logger.error("[Clanker Broadcast] Discord client not initialized");
    return { success: 0, failed: 0 };
  }
  
  const channels = await getAllBroadcastChannels();
  
  if (channels.length === 0) {
    logger.warn("[Clanker Broadcast] No channels found for broadcasting");
    return { success: 0, failed: 0 };
  }
  
  // Build the embed
  const embed = await buildClankerBroadcastEmbed(token, deployerFid, deployerScore, deployerUsername);
  
  let success = 0;
  let failed = 0;
  
  // Broadcast to all channels
  for (const { guildId, channelId } of channels) {
    try {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        logger.warn(`[Clanker Broadcast] Guild ${guildId} not found`);
        failed++;
        continue;
      }
      
      const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
      if (!channel) {
        logger.warn(`[Clanker Broadcast] Channel ${channelId} not found in guild ${guildId}`);
        failed++;
        continue;
      }
      
      // Check if bot has permission to send messages
      if (!channel.permissionsFor(guild.members.me!)?.has("SendMessages")) {
        logger.warn(`[Clanker Broadcast] No permission to send messages in ${channelId}`);
        failed++;
        continue;
      }
      
      await channel.send({
        embeds: [embed],
      });
      
      success++;
      logger.info(`[Clanker Broadcast] ✅ Broadcasted to ${guild.name} #${channel.name}`);
    } catch (error) {
      failed++;
      logger.error(`[Clanker Broadcast] ❌ Failed to broadcast to ${guildId}/${channelId}:`, error);
    }
  }
  
  logger.info(`[Clanker Broadcast] Broadcast complete: ${success} success, ${failed} failed`);
  return { success, failed };
}

/**
 * Build embed for Clanker broadcast
 */
async function buildClankerBroadcastEmbed(
  token: ClankerToken,
  deployerFid: number,
  deployerScore: number,
  deployerUsername?: string,
): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setColor(0x4338ca)
    .setTitle(`🎯 High-Score Clanker Deployment`)
    .setDescription(
      `**${token.name ?? token.symbol ?? "Token"}** has been deployed by a high-reputation creator!`
    )
    .addFields(
      {
        name: "👤 Deployer",
        value: deployerUsername
          ? `[@${deployerUsername}](https://warpcast.com/${deployerUsername}) (FID: ${deployerFid})`
          : `FID: ${deployerFid}`,
        inline: true,
      },
      {
        name: "⭐ Reputation Score",
        value: `${deployerScore}/100`,
        inline: true,
      },
      {
        name: "🪙 Token",
        value: token.symbol ?? "N/A",
        inline: true,
      },
      {
        name: "📝 Name",
        value: token.name ?? "N/A",
        inline: true,
      },
      {
        name: "🔗 Contract",
        value: token.contract_address
          ? `[\`${token.contract_address.slice(0, 10)}...${token.contract_address.slice(-8)}\`](https://basescan.org/address/${token.contract_address})`
          : "N/A",
        inline: true,
      },
      {
        name: "📅 Deployed",
        value: token.deployed_at || token.created_at
          ? new Date(token.deployed_at || token.created_at).toLocaleString()
          : "N/A",
        inline: true,
      }
    );
  
  // Add description if available
  if (token.description || token.metadata?.description) {
    const description = token.description || token.metadata?.description || "";
    if (description.length > 0) {
      embed.addFields({
        name: "📄 Description",
        value: description.length > 200 ? `${description.slice(0, 200)}...` : description,
        inline: false,
      });
    }
  }
  
  // Add market data if available
  if (token.related?.market) {
    const market = token.related.market;
    if (market.marketCap || market.price || market.volume) {
      const marketFields: Array<{ name: string; value: string; inline: boolean }> = [];
      
      if (market.marketCap) {
        marketFields.push({
          name: "💰 Market Cap",
          value: `$${market.marketCap.toLocaleString()}`,
          inline: true,
        });
      }
      
      if (market.price) {
        marketFields.push({
          name: "💵 Price",
          value: `$${market.price.toLocaleString()}`,
          inline: true,
        });
      }
      
      if (market.volume) {
        marketFields.push({
          name: "📊 Volume",
          value: `$${market.volume.toLocaleString()}`,
          inline: true,
        });
      }
      
      if (marketFields.length > 0) {
        embed.addFields(marketFields);
      }
    }
  }
  
  // Add image if available
  if (token.img_url) {
    embed.setThumbnail(token.img_url);
  }
  
  // Add footer
  embed.setFooter({
    text: "Clanker World • High-Score Deployment Alert",
  });
  
  embed.setTimestamp(new Date(token.deployed_at || token.created_at || Date.now()));
  
  return embed;
}

