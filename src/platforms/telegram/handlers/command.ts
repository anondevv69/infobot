import TelegramBot from "node-telegram-bot-api";
import { handleSearchCommand } from "../../../commands/search";
import { handleCastsCommand } from "../../../commands/casts";
import { handleZoraProfileCommand } from "../../../commands/zora";
import { handleClankerCommand } from "../../../commands/clanker";
import { handleHelpCommand } from "../../../commands/help";
import { convertToTelegramMessage } from "../adapters/messageAdapter";

export async function handleTelegramCommand(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  command: string,
  query?: string,
): Promise<void> {
  const chatId = msg.chat.id;

  try {
    switch (command) {
      case "start":
      case "help": {
        const helpText = `*InfoBot Commands*

*Search Commands:*
/search <query> - Search wallets, contracts, Farcaster profiles, or Zora accounts
/zora <query> - Search Zora accounts, contracts, or creator coins
/clanker <query> - Search Clanker deployments
/casts <keyword> - Search Farcaster casts by keyword

*Auto-Detection:*
Just send:
• Ethereum address (0x...) - Auto-detects Clanker, Zora, or wallet
• Farcaster username (@username) - Looks up profile
• Zora URL - Looks up Zora profile/coin

*Examples:*
/search 0x1234...
/zora @username
/clanker tokenname

Built by rayblanco.eth`;
        await bot.sendMessage(chatId, helpText, { parse_mode: "Markdown" });
        break;
      }

      case "search": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a search query. Usage: /search <query>");
          return;
        }
        
        // Create a mock interaction-like object for the search command
        // The search handler will need to be adapted for Telegram
        const result = await convertSearchResultToTelegram(query);
        await bot.sendMessage(chatId, result, { parse_mode: "Markdown", disable_web_page_preview: true });
        break;
      }

      case "zora": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a Zora query. Usage: /zora <query>");
          return;
        }
        
        const result = await convertZoraResultToTelegram(query);
        await bot.sendMessage(chatId, result, { parse_mode: "Markdown", disable_web_page_preview: true });
        break;
      }

      case "clanker": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a Clanker query. Usage: /clanker <query>");
          return;
        }
        
        const result = await convertClankerResultToTelegram(query);
        await bot.sendMessage(chatId, result, { parse_mode: "Markdown", disable_web_page_preview: true });
        break;
      }

      case "casts": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a keyword. Usage: /casts <keyword>");
          return;
        }
        
        const result = await convertCastsResultToTelegram(query);
        await bot.sendMessage(chatId, result, { parse_mode: "Markdown", disable_web_page_preview: true });
        break;
      }

      default:
        await bot.sendMessage(chatId, "Unknown command. Use /help to see available commands.");
    }
  } catch (error) {
    console.error("Error handling Telegram command:", error);
    await bot.sendMessage(chatId, "An error occurred while processing your request. Please try again later.");
  }
}

// Helper functions to convert results to Telegram format
// These will call the existing services and format for Telegram
async function convertSearchResultToTelegram(query: string): Promise<string> {
  // This will be implemented to use existing services
  return `Searching for: ${query}\n\n(Telegram integration in progress)`;
}

async function convertZoraResultToTelegram(query: string): Promise<string> {
  return `Zora search for: ${query}\n\n(Telegram integration in progress)`;
}

async function convertClankerResultToTelegram(query: string): Promise<string> {
  return `Clanker search for: ${query}\n\n(Telegram integration in progress)`;
}

async function convertCastsResultToTelegram(keyword: string): Promise<string> {
  return `Casts search for: ${keyword}\n\n(Telegram integration in progress)`;
}

