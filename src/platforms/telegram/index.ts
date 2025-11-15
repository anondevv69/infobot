import TelegramBot from "node-telegram-bot-api";
import { env } from "../../config";
import { handleTelegramMessage } from "./handlers/message";
import { handleTelegramCommand } from "./handlers/command";

export async function startTelegramBot(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN not set. Telegram bot will not start.");
    return;
  }

  const bot = new TelegramBot(token, { polling: true });

  bot.on("message", async (msg) => {
    // Handle text messages (addresses, usernames, etc.)
    // Commands are handled by onText handlers below
    if (msg.text && !msg.text.startsWith("/")) {
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

  bot.on("polling_error", (error) => {
    console.error("Telegram polling error:", error);
  });

  console.log("Telegram bot started and polling...");
}

