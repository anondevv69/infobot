import TelegramBot from "node-telegram-bot-api";
import { handleTelegramCommand } from "./command";
import { isEthAddress, isSolAddress, isTransactionHash } from "../../../utils/address";
import { extractTransactionHash } from "../../../services/relay";
import { lookupTransaction, detectChainFromTransactionLink } from "../../../services/transactionLookup";
import { lookupAddress } from "../../../services/addressLookup";
import { trackUser, trackSearch, trackResponseTime } from "../../../utils/botStats";
import { logger } from "../../../utils/logger";
import { embedsToTelegram } from "../adapters/telegramAdapter";
import { EmbedBuilder } from "discord.js";
import { applyBranding } from "../../../utils/branding";

/**
 * Handle text command "info <query>" in Telegram
 * Reuses search logic from handleTelegramCommand
 */
export async function handleTelegramInfoCommand(
  bot: TelegramBot,
  chatId: number,
  query: string,
): Promise<void> {
  // Track user and search (we don't have user ID in this context, so skip user tracking)
  trackSearch();

  logger.command("info", "telegram", undefined, chatId.toString(), undefined, { query });

  if (!query) {
    await bot.sendMessage(
      chatId,
      "Please provide a wallet address, username, or token to search.\n\nUsage: <code>info &lt;query&gt;</code>\nExample: <code>info 0x1234...</code> or <code>info @username</code>",
      { parse_mode: "HTML" }
    );
    return;
  }

  // Log search immediately
  logger.search(query, "telegram", undefined, chatId.toString(), undefined, {
    success: true,
    type: "pending",
  });

  // Track response time
  const startTime = Date.now();
  
  // Show typing indicator
  await bot.sendChatAction(chatId, "typing");

  try {
    // Check if it's a transaction hash first
    const txHash = extractTransactionHash(query);
    if (txHash && isTransactionHash(txHash)) {
      await handleTransactionSearch(bot, chatId, txHash, query);
      logger.search(query, "telegram", undefined, chatId.toString(), undefined, {
        success: true,
        type: "transaction",
      });
      return;
    }

    if (isEthAddress(query) || isSolAddress(query)) {
      await handleWalletSearch(bot, chatId, query);
      return;
    }

    // For non-address queries, redirect to /search command
    await bot.sendMessage(
      chatId,
      `For searching usernames or other queries, please use: <code>/search ${query}</code> or <code>/info ${query}</code>`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    logger.error(
      `Telegram info command failed for query: ${query}`,
      error,
      { query, chatId, platform: "telegram" }
    );

    logger.search(query, "telegram", undefined, chatId.toString(), undefined, {
      success: false,
    });

    await bot.sendMessage(
      chatId,
      "❌ An error occurred while processing your search. Please try again.",
    );
  } finally {
    // Track response time
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
  }
}

/**
 * Handle wallet search for text command
 */
async function handleWalletSearch(
  bot: TelegramBot,
  chatId: number,
  address: string,
): Promise<void> {
  // Use the existing search command handler which has full logic
  const { handleTelegramCommand } = await import("./command");
  await handleTelegramCommand(bot, { chat: { id: chatId } } as TelegramBot.Message, "search", address);
}

/**
 * Handle transaction search for text command
 */
async function handleTransactionSearch(
  bot: TelegramBot,
  chatId: number,
  txHash: string,
  originalQuery: string,
): Promise<void> {
  const preferredChainId = detectChainFromTransactionLink(originalQuery);
  const transaction = await lookupTransaction(txHash, preferredChainId || undefined);

  if (!transaction) {
    await bot.sendMessage(
      chatId,
      `❌ Transaction <code>${txHash}</code> not found on any supported chain.\n\n<b>Supported chains:</b> Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BSC, Fantom, Mantle, Monad\n\n<b>Note:</b> If this is a Relay cross-chain transaction, use <code>/relay</code> instead.`,
      { parse_mode: "HTML" }
    );
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
  
  const messages = embedsToTelegram([embed]);
  await bot.sendMessage(chatId, messages[0], {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

