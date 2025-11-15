import TelegramBot from "node-telegram-bot-api";
import { handleUsernameMessage as handleDiscordUsername } from "../../../handlers/username";
import { handleZoraAddressMessage } from "../../../handlers/zoraAddress";
import { handleClankerAddressMessage } from "../../../handlers/clankerAddress";
import { isEthAddress, isSolAddress } from "../../../utils/address";

export async function handleTelegramMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
): Promise<void> {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  try {
    // Check if it's an Ethereum address
    if (isEthAddress(text)) {
      // Try Clanker first, then Zora, then wallet
      const clankerResult = await tryClankerLookup(text);
      if (clankerResult) {
        await bot.sendMessage(chatId, clankerResult, { parse_mode: "Markdown", disable_web_page_preview: true });
        return;
      }

      const zoraResult = await tryZoraLookup(text);
      if (zoraResult) {
        await bot.sendMessage(chatId, zoraResult, { parse_mode: "Markdown", disable_web_page_preview: true });
        return;
      }

      // Wallet lookup
      const walletResult = await tryWalletLookup(text);
      if (walletResult) {
        await bot.sendMessage(chatId, walletResult, { parse_mode: "Markdown", disable_web_page_preview: true });
        return;
      }
    }

    // Check if it's a Farcaster username (starts with @)
    if (text.startsWith("@")) {
      const usernameResult = await tryUsernameLookup(text.replace("@", ""));
      if (usernameResult) {
        await bot.sendMessage(chatId, usernameResult, { parse_mode: "Markdown", disable_web_page_preview: true });
        return;
      }
    }

    // Check if it's a Zora profile URL or handle
    if (text.includes("zora.co") || text.startsWith("zora/")) {
      const zoraResult = await tryZoraLookup(text);
      if (zoraResult) {
        await bot.sendMessage(chatId, zoraResult, { parse_mode: "Markdown", disable_web_page_preview: true });
        return;
      }
    }

  } catch (error) {
    console.error("Error handling Telegram message:", error);
    // Don't send error to user for auto-detection failures
  }
}

// Helper functions - these will use existing services and convert to Telegram format
async function tryClankerLookup(address: string): Promise<string | null> {
  // Use existing Clanker service, convert to Telegram format
  return null; // Placeholder
}

async function tryZoraLookup(query: string): Promise<string | null> {
  // Use existing Zora service, convert to Telegram format
  return null; // Placeholder
}

async function tryWalletLookup(address: string): Promise<string | null> {
  // Use existing wallet service, convert to Telegram format
  return null; // Placeholder
}

async function tryUsernameLookup(username: string): Promise<string | null> {
  // Use existing username service, convert to Telegram format
  return null; // Placeholder
}

