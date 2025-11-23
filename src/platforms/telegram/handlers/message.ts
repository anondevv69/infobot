import TelegramBot from "node-telegram-bot-api";
import { isEthAddress, isSolAddress, extractFirstAddress, extractZoraContractReference } from "../../../utils/address";
import { embedsToTelegram } from "../adapters/telegramAdapter";
import { findBestZoraSummary, fetchZoraCoin } from "../../../services/zora";
import { findUserByUsername, findUserByWallet } from "../../../services/neynar";
import { sendClankerTokenPages } from "./clankerHandler";
import { buildZoraProfileEmbed, appendZoraSummaryFields } from "../../../utils/zoraEmbeds";
import { buildZoraWalletProfileResponse } from "../../../utils/walletEmbed";
import { isSummaryAssociatedWithAddress } from "../../../utils/zoraAssociation";
import { buildFarcasterPresentation } from "../../../utils/farcasterPresentation";
import { buildWalletProfileResponse } from "../../../utils/walletEmbed";
import { sendPaginatedTelegramMessage } from "../utils/sendPaginated";
import { buildZoraCoinResponse } from "../../../handlers/zoraAddress";
import { safeFetchTokensByFid, safeFetchMostRecentCast } from "../../../utils/farcasterHelpers";
import { collectZoraIdentifiers } from "../../../utils/zoraPresentation";
import { isSummaryAssociatedWithUser } from "../../../utils/zoraAssociation";
import { splitEmbedIntoPages } from "../../../utils/pagination";
import { findUserByXHandle } from "../../../services/neynar";
import { showTelegramEyeIndicator, deleteTelegramMessage } from "../../../utils/typingIndicator";

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
    
    // Only process if it mentions the bot OR is clearly a URL OR starts with "info"
    const hasFarcasterLink = /https?:\/\/(?:www\.)?farcaster\.xyz\/[^\s<>()]+/gi.test(text);
    const hasParagraphLink = /https?:\/\/(?:www\.)?paragraph\.(?:com|xyz)\/[^\s<>()]+/gi.test(text);
    const isInfoCommand = /^info\s+/i.test(text);
    if (!mentionsBot && !isInfoCommand && !text.includes("zora.co") && !text.includes("clanker.world") && !hasFarcasterLink && !hasParagraphLink) {
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
    // Handle text command "info <query>"
    const infoCommandMatch = text.match(/^info\s+(.+)$/i);
    if (infoCommandMatch) {
      const query = infoCommandMatch[1].trim();
      if (query) {
        const { handleTelegramInfoCommand } = await import("./infoCommand");
        await handleTelegramInfoCommand(bot, chatId, query);
        return;
      }
    }
    
    // Send typing indicator for any search operation
    await bot.sendChatAction(chatId, "typing");
    
    // Address auto-detection removed - use "info 0x..." or "/search 0x..." instead
    // Only process URLs now (Zora, Clanker, Farcaster, Paragraph, Base)
    
    // Check for URL patterns
    const hasZoraUrl = text.includes("zora.co");
    const hasClankerUrl = text.includes("clanker.world");
    const hasFarcasterUrl = /https?:\/\/(?:www\.)?(?:farcaster\.xyz|warpcast\.com)\/[^\s<>()]+/gi.test(text);
    const hasParagraphUrl = /https?:\/\/(?:www\.)?paragraph\.(?:com|xyz)\/[^\s<>()]+/gi.test(text);
    const hasBaseUrl = /https?:\/\/(?:www\.)?(?:base\.org|base\.app)\/[^\s<>()]+/gi.test(text);
    
    if (!hasZoraUrl && !hasClankerUrl && !hasFarcasterUrl && !hasParagraphUrl && !hasBaseUrl) {
      // No URLs detected, nothing to process
      return;
    }
    
    // Process URLs only (Zora, Clanker, Farcaster, Paragraph, Base)
    // Address auto-detection removed - use "info 0x..." or "/search 0x..." instead
    
    // Handle Zora URLs
    if (hasZoraUrl) {
      // Check if it's a Zora contract URL (zora.co/collect or zora.co/coin)
      const zoraContractRegex = /https?:\/\/zora\.co\/(?:collect|coin)\/[^\s)]+/i;
      if (zoraContractRegex.test(text)) {
        try {
          const match = text.match(zoraContractRegex);
          if (match) {
            const url = match[0];
            const addressMatch = url.match(/0x[a-fA-F0-9]{40}/i);
            if (addressMatch) {
              const address = addressMatch[0].toLowerCase();
              const coin = await fetchZoraCoin(address);
              if (coin) {
                const zoraSummary = await findBestZoraSummary([address]);
                const response = await buildZoraCoinResponse(coin, zoraSummary, { returnAllPages: true });
                const identifier = `zora_coin_${address}`;
                const pageLabels = response.embeds.length > 1
                  ? ["Coin Details", "Creator Coin & Farcaster"]
                  : undefined;
                await sendPaginatedTelegramMessage(bot, chatId, response.embeds, identifier, pageLabels);
                return;
              }
            }
          }
        } catch (error) {
          console.error("[Telegram] Error handling Zora contract URL:", error);
        }
      }
      
      // Try as profile lookup
      const reference = extractZoraContractReference(text);
      if (reference) {
        const coin = await fetchZoraCoin(reference.address, reference.chainId);
        if (coin) {
          const zoraSummary = await findBestZoraSummary([reference.address.toLowerCase()]);
          const response = await buildZoraCoinResponse(coin, zoraSummary, { returnAllPages: true });
          const identifier = `zora_coin_${reference.address.toLowerCase()}`;
          const pageLabels = response.embeds.length > 1
            ? ["Coin Details", "Creator Coin & Farcaster"]
            : undefined;
          await sendPaginatedTelegramMessage(bot, chatId, response.embeds, identifier, pageLabels);
          return;
        }
      }
      
      const zoraSummary = await findBestZoraSummary([text]);
      if (zoraSummary) {
        const embed = buildZoraProfileEmbed(zoraSummary);
        await appendZoraSummaryFields(embed, zoraSummary);
        const embeds = splitEmbedIntoPages(embed, 15);
        const identifier = `zora_profile_${text}`;
        await sendPaginatedTelegramMessage(bot, chatId, embeds, identifier);
        return;
      }
    }
    
    // Handle Clanker URLs
    if (hasClankerUrl) {
      // Extract address from Clanker URL if present
      const addressMatch = text.match(/0x[a-fA-F0-9]{40}/i);
      if (addressMatch) {
        const address = addressMatch[0].toLowerCase();
        const clankerSent = await sendClankerTokenPages(bot, chatId, address);
        if (clankerSent) {
          return;
        }
      } else {
        // Try to extract from URL pattern
        const clankerSent = await sendClankerTokenPages(bot, chatId, text);
        if (clankerSent) {
          return;
        }
      }
    }
    
    // Handle Farcaster URLs
    if (hasFarcasterUrl) {
      // Check if it's a Farcaster cast link
      const castUrlRegex = /(https?:\/\/(?:www\.)?(?:warpcast\.com|fcast\.me|farcaster\.xyz)\/[^\s]+)/i;
      if (castUrlRegex.test(text)) {
        try {
          const match = text.match(castUrlRegex);
          if (match) {
            const castUrl = match[0].replace(/[).,!?\]]*$/, "");
            const { findCastByUrl, fetchEmbeddedUrlMetadata } = await import("../../../services/neynar");
            
            let cast = await findCastByUrl(castUrl);
            
            if (!cast) {
              try {
                const metadata = await fetchEmbeddedUrlMetadata(castUrl);
                const frame = metadata?.frame as { post_url?: string } | undefined;
                const resolvedUrl = frame?.post_url || castUrl;
                if (resolvedUrl !== castUrl) {
                  cast = await findCastByUrl(resolvedUrl);
                }
              } catch (metaError) {
                // Continue with original URL
              }
            }
            
            if (cast) {
              const { buildCastEmbed } = await import("../../../handlers/castLink");
              const { buildCastUrl } = await import("../../../utils/farcasterLinks");
              const embed = buildCastEmbed(cast, buildCastUrl(cast.author.username, cast.hash));
              const messages = embedsToTelegram([embed]);
              await bot.sendMessage(chatId, messages[0], {
                parse_mode: "HTML",
                disable_web_page_preview: true,
              });
              return;
            }
          }
        } catch (error) {
          console.error("[Telegram] Error handling cast link:", error);
        }
      }
      
      // Check for Farcaster profile URLs
      const farcasterUrlMatch = text.match(/https?:\/\/(?:www\.)?farcaster\.xyz\/([a-z0-9][a-z0-9_.-]{0,31})/i);
      if (farcasterUrlMatch) {
        const username = farcasterUrlMatch[1].toLowerCase();
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
              returnAllPages: true,
            });
            const identifier = `farcaster_${user.fid}`;
            const pageLabels = result.embeds.length > 1
              ? ["Profile", "Clankers & Zora"]
              : undefined;
            await sendPaginatedTelegramMessage(bot, chatId, result.embeds, identifier, pageLabels);
            return;
          }
        } catch (error) {
          // User not found, continue
        }
      }
    }
    
    // Handle Paragraph URLs
    if (hasParagraphUrl) {
      const paragraphUrlRegex = /https?:\/\/(?:www\.)?paragraph\.(?:com|xyz)\/@([^\/\s\)]+)\/([^\s\)]+)/i;
      if (paragraphUrlRegex.test(text)) {
        try {
          const match = text.match(paragraphUrlRegex);
          if (match) {
            const publicationSlug = match[1];
            const postSlug = match[2];
            
            const { getPostBySlug, getCoinById } = await import("../../../services/paragraph");
            const { logger } = await import("../../../utils/logger");
            
            logger.debug(`[Paragraph] [Telegram] Getting post via API: publicationSlug=${publicationSlug}, postSlug=${postSlug}`, {}, true);
            
            const post = await getPostBySlug(publicationSlug, postSlug, false);
            
            if (!post) {
              logger.warn(`[Paragraph] [Telegram] Post not found for ${publicationSlug}/${postSlug}`);
              return;
            }
            
            if (post.coinId) {
              const coin = await getCoinById(post.coinId);
              if (coin && coin.contractAddress) {
                // Use the info command to process the contract address
                const { handleTelegramInfoCommand } = await import("./infoCommand");
                await handleTelegramInfoCommand(bot, chatId, coin.contractAddress);
                return;
              }
            }
          }
        } catch (error) {
          const { logger } = await import("../../../utils/logger");
          logger.error(`[Telegram] Error handling Paragraph post`, error, {
            text: text.substring(0, 200),
            chatId: chatId.toString(),
          });
        }
      }
    }
    
    // Handle Base URLs
    if (hasBaseUrl) {
      const basePostRegex = /https:\/\/base\.(?:org|app)\/post\/[^\s)]+/i;
      if (basePostRegex.test(text)) {
        try {
          const match = text.match(basePostRegex);
          if (match) {
            const postUrl = match[0];
            const response = await fetch(postUrl, {
              headers: {
                "User-Agent": "telegram-bot/1.0",
                Accept: "text/html,application/xhtml+xml",
              },
            });
            
            if (response.ok) {
              const html = await response.text();
              const BASE_CONTRACT_REGEX = /base(?::mainnet)?:0x[a-fA-F0-9]{40}/i;
              const CONTRACT_JSON_REGEX = /"contractAddress"\s*:\s*"(0x[a-fA-F0-9]{40})"/i;
              const CONTRACT_ESCAPED_REGEX = /contractAddress\\":\\"(0x[a-fA-F0-9]{40})/i;
              const ADDRESS_REGEX = /0x[a-fA-F0-9]{40}/g;
              
              let contractAddress: string | null = null;
              const prefixMatch = BASE_CONTRACT_REGEX.exec(html);
              if (prefixMatch) {
                contractAddress = prefixMatch[0].split(":")[1]?.toLowerCase() || null;
              } else {
                const jsonMatch = CONTRACT_JSON_REGEX.exec(html);
                if (jsonMatch) {
                  contractAddress = jsonMatch[1].toLowerCase();
                } else {
                  const escapedMatch = CONTRACT_ESCAPED_REGEX.exec(html);
                  if (escapedMatch) {
                    contractAddress = escapedMatch[1].toLowerCase();
                  } else {
                    const fallbackMatch = ADDRESS_REGEX.exec(html);
                    if (fallbackMatch) {
                      contractAddress = fallbackMatch[0].toLowerCase();
                    }
                  }
                }
              }
              
              if (contractAddress) {
                // Use the info command to process the contract address
                const { handleTelegramInfoCommand } = await import("./infoCommand");
                await handleTelegramInfoCommand(bot, chatId, contractAddress);
                return;
              }
            }
          }
        } catch (error) {
          console.error("[Telegram] Error handling Base post:", error);
        }
      }
    }
    
    // All address auto-detection code removed - use "info 0x..." or "/search 0x..." instead
    // URL handlers above should handle all URL-based searches
    // No further processing needed - URLs are handled above
  } catch (error) {
    const { logger } = await import("../../../utils/logger");
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorName = error instanceof Error ? error.name : "UnknownError";
    
    // Build detailed error message for webhook
    const errorDetails = [
      `**Error:** ${errorName}`,
      `**Message:** ${errorMessage}`,
      `**Chat ID:** ${chatId}`,
      `**Input:** ${text.substring(0, 200)}`,
    ];
    
    if (errorStack) {
      // Get first few lines of stack trace
      const stackLines = errorStack.split('\n').slice(0, 5).join('\n');
      errorDetails.push(`**Stack:**\n\`\`\`\n${stackLines}\n\`\`\``);
    }
    
    // Log full error details to webhook
    logger.error(
      `[Telegram] Error in processMessage:\n\n${errorDetails.join('\n')}`,
      error,
      {
        chatId: chatId.toString(),
        text: text.substring(0, 200),
        errorMessage,
        errorName,
        errorStack: errorStack?.substring(0, 1000),
      }
    );
    
    console.error(`[Telegram] Error in processMessage:`, error);
    console.error(`[Telegram] Error details:`, {
      name: errorName,
      message: errorMessage,
      stack: errorStack,
      text: text.substring(0, 200),
    });
    
    // Try to send a generic error message to the user
    try {
      await bot.sendMessage(chatId, "❌ An error occurred while processing your request. Please try again.", {
        parse_mode: "HTML",
      });
    } catch (sendError) {
      console.error(`[Telegram] Failed to send error message:`, sendError);
    }
  }
}

/**
 * Extract X/Twitter handles from text
 */
function extractXHandles(content: string): string[] {
  const handles = new Set<string>();
  const xLinkRegex = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>()]+/gi;
  const matches = content.matchAll(xLinkRegex);
  for (const match of matches) {
    const url = match[0];
    const handle = parseHandleFromUrl(url);
    if (handle) {
      handles.add(handle.toLowerCase());
    }
  }
  return Array.from(handles);
}

/**
 * Parse handle from X/Twitter URL
 */
function parseHandleFromUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    let candidate: string | null = null;
    if (segments.length > 0 && segments[0].toLowerCase() !== "i") {
      candidate = segments[0];
    }
    if (!candidate) {
      const screenName = url.searchParams.get("screen_name");
      if (screenName) {
        candidate = screenName;
      }
    }
    if (!candidate) {
      return null;
    }
    const normalized = candidate.replace(/^@/, "").trim();
    if (!normalized || !/^[a-zA-Z0-9_]{1,15}$/.test(normalized)) {
      return null;
    }
    return normalized.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check if user has matching X account
 */
function userHasMatchingXAccount(user: any, handle: string): boolean {
  if (!user?.verified_accounts) {
    return false;
  }
  const normalized = handle.toLowerCase();
  return user.verified_accounts.some((account: any) => {
    if (account.platform !== "x" || !account.username) {
      return false;
    }
    return account.username.replace(/^@/, "").toLowerCase() === normalized;
  });
}
