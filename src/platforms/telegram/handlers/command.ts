import TelegramBot from "node-telegram-bot-api";
import { isEthAddress, isSolAddress } from "../../../utils/address";
import { findBestZoraSummary } from "../../../services/zora";
import { fetchTokensByQuery, fetchTokensByAddress } from "../../../services/clanker";
import { findUserByUsername, findUserByWallet } from "../../../services/neynar";
import { buildZoraProfileEmbed, appendZoraSummaryFields } from "../../../utils/zoraEmbeds";
import { buildTokenEmbed } from "../../../utils/clankerEmbeds";
import { buildFarcasterPresentation } from "../../../utils/farcasterPresentation";
import { buildWalletProfileResponse } from "../../../utils/walletEmbed";
import { embedsToTelegram } from "../adapters/telegramAdapter";
import { extractFirstAddress, extractZoraContractReference } from "../../../utils/address";
import { buildZoraCoinResponse } from "../../../handlers/zoraAddress";
import { fetchZoraCoin } from "../../../services/zora";

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
        
        await handleSearchQuery(bot, chatId, query);
        break;
      }

      case "zora": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a Zora query. Usage: /zora <query>");
          return;
        }
        
        await handleZoraQuery(bot, chatId, query);
        break;
      }

      case "clanker": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a Clanker query. Usage: /clanker <query>");
          return;
        }
        
        await handleClankerQuery(bot, chatId, query);
        break;
      }

      case "casts": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a keyword. Usage: /casts <keyword>");
          return;
        }
        
        await handleCastsQuery(bot, chatId, query);
        break;
      }

      default:
        await bot.sendMessage(chatId, "Unknown command. Use /help to see available commands.");
    }
  } catch (error) {
    console.error(`Error handling Telegram command ${command}:`, error);
    await bot.sendMessage(chatId, "An error occurred while processing your command. Please try again later.");
  }
}

async function handleSearchQuery(bot: TelegramBot, chatId: number, query: string): Promise<void> {
  try {
    // Try address first
    if (isEthAddress(query) || isSolAddress(query)) {
      const address = extractFirstAddress(query);
      if (address) {
        // Try Clanker
        const tokens = await fetchTokensByAddress(address);
        if (tokens && tokens.length > 0) {
          const embed = await buildTokenEmbed(tokens[0]);
          const messages = embedsToTelegram([embed]);
          for (const msg of messages) {
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
          }
          return;
        }

        // Try Zora
        const zoraSummary = await findBestZoraSummary([address.toLowerCase()]);
        if (zoraSummary) {
          const embed = buildZoraProfileEmbed(zoraSummary);
          await appendZoraSummaryFields(embed, zoraSummary);
          const messages = embedsToTelegram([embed]);
          for (const msg of messages) {
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
          }
          return;
        }

        // Try wallet (need to find user first)
        try {
          const user = await findUserByWallet(address);
          if (user) {
            const walletResponse = await buildWalletProfileResponse({
              wallet: address,
              user,
            });
            if (walletResponse && walletResponse.embeds.length > 0) {
              const messages = embedsToTelegram(walletResponse.embeds);
              for (const msg of messages) {
                await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
              }
              return;
            }
          }
        } catch (error) {
          // User not found, continue
        }
      }
    }

    // Try Farcaster username
    const normalizedUsername = query.replace(/^@/, "").toLowerCase();
    try {
      const user = await findUserByUsername(normalizedUsername);
      if (user) {
        const result = await buildFarcasterPresentation(user);
        const messages = embedsToTelegram(result.embeds);
        for (const msg of messages) {
          await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
        }
        return;
      }
    } catch (error) {
      // User not found, continue
    }

    // Try Zora profile
    const zoraSummary = await findBestZoraSummary([normalizedUsername, `@${normalizedUsername}`, `${normalizedUsername}.eth`]);
    if (zoraSummary) {
      const embed = buildZoraProfileEmbed(zoraSummary);
      await appendZoraSummaryFields(embed, zoraSummary);
      const messages = embedsToTelegram([embed]);
      for (const msg of messages) {
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
      }
      return;
    }

    await bot.sendMessage(chatId, `No results found for: ${query}`);
  } catch (error) {
    console.error("Error in handleSearchQuery:", error);
    await bot.sendMessage(chatId, "An error occurred while searching. Please try again.");
  }
}

async function handleZoraQuery(bot: TelegramBot, chatId: number, query: string): Promise<void> {
  try {
    // Try as Zora contract reference first
    const reference = extractZoraContractReference(query);
    if (reference) {
      const coin = await fetchZoraCoin(reference.address, reference.chainId);
      if (coin) {
        const summary = await findBestZoraSummary([reference.address.toLowerCase()]);
        const response = await buildZoraCoinResponse(coin, summary);
        const messages = embedsToTelegram(response.embeds);
        for (const msg of messages) {
          await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
        }
        return;
      }
    }

    // Try as profile lookup
    const normalizedQuery = query.replace(/^@/, "").toLowerCase();
    const zoraSummary = await findBestZoraSummary([normalizedQuery, `@${normalizedQuery}`, `${normalizedQuery}.eth`]);
    if (zoraSummary) {
      const embed = buildZoraProfileEmbed(zoraSummary);
      await appendZoraSummaryFields(embed, zoraSummary);
      const messages = embedsToTelegram([embed]);
      for (const msg of messages) {
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
      }
      return;
    }
    
    await bot.sendMessage(chatId, `No Zora results found for: ${query}`);
  } catch (error) {
    console.error("Error in handleZoraQuery:", error);
    await bot.sendMessage(chatId, "An error occurred while searching Zora. Please try again.");
  }
}

async function handleClankerQuery(bot: TelegramBot, chatId: number, query: string): Promise<void> {
  try {
    // Try as address first
    if (isEthAddress(query)) {
      const address = extractFirstAddress(query);
      if (address) {
        const tokens = await fetchTokensByAddress(address);
        if (tokens && tokens.length > 0) {
          const embed = await buildTokenEmbed(tokens[0]);
          const messages = embedsToTelegram([embed]);
          for (const msg of messages) {
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
          }
          return;
        }
      }
    }

    // Try as token name/symbol search
    const tokens = await fetchTokensByQuery(query);
    if (tokens && tokens.length > 0) {
      const embed = await buildTokenEmbed(tokens[0]);
      const messages = embedsToTelegram([embed]);
      for (const msg of messages) {
        await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
      }
      return;
    }

    await bot.sendMessage(chatId, `No Clanker results found for: ${query}`);
  } catch (error) {
    console.error("Error in handleClankerQuery:", error);
    await bot.sendMessage(chatId, "An error occurred while searching Clanker. Please try again.");
  }
}

async function handleCastsQuery(bot: TelegramBot, chatId: number, keyword: string): Promise<void> {
  try {
    // This would need to be implemented - for now just show a message
    await bot.sendMessage(chatId, `Casts search for "${keyword}" is coming soon!`);
  } catch (error) {
    console.error("Error in handleCastsQuery:", error);
    await bot.sendMessage(chatId, "An error occurred while searching casts. Please try again.");
  }
}
