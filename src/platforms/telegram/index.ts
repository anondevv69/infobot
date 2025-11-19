import TelegramBot from "node-telegram-bot-api";
import { env } from "../../config";
import { handleTelegramMessage } from "./handlers/message";
import { handleTelegramCommand } from "./handlers/command";
import { showTelegramTypingIndicator } from "../../utils/typingIndicator";
import { logger } from "../../utils/logger";
import { trackUser, trackSearch, setTelegramChatCount, setTelegramChatMembers } from "../../utils/botStats";

// Track seen Telegram chats to detect new groups/channels
const seenTelegramChats = new Set<number>();

export async function startTelegramBot(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN not set. Telegram bot will not start.");
    return;
  }

  const bot = new TelegramBot(token, { polling: true });

  // Set up bot commands for Telegram command suggestions
  // This makes commands show up when users type "/" in groups
  await bot.setMyCommands([
    { command: "start", description: "Start the bot and see help" },
    { command: "help", description: "Show help and available commands" },
    { command: "search", description: "Search wallets, contracts, Farcaster profiles, or Zora accounts" },
    { command: "zora", description: "Search Zora accounts, contracts, or creator coins" },
    { command: "clanker", description: "Search Clanker deployments" },
    { command: "casts", description: "Search Farcaster casts by keyword" },
    { command: "relay", description: "Get cross-chain transaction details from Relay.link. Provide a full transaction link from a block explorer (e.g., https://basescan.org/tx/0x...)" },
  ]);

  bot.on("message", async (msg) => {
    // Track new Telegram groups/channels
    const chatId = msg.chat.id;
    const chatType = msg.chat.type; // "private", "group", "supergroup", "channel"
    
    // Only track groups, supergroups, and channels (not private chats)
    if (chatType === "group" || chatType === "supergroup" || chatType === "channel") {
      // Check database to see if we've already logged this chat (prevents duplicates after restart)
      const chatIdStr = chatId.toString();
      let alreadySeen = seenTelegramChats.has(chatId);
      
      // Also check database if not in memory
      if (!alreadySeen) {
        try {
          const { env } = await import("../../config");
          if (env.backendUrl) {
            const response = await fetch(`${env.backendUrl}/api/seen/telegram-chat?chatId=${encodeURIComponent(chatIdStr)}`);
            if (response.ok) {
              const data = await response.json();
              alreadySeen = data.seen === true;
            }
          }
        } catch (error) {
          // If database check fails, continue with in-memory check
        }
      }
      
      if (!alreadySeen) {
        seenTelegramChats.add(chatId);
        setTelegramChatCount(seenTelegramChats.size);
        
        try {
          const chatTitle = msg.chat.title || "Unknown";
          const chatUsername = msg.chat.username ? `@${msg.chat.username}` : "None";
          
          // Get actual member count for groups/supergroups (not channels)
          let memberCount: number | null = null;
          if (chatType === "group" || chatType === "supergroup") {
            try {
              memberCount = await bot.getChatMemberCount(chatId);
              if (memberCount !== null) {
                setTelegramChatMembers(chatId, memberCount);
              }
            } catch (error) {
              // Bot might not have permission to get member count
              memberCount = null;
            }
          }
          
          const memberCountDisplay = chatType === "channel" 
            ? "N/A (Channel)" 
            : memberCount !== null 
              ? memberCount.toString() 
              : "Unknown";
          
          // Mark as seen in database
          try {
            const { env } = await import("../../config");
            if (env.backendUrl) {
              await fetch(`${env.backendUrl}/api/seen/telegram-chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chatId: chatIdStr,
                  chatTitle,
                  chatType,
                  memberCount,
                }),
              });
            }
          } catch (error) {
            // Silently fail - database might not be available
          }
          
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
        } catch (error) {
          logger.error("Failed to log new Telegram chat", error, {
            chatId: chatIdStr,
            chatType,
          });
        }
      } else if ((chatType === "group" || chatType === "supergroup") && seenTelegramChats.has(chatId)) {
        // Update member count for existing chats (refresh periodically)
        try {
          const memberCount = await bot.getChatMemberCount(chatId);
          if (memberCount !== null) {
            setTelegramChatMembers(chatId, memberCount);
          }
        } catch (error) {
          // Silently fail - might not have permission
        }
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

  // Commands with parameters
  bot.onText(/\/search (.+)/, async (msg, match) => {
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "search", query);
    }
  });

  bot.onText(/\/zora (.+)/, async (msg, match) => {
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "zora", query);
    }
  });

  bot.onText(/\/clanker (.+)/, async (msg, match) => {
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "clanker", query);
    }
  });

  bot.onText(/\/casts (.+)/, async (msg, match) => {
    const keyword = match?.[1];
    if (keyword) {
      await handleTelegramCommand(bot, msg, "casts", keyword);
    }
  });

  // Commands without parameters (show usage)
  bot.onText(/\/search$/, async (msg) => {
    await handleTelegramCommand(bot, msg, "search");
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


  // Handle pagination callbacks
  bot.on("callback_query", async (callbackQuery) => {
    const data = callbackQuery.data;
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

