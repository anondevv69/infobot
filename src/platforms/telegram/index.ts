import TelegramBot from "node-telegram-bot-api";
import { env } from "../../config";
import { handleTelegramMessage } from "./handlers/message";
import { handleTelegramCommand } from "./handlers/command";
import { showTelegramTypingIndicator } from "../../utils/typingIndicator";
import { logger } from "../../utils/logger";
import { trackUser, trackSearch, setTelegramChatCount } from "../../utils/botStats";

// Track seen Telegram chats to detect new groups/channels
// NOTE: This is just for fast lookup - actual data is in database
// This Set is small (just chat IDs as numbers) and won't cause memory issues
const seenTelegramChats = new Set<number>();

// Clear cache periodically (every 1 hour) to prevent memory bloat
// This ensures we don't accumulate too much data in memory
setInterval(() => {
  seenTelegramChats.clear();
  setTelegramChatCount(0);
}, 60 * 60 * 1000); // Every 1 hour

export async function startTelegramBot(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.log("[InfoBot] Telegram: TELEGRAM_BOT_TOKEN not set, skipping.");
    return;
  }

  console.log("[InfoBot] Telegram: starting...");
  const bot = new TelegramBot(token, { polling: true });

  // Set up bot commands for Telegram command suggestions
  // This makes commands show up when users type "/" in groups
  await bot.setMyCommands([
    { command: "start", description: "Start the bot and see help" },
    { command: "help", description: "Show help and available commands" },
    { command: "info", description: "Universal search (wallets, contracts, profiles, transactions)" },
    { command: "w", description: "Wallet lookup (matches Farcaster/Zora first, then wallet info)" },
    { command: "f", description: "Farcaster user lookup (username or wallet)" },
    { command: "c", description: "Farcaster cast search by keyword" },
    { command: "cl", description: "Clanker token deployment search" },
    { command: "z", description: "Zora account, contract, or creator coin search" },
    { command: "t", description: "Token lookup (get all info about a token contract)" },
    { command: "r", description: "Cross-chain transaction details (Relay.link)" },
    { command: "x", description: "Farcaster profile by X/Twitter handle or URL" },
  ]);
  console.log("[InfoBot] Telegram: ready (polling).");

  bot.on("message", async (msg) => {
    // Track new Telegram groups/channels
    const chatId = msg.chat.id;
    const chatType = msg.chat.type; // "private", "group", "supergroup", "channel"
    
    // Only track groups, supergroups, and channels (not private chats)
    // Only log when bot is first added to a group (similar to Discord's GuildCreate event)
    if (chatType === "group" || chatType === "supergroup" || chatType === "channel") {
      const chatIdStr = chatId.toString();
      
      // Skip if already in memory cache (fast path)
      if (seenTelegramChats.has(chatId)) {
        // Don't update member count in memory - it's stored in database
        // This reduces memory usage significantly
        return; // Don't process further - already seen
      }
      
      // Use atomic "check and mark" approach to prevent race conditions
      // Try to mark in database FIRST - if it succeeds, it's new; if it fails, it already exists
      const chatTitle = msg.chat.title || "Unknown";
      const chatUsername = msg.chat.username ? `@${msg.chat.username}` : "None";
      
      // Get member count for database storage (not memory - reduces memory usage)
      let memberCount: number | null = null;
      if (chatType === "group" || chatType === "supergroup") {
        try {
          memberCount = await bot.getChatMemberCount(chatId);
        } catch (error) {
          // Bot might not have permission to get member count
          memberCount = null;
        }
      }
      
      // Try to mark in database - this is atomic and prevents duplicates
      let isNew = false;
      try {
        const { env } = await import("../../config");
        if (env.backendUrl) {
          // First check if already exists
          const checkResponse = await fetch(`${env.backendUrl}/api/seen/telegram-chat?chatId=${encodeURIComponent(chatIdStr)}`, {
            signal: AbortSignal.timeout(2000),
          });
          
          if (checkResponse.ok) {
            const checkData = await checkResponse.json();
            if (checkData.seen === true) {
              // Already exists - update cache and return
              seenTelegramChats.add(chatId);
              setTelegramChatCount(seenTelegramChats.size);
              return; // Don't log - already seen
            }
          }
          
          // Not in database - mark it now (atomic operation)
          const markResponse = await fetch(`${env.backendUrl}/api/seen/telegram-chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId: chatIdStr,
              chatTitle,
              chatType,
              memberCount,
            }),
            signal: AbortSignal.timeout(2000),
          });
          
          if (markResponse.ok) {
            const markData = await markResponse.json();
            isNew = markData.isNew === true; // Only log if it was actually new
            // Update cache regardless
            seenTelegramChats.add(chatId);
            setTelegramChatCount(seenTelegramChats.size);
          }
        }
      } catch (error) {
        // If database operations fail, don't log - better to miss than duplicate
        return;
      }
      
      // Only log if we successfully marked it as new in database
      if (isNew) {
        const memberCountDisplay = chatType === "channel" 
          ? "N/A (Channel)" 
          : memberCount !== null 
            ? memberCount.toString() 
            : "Unknown";
        
        logger.system(
          `🎉 **NEW TELEGRAM ${chatType.toUpperCase()}**\n` +
          `**Name:** ${chatTitle}\n` +
          `**ID:** ${chatId}\n` +
          `**Username:** ${chatUsername}\n` +
          `**Type:** ${chatType}\n` +
          `**Members:** ${memberCountDisplay}`,
          {
            chatId: chatIdStr,
            chatTitle,
            chatUsername,
            chatType,
            memberCount: memberCount || undefined,
          }
        );
      }
    }
    
    // Track user
    if (msg.from?.id) {
      trackUser(msg.from.id.toString(), "telegram");
    }
    
    // Handle text messages (addresses, usernames, etc.) - NOT commands
    // Commands (starting with /) are handled by onText handlers below
    // Commands work in groups without mentioning the bot
    if (msg.text && !msg.text.startsWith("/")) {
      const text = msg.text.trim();
      
      // Handle the message
      await handleTelegramMessage(bot, msg);
    }
  });

  bot.onText(/\/start/, async (msg) => {
    await handleTelegramCommand(bot, msg, "start");
  });

  bot.onText(/\/help/, async (msg) => {
    await handleTelegramCommand(bot, msg, "help");
  });

  // Commands with parameters - single letter commands
  bot.onText(/^\/info (.+)$/, async (msg, match) => {
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "info", query);
    }
  });

  bot.onText(/^\/w (.+)$/, async (msg, match) => {
    const query = match?.[1]?.trim();
    if (query) {
      await handleTelegramCommand(bot, msg, "wallet", query);
    }
  });

  bot.onText(/^\/f (.+)$/, async (msg, match) => {
    const query = match?.[1]?.trim();
    if (query) {
      await handleTelegramCommand(bot, msg, "far", query);
    }
  });

  bot.onText(/^\/c (.+)$/, async (msg, match) => {
    const keyword = match?.[1];
    if (keyword) {
      await handleTelegramCommand(bot, msg, "casts", keyword);
    }
  });

  bot.onText(/^\/cl (.+)$/, async (msg, match) => {
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "clanker", query);
    }
  });

  bot.onText(/^\/z (.+)$/, async (msg, match) => {
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "zora", query);
    }
  });

  bot.onText(/^\/t (.+)$/, async (msg, match) => {
    const query = match?.[1]?.trim();
    if (query) {
      await handleTelegramCommand(bot, msg, "token", query);
    }
  });

  bot.onText(/^\/r (.+)$/, async (msg, match) => {
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "relay", query);
    }
  });

  bot.onText(/^\/x (.+)$/, async (msg, match) => {
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "x", query);
    }
  });

  // Commands without parameters (show usage)
  bot.onText(/^\/info$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "info");
  });

  bot.onText(/^\/w$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "wallet");
  });

  bot.onText(/^\/f$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "far");
  });

  bot.onText(/^\/c$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "casts");
  });

  bot.onText(/^\/cl$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "clanker");
  });

  bot.onText(/^\/z$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "zora");
  });

  bot.onText(/^\/t$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "token");
  });

  bot.onText(/^\/r$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "relay");
  });

  bot.onText(/^\/x$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "x");
  });

  bot.onText(/\/zora$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "zora");
  });

  bot.onText(/\/clanker$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "clanker");
  });

  bot.onText(/\/casts$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "casts");
  });

  bot.onText(/\/relay (.+)/, async (msg, match) => {
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "relay", query);
    }
  });

  bot.onText(/\/relay$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "relay");
  });


  // Handle pagination callbacks and info confirmations
  bot.on("callback_query", async (callbackQuery) => {
    const data = callbackQuery.data;
    
    // Handle info command confirmations
    if (data?.startsWith("info_confirm_")) {
      const { getInfoConfirmation, removeInfoConfirmation } = await import("../../utils/infoConfirmationStore");
      const confirmation = getInfoConfirmation(data);
      
      if (!confirmation) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: "❌ This confirmation has expired. Please use 'info <query>' again.",
          show_alert: true,
        });
        return;
      }
      
      // Check if user matches
      if (confirmation.userId && callbackQuery.from?.id.toString() !== confirmation.userId) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: "❌ This confirmation is for a different user.",
          show_alert: true,
        });
        return;
      }
      
      // Remove confirmation
      removeInfoConfirmation(data);
      
      // Update message to show searching
      await bot.editMessageText("🔍 Searching...", {
        chat_id: callbackQuery.message?.chat.id,
        message_id: callbackQuery.message?.message_id,
        reply_markup: undefined,
      });
      
      // Execute the search
      // Extract identifier from URLs before searching (username, address, etc.)
      const { extractSearchIdentifier } = await import("../../utils/urlExtraction");
      const searchQuery = extractSearchIdentifier(confirmation.query, confirmation.searchType);
      
      const { handleTelegramCommand } = await import("./handlers/command");
      await handleTelegramCommand(bot, { chat: { id: callbackQuery.message?.chat.id } } as TelegramBot.Message, "search", searchQuery);
      
      await bot.answerCallbackQuery(callbackQuery.id);
      return;
    }
    
    // Handle info command cancellations
    if (data?.startsWith("info_cancel_")) {
      await bot.editMessageText("❌ Search cancelled.", {
        chat_id: callbackQuery.message?.chat.id,
        message_id: callbackQuery.message?.message_id,
        reply_markup: undefined,
      });
      await bot.answerCallbackQuery(callbackQuery.id);
      return;
    }
    if (!data) return;

    // Handle pagination: page_<page>|<identifier>
    const pageMatch = data.match(/^page_(\d+)\|(.+)$/);
    if (pageMatch) {
      const page = parseInt(pageMatch[1], 10);
      const identifier = pageMatch[2];
      const { handleTelegramPagination } = await import("./utils/pagination");
      await handleTelegramPagination(bot, callbackQuery, page, identifier);
      return;
    }

    // Handle page info (non-functional button)
    if (data.startsWith("page_info_")) {
      await bot.answerCallbackQuery(callbackQuery.id);
      return;
    }
  });

  bot.on("polling_error", (error) => {
    console.error("Telegram polling error:", error);
  });

  console.log("Telegram bot started and polling...");
}

