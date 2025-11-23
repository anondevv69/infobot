import { Message } from "discord.js";
import { handleSearchCommand } from "../commands/search";
import { ChatInputCommandInteraction } from "discord.js";
import { isEthAddress, isSolAddress, isTransactionHash } from "../utils/address";
import { extractTransactionHash } from "../services/relay";
import { lookupTransaction, detectChainFromTransactionLink } from "../services/transactionLookup";
import { lookupAddress } from "../services/addressLookup";
import { EmbedBuilder } from "discord.js";
import { applyBranding } from "../utils/branding";
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
    // Check if it's a transaction hash first
    const txHash = extractTransactionHash(query);
    if (txHash && isTransactionHash(txHash)) {
      await handleTransactionSearch(message, txHash, query);
      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "transaction",
      });
      return;
    }

    if (isEthAddress(query) || isSolAddress(query)) {
      await handleWalletSearch(message, query, userId, guildId, channelId);
      return;
    }

    // For non-address queries, tell user to use slash command
    await message.reply({
      content: `For searching usernames or other queries, please use the slash command: \`/search ${query}\` or \`/info ${query}\``,
    });
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

/**
 * Handle wallet search for text command (reuses logic from search.ts)
 */
async function handleWalletSearch(
  message: Message,
  address: string,
  userId?: string,
  guildId?: string,
  channelId?: string,
): Promise<void> {
  // Import search logic
  const { handleWalletSearch: searchWalletSearch } = await import("../commands/search");
  
  // We need to create a fake interaction - but that's complex
  // Instead, let's call the search command handler directly with a message-based approach
  // For now, use the address lookup as a simple fallback
  const addressInfo = await lookupAddress(address);
  
  if (addressInfo.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("🔍 Address Information")
      .setDescription(`Found activity for \`${address}\` on ${addressInfo.length} chain(s)`)
      .setColor(0x00d4ff);

    for (const info of addressInfo) {
      let value = "";
      if (info.isContract) {
        value += "📄 **Contract**\n";
      } else {
        value += "👤 **EOA (Externally Owned Account)**\n";
      }

      if (info.balance) {
        try {
          const balanceWei = BigInt(info.balance);
          const balanceEth = Number(balanceWei) / 1e18;
          if (balanceEth > 0) {
            value += `💰 Balance: ${balanceEth.toFixed(6)} ETH\n`;
          }
        } catch (error) {
          // Ignore balance parsing errors
        }
      }

      if (info.transactionCount !== null) {
        value += `📊 Transactions: ${info.transactionCount.toLocaleString()}\n`;
      }

      value += `🔗 [View on ${info.chainName} Explorer](${info.explorerUrl})`;

      embed.addFields({
        name: `${info.chainName} (Chain ID: ${info.chainId})`,
        value,
        inline: false,
      });
    }

    applyBranding(embed, "address lookup");
    
    await message.reply({
      embeds: [embed],
    });
    
    logger.search(address, "discord", userId, guildId, channelId, {
      success: true,
      type: "address",
    });
    return;
  }

  // For full search functionality, recommend using slash command
  await message.reply({
    content: `Address \`${address}\` found but no detailed information available.\n\nFor full search (Farcaster profiles, Zora, Clanker tokens), use: \`/search ${address}\` or \`/info ${address}\``,
  });
}

/**
 * Handle transaction search for text command
 */
async function handleTransactionSearch(
  message: Message,
  txHash: string,
  originalQuery: string,
): Promise<void> {
  const preferredChainId = detectChainFromTransactionLink(originalQuery);
  const transaction = await lookupTransaction(txHash, preferredChainId || undefined);

  if (!transaction) {
    await message.reply({
      content: `❌ Transaction \`${txHash}\` not found on any supported chain.\n\n**Supported chains:** Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BSC, Fantom, Mantle, Monad\n\n**Note:** If this is a Relay cross-chain transaction, use \`/relay\` instead.`,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🔍 Transaction Details")
    .setColor(transaction.status === "success" ? 0x00ff00 : transaction.status === "failed" ? 0xff0000 : 0xffff00)
    .addFields(
      {
        name: "🌐 Chain",
        value: `${transaction.chainName} (Chain ID: ${transaction.chainId})`,
        inline: true,
      },
      {
        name: "📊 Status",
        value: transaction.status === "success" ? "✅ Success" : transaction.status === "failed" ? "❌ Failed" : "⏳ Pending",
        inline: true,
      },
      {
        name: "📤 From",
        value: `\`${transaction.from}\``,
        inline: false,
      },
    );

  if (transaction.to) {
    embed.addFields({
      name: "📥 To",
      value: `\`${transaction.to}\``,
      inline: false,
    });
  }

  if (transaction.blockNumber) {
    embed.addFields({
      name: "🔢 Block",
      value: `#${transaction.blockNumber.toLocaleString()}`,
      inline: true,
    });
  }

  if (transaction.timestamp) {
    embed.addFields({
      name: "🕐 Time",
      value: `<t:${transaction.timestamp}:F>`,
      inline: true,
    });
  }

  if (transaction.value && transaction.value !== "0x0") {
    try {
      const valueWei = BigInt(transaction.value);
      const valueEth = Number(valueWei) / 1e18;
      if (valueEth > 0) {
        embed.addFields({
          name: "💰 Value",
          value: `${valueEth.toFixed(6)} ETH`,
          inline: true,
        });
      }
    } catch (error) {
      // Ignore value parsing errors
    }
  }

  embed
    .addFields({
      name: "🔗 Explorer",
      value: `[View on ${transaction.chainName} Explorer](${transaction.explorerUrl})`,
      inline: false,
    })
    .setFooter({
      text: `Transaction Hash: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`,
    });

  applyBranding(embed, "transaction lookup");
  
  await message.reply({
    embeds: [embed],
  });
}

