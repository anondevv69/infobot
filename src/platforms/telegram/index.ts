import TelegramBot from "node-telegram-bot-api";
import { env } from "../../config";
import { handleTelegramMessage } from "./handlers/message";
import { handleTelegramCommand } from "./handlers/command";
import { showTelegramTypingIndicator, showTelegramEyeIndicator, deleteTelegramMessage } from "../../utils/typingIndicator";

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
    { command: "relay", description: "Get cross-chain transaction details from Relay.link" },
  ]);

  bot.on("message", async (msg) => {
    // Handle text messages (addresses, usernames, etc.) - NOT commands
    // Commands (starting with /) are handled by onText handlers below
    // Commands work in groups without mentioning the bot
    if (msg.text && !msg.text.startsWith("/")) {
      // Show eye emoji indicator that stays until response
      let eyeMessageId: number | null = null;
      if (msg.chat.id) {
        eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
      }
      
      // Handle the message
      await handleTelegramMessage(bot, msg);
      
      // Delete eye emoji after response is sent (wait longer to ensure all responses are sent)
      if (eyeMessageId && msg.chat.id) {
        // Delay to ensure response is fully sent before removing eye emoji
        setTimeout(() => {
          deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
        }, 2000);
      }
    }
  });

  bot.onText(/\/start/, async (msg) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    await handleTelegramCommand(bot, msg, "start");
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
  });

  bot.onText(/\/help/, async (msg) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    await handleTelegramCommand(bot, msg, "help");
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
  });

  // Commands with parameters
  bot.onText(/\/search (.+)/, async (msg, match) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "search", query);
    }
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
  });

  bot.onText(/\/zora (.+)/, async (msg, match) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "zora", query);
    }
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
  });

  bot.onText(/\/clanker (.+)/, async (msg, match) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "clanker", query);
    }
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
  });

  bot.onText(/\/casts (.+)/, async (msg, match) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    const keyword = match?.[1];
    if (keyword) {
      await handleTelegramCommand(bot, msg, "casts", keyword);
    }
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
  });

  // Commands without parameters (show usage)
  bot.onText(/\/search$/, async (msg) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    await handleTelegramCommand(bot, msg, "search");
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
  });

  bot.onText(/\/zora$/, async (msg) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    await handleTelegramCommand(bot, msg, "zora");
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
  });

  bot.onText(/\/clanker$/, async (msg) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    await handleTelegramCommand(bot, msg, "clanker");
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
  });

  bot.onText(/\/casts$/, async (msg) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    await handleTelegramCommand(bot, msg, "casts");
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
  });

  bot.onText(/\/relay (.+)/, async (msg, match) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    const query = match?.[1];
    if (query) {
      await handleTelegramCommand(bot, msg, "relay", query);
    }
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
  });

  bot.onText(/\/relay$/, async (msg) => {
    let eyeMessageId: number | null = null;
    if (msg.chat.id) {
      eyeMessageId = await showTelegramEyeIndicator(bot, msg.chat.id);
    }
    await handleTelegramCommand(bot, msg, "relay");
    if (eyeMessageId && msg.chat.id) {
      setTimeout(() => {
        deleteTelegramMessage(bot, msg.chat.id, eyeMessageId!).catch(() => {});
      }, 2000);
    }
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

