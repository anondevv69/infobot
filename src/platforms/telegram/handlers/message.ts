import TelegramBot from "node-telegram-bot-api";
import { isEthAddress, isSolAddress, extractFirstAddress, extractZoraContractReference } from "../../../utils/address";
import { findBestZoraSummary, fetchZoraCoin } from "../../../services/zora";
import { findUserByUsername, findUserByWallet } from "../../../services/neynar";
import { sendClankerTokenPages } from "./clankerHandler";
import { buildZoraProfileEmbed, appendZoraSummaryFields } from "../../../utils/zoraEmbeds";
import { buildFarcasterPresentation } from "../../../utils/farcasterPresentation";
import { buildWalletProfileResponse } from "../../../utils/walletEmbed";
import { embedsToTelegram } from "../adapters/telegramAdapter";
import { buildZoraCoinResponse } from "../../../handlers/zoraAddress";
import { safeFetchTokensByFid, safeFetchMostRecentCast } from "../../../utils/farcasterHelpers";
import { collectZoraIdentifiers } from "../../../utils/zoraPresentation";
import { isSummaryAssociatedWithUser } from "../../../utils/zoraAssociation";
import { splitEmbedIntoPages } from "../../../utils/pagination";

export async function handleTelegramMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
): Promise<void> {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // In groups, ignore messages that don't mention the bot (unless it's a direct address/username)
  if (msg.chat.type !== "private") {
    // Check if message mentions the bot
    const botUsername = (bot as any).options?.username || process.env.TELEGRAM_BOT_USERNAME;
    const mentionsBot = botUsername && (
      text.includes(`@${botUsername}`) ||
      msg.entities?.some(e => e.type === "mention" && text.substring(e.offset, e.offset + e.length) === `@${botUsername}`)
    );
    
    // Only process if it mentions the bot OR is clearly an address/username
    if (!mentionsBot && !isEthAddress(text) && !text.startsWith("@") && !text.includes("zora.co")) {
      return; // Ignore messages in groups that don't mention the bot
    }
    
    // Remove bot mention from text if present
    const cleanText = botUsername ? text.replace(new RegExp(`@${botUsername}\\s*`, "gi"), "").trim() : text;
    if (!cleanText) return;
    
    // Use clean text for processing
    return processMessage(bot, chatId, cleanText);
  }

  // In private chats, process all messages
  return processMessage(bot, chatId, text);
}

async function processMessage(bot: TelegramBot, chatId: number, text: string): Promise<void> {
  try {
    // Check if it's an Ethereum address
    if (isEthAddress(text)) {
      const address = extractFirstAddress(text);
      if (address) {
        // Try Clanker first (build all pages)
        const clankerSent = await sendClankerTokenPages(bot, chatId, address);
        if (clankerSent) {
          return;
        }

        // Try Zora
        const reference = extractZoraContractReference(text);
        if (reference) {
          const coin = await fetchZoraCoin(reference.address, reference.chainId);
          if (coin) {
            const zoraSummary = await findBestZoraSummary([address.toLowerCase()]);
            const response = await buildZoraCoinResponse(coin, zoraSummary, { returnAllPages: true }); // Get all pages for Telegram
            const messages = embedsToTelegram(response.embeds);
            for (const msg of messages) {
              await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
            }
            return;
          }
        }
        
        // Try Zora profile lookup
        const zoraSummary = await findBestZoraSummary([address.toLowerCase()]);
        if (zoraSummary) {
          const embed = buildZoraProfileEmbed(zoraSummary);
          await appendZoraSummaryFields(embed, zoraSummary);
          // Split into pages if needed (same as Discord)
          const embeds = splitEmbedIntoPages(embed, 15);
          const messages = embedsToTelegram(embeds);
          for (const msg of messages) {
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
          }
          return;
        }

        // Try wallet (need to find user first)
        try {
          const user = await findUserByWallet(address);
          if (user) {
            const [tokens, latestCast, zoraSummary] = await Promise.all([
              safeFetchTokensByFid(user.fid),
              safeFetchMostRecentCast(user.fid),
              findBestZoraSummary(collectZoraIdentifiers(user)),
            ]);
            const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;
            
            const walletResponse = await buildWalletProfileResponse({
              wallet: address,
              user,
              zoraSummary: associatedSummary,
              clankerTokens: tokens,
              latestCast,
              returnAllPages: true, // Get all pages for Telegram
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

    // Check if it's a Farcaster username (starts with @)
    if (text.startsWith("@")) {
      const username = text.replace("@", "").trim();
      try {
        const user = await findUserByUsername(username);
        if (user) {
          const [tokens, latestCast, zoraSummary] = await Promise.all([
            safeFetchTokensByFid(user.fid),
            safeFetchMostRecentCast(user.fid),
            findBestZoraSummary(collectZoraIdentifiers(user)),
          ]);
          const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;
          
          const result = await buildFarcasterPresentation(user, {
            tokens,
            zoraSummary: associatedSummary,
            latestCast,
            returnAllPages: true, // Get all pages for Telegram
          });
          const messages = embedsToTelegram(result.embeds);
          for (const msg of messages) {
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
          }
          return;
        }
      } catch (error) {
        // User not found, continue
      }
    }

    // Check if it's a Zora profile URL or handle
    if (text.includes("zora.co") || text.startsWith("zora/")) {
      const reference = extractZoraContractReference(text);
      if (reference) {
        const coin = await fetchZoraCoin(reference.address, reference.chainId);
        if (coin) {
          const zoraSummary = await findBestZoraSummary([reference.address.toLowerCase()]);
          const response = await buildZoraCoinResponse(coin, zoraSummary, { returnAllPages: true }); // Get all pages for Telegram
          const messages = embedsToTelegram(response.embeds);
          for (const msg of messages) {
            await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
          }
          return;
        }
      }
      
      // Try as profile lookup
      const zoraSummary = await findBestZoraSummary([text]);
      if (zoraSummary) {
        const embed = buildZoraProfileEmbed(zoraSummary);
        await appendZoraSummaryFields(embed, zoraSummary);
        // Split into pages if needed (same as Discord)
        const embeds = splitEmbedIntoPages(embed, 15);
        const messages = embedsToTelegram(embeds);
        for (const msg of messages) {
          await bot.sendMessage(chatId, msg, { parse_mode: "Markdown", disable_web_page_preview: true });
        }
        return;
      }
    }

    // If we get here and it's a private chat, don't send anything (silent failure for auto-detection)
    // In groups, we already filtered out non-mentions above
  } catch (error) {
    console.error("Error handling Telegram message:", error);
    // Don't send error to user for auto-detection failures
  }
}
