import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { isEthAddress, isSolAddress } from "../utils/address";
import { handleSearchCommand } from "../commands/search";
import { handleParagraphPostMessage } from "./paragraphPost";
import { handleBasePostMessage } from "./basePost";
import { handleZoraProfileMessage } from "./zoraProfile";
import { handleCastLinkMessage } from "./castLink";
import { sendClankerTokenPages } from "../platforms/telegram/handlers/clankerHandler";
import { logger } from "../utils/logger";
import { trackUser, trackSearch, trackResponseTime } from "../utils/botStats";

/**
 * Enhanced info command handler that:
 * 1. Auto-detects specific URLs (Farcaster, Clanker, Zora, Basescan) and searches immediately
 * 2. Shows confirmation prompt for ambiguous cases (contracts, X links)
 * 3. Handles all other queries normally
 */
export async function handleInfoCommand(
  message: Message,
  query: string,
): Promise<void> {
  const userId = message.author.id;
  const guildId = message.guildId || undefined;
  const channelId = message.channelId;

  trackUser(userId, "discord");
  trackSearch();

  logger.command("info", "discord", userId, guildId, channelId, { query });

  if (!query) {
    await message.reply({
      content: "Please provide a wallet address, username, link, or token to search.\n\nUsage: `info <query>`\nExample: `info 0x1234...` or `info @username` or `info https://...`",
    });
    return;
  }

  const startTime = Date.now();
  if (message.channel.isTextBased() && !message.channel.isDMBased()) {
    await message.channel.sendTyping();
  }

  try {
    // 1. Check for specific URLs that should auto-search (no confirmation needed)
    const autoSearchUrls = detectAutoSearchUrls(query);
    if (autoSearchUrls.length > 0) {
      // Handle each URL type
      for (const urlType of autoSearchUrls) {
        const handled = await handleAutoSearchUrl(message, query, urlType);
        if (handled) {
          const responseTime = Date.now() - startTime;
          trackResponseTime(responseTime);
          logger.search(query, "discord", userId, guildId, channelId, {
            success: true,
            type: urlType,
          });
          return;
        }
      }
    }

    // 2. For explicit "info" commands, skip confirmation and search directly
    // Only show confirmation for auto-detected pasted content, not explicit commands
    // 3. Use full search command handler
    await executeSearch(message, query, userId, guildId, channelId);
  } catch (error) {
    logger.error(
      `Info command failed for query: ${query}`,
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
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
  }
}

/**
 * Detect URLs that should auto-search immediately (no confirmation)
 */
function detectAutoSearchUrls(query: string): string[] {
  const detected: string[] = [];
  
  // Farcaster links
  if (/https?:\/\/(?:www\.)?(?:farcaster\.xyz|warpcast\.com|fcast\.me)\/[^\s<>()]+/i.test(query)) {
    detected.push("farcaster");
  }
  
  // Clanker links
  if (/https?:\/\/(?:www\.)?clanker\.world\/[^\s<>()]+/i.test(query)) {
    detected.push("clanker");
  }
  
  // Zora links
  if (/https?:\/\/(?:www\.)?zora\.co\/[^\s<>()]+/i.test(query)) {
    detected.push("zora");
  }
  
  // Paragraph links
  if (/https?:\/\/(?:www\.)?paragraph\.(?:com|xyz)\/[^\s<>()]+/i.test(query)) {
    detected.push("paragraph");
  }
  
  // Base social posts
  if (/https?:\/\/(?:www\.)?base\.(?:org|app)\/[^\s<>()]+/i.test(query)) {
    detected.push("base");
  }
  
  // Explorer links (Basescan, Etherscan, etc.)
  if (/https?:\/\/(?:www\.)?(?:basescan|etherscan|polygonscan|arbiscan|optimistic\.etherscan|snowtrace|ftmscan|explorer\.mantle|monadscan)\.(?:org|com|xyz)\/[^\s<>()]+/i.test(query)) {
    detected.push("explorer");
  }
  
  return detected;
}

/**
 * Detect queries that need confirmation (contracts, X links, etc.)
 */
function detectNeedsConfirmation(query: string): string | null {
  // Contract addresses
  if (isEthAddress(query) || isSolAddress(query)) {
    return "contract";
  }
  
  // X/Twitter links
  if (/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>()]+/i.test(query)) {
    return "x_link";
  }
  
  // X/Twitter handles (without @)
  if (/^(?:x|twitter)\.com\/[a-zA-Z0-9_]+$/i.test(query)) {
    return "x_handle";
  }
  
  return null;
}

/**
 * Handle auto-search URLs (no confirmation needed)
 */
async function handleAutoSearchUrl(
  message: Message,
  query: string,
  urlType: string,
): Promise<boolean> {
  switch (urlType) {
    case "farcaster":
      // Try cast link first (returns void, so we check if message was sent)
      try {
        await handleCastLinkMessage(message);
        // If we get here without error, the handler processed it
        return true;
      } catch (error) {
        // If cast link handler didn't process it, fall through to search
        console.warn("[Info] Farcaster link not handled by cast handler, trying search");
      }
      // Fall through to search command
      break;
      
    case "clanker":
      // Extract address from Clanker URL if present
      const clankerAddressMatch = query.match(/0x[a-fA-F0-9]{40}/i);
      if (clankerAddressMatch) {
        const address = clankerAddressMatch[0].toLowerCase();
        // Use the existing Clanker address handler which handles all the logic
        const { handleClankerAddressMessage } = await import("./clankerAddress");
        // Create a fake message with just the address
        const fakeMessage = {
          ...message,
          content: address,
        } as Message;
        if (await handleClankerAddressMessage(fakeMessage)) {
          return true;
        }
      }
      // If no address found or handler failed, fall through to search command
      break;
      
    case "zora":
      if (await handleZoraProfileMessage(message)) {
        return true;
      }
      // Fall through to search command
      break;
      
    case "paragraph":
      if (await handleParagraphPostMessage(message)) {
        return true;
      }
      // Fall through to search command
      break;
      
    case "base":
      if (await handleBasePostMessage(message)) {
        return true;
      }
      // Fall through to search command
      break;
      
    case "explorer":
      // Extract address or transaction hash from explorer link
      const explorerMatch = query.match(/(?:address|tx)\/(0x[a-fA-F0-9]{64}|0x[a-fA-F0-9]{40})/i);
      if (explorerMatch) {
        const extracted = explorerMatch[1];
        // Check if it's a transaction hash (64 chars) or address (40 chars)
        if (extracted.length === 66) {
          // Transaction hash
          await executeSearch(message, extracted, message.author.id, message.guildId || undefined, message.channelId);
          return true;
        } else {
          // Address
          await executeSearch(message, extracted, message.author.id, message.guildId || undefined, message.channelId);
          return true;
        }
      }
      break;
  }
  
  return false;
}

/**
 * Show confirmation prompt for ambiguous queries
 */
async function showConfirmationPrompt(
  message: Message,
  query: string,
  queryType: string,
): Promise<void> {
  let promptText = "";
  let searchType = "";
  
  if (queryType === "contract") {
    promptText = `🔍 Found a contract address: \`${query}\`\n\nWould you like me to search for information about this contract?`;
    searchType = "contract";
  } else if (queryType === "x_link" || queryType === "x_handle") {
    const username = extractXUsername(query);
    promptText = `🔍 Found an X/Twitter ${queryType === "x_link" ? "link" : "handle"}: ${username ? `@${username}` : query}\n\nWould you like me to search for the linked Farcaster profile?`;
    searchType = "x_account";
  }
  
  // Create a safe custom ID (Discord has a 100 char limit)
  const safeQuery = query.substring(0, 20).replace(/[^a-zA-Z0-9]/g, "_");
  const customId = `info_confirm_${message.id}_${searchType}_${safeQuery}`;
  
  const confirmButton = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel("Yes, search")
    .setStyle(ButtonStyle.Success);
    
  const cancelButton = new ButtonBuilder()
    .setCustomId(`info_cancel_${message.id}`)
    .setLabel("No, cancel")
    .setStyle(ButtonStyle.Danger);
    
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(confirmButton, cancelButton);
    
  const embed = new EmbedBuilder()
    .setTitle("🔍 Search Confirmation")
    .setDescription(promptText)
    .setColor(0x00d4ff);
    
  const reply = await message.reply({
    embeds: [embed],
    components: [row],
  });
  
  // Store the query for button handler
  const { storeInfoConfirmation } = await import("../utils/infoConfirmationStore");
  storeInfoConfirmation(customId, {
    query,
    searchType,
    userId: message.author.id,
    guildId: message.guildId || undefined,
    channelId: message.channelId,
    messageId: reply.id,
  });
  
  // Auto-expire confirmation after 60 seconds
  setTimeout(async () => {
    try {
      const stored = await import("../utils/infoConfirmationStore");
      stored.removeInfoConfirmation(customId);
      await reply.edit({
        components: [],
        embeds: [embed.setDescription(`${promptText}\n\n⏰ This confirmation expired. Use \`info ${query}\` to search again.`)],
      });
    } catch (error) {
      // Ignore errors
    }
  }, 60000);
}

/**
 * Extract X/Twitter username from link or handle
 */
function extractXUsername(query: string): string | null {
  // Match x.com/username or twitter.com/username
  const linkMatch = query.match(/(?:x|twitter)\.com\/([a-zA-Z0-9_]+)/i);
  if (linkMatch) {
    return linkMatch[1];
  }
  
  // Match @username
  const handleMatch = query.match(/@?([a-zA-Z0-9_]+)/);
  if (handleMatch) {
    return handleMatch[1];
  }
  
  return null;
}

/**
 * Execute the actual search
 */
async function executeSearch(
  message: Message,
  query: string,
  userId: string,
  guildId: string | undefined,
  channelId: string,
): Promise<void> {
  logger.search(query, "discord", userId, guildId, channelId, {
    success: true,
    type: "pending",
  });

  const fakeInteraction: any = {
    options: {
      getString: (name: string) => (name === "query" ? query : null),
    },
    user: message.author,
    guildId: message.guildId,
    channelId: message.channelId,
    deferReply: async () => {
      if (message.channel.isTextBased() && !message.channel.isDMBased()) {
        await message.channel.sendTyping();
      }
    },
    editReply: async (options: any) => {
      if (message.channel.isTextBased() && "send" in message.channel) {
        const replyMessage = await (message.channel as any).send({
          embeds: options.embeds,
          components: options.components,
          content: options.content,
          allowedMentions: { repliedUser: false },
        });
        return replyMessage;
      }
    },
    reply: async (options: any) => {
      if (message.channel.isTextBased() && "send" in message.channel) {
        const replyMessage = await (message.channel as any).send({
          embeds: options.embeds,
          components: options.components,
          content: options.content,
          allowedMentions: { repliedUser: false },
        });
        return replyMessage;
      }
    },
  };

  await handleSearchCommand(fakeInteraction);
}

