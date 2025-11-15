import TelegramBot from "node-telegram-bot-api";
import { isEthAddress, isSolAddress } from "../../../utils/address";
import { findBestZoraSummary } from "../../../services/zora";
import { fetchTokensByQuery, fetchTokensByAddress } from "../../../services/clanker";
import { findUserByUsername, findUserByWallet } from "../../../services/neynar";
import { buildZoraProfileEmbed, appendZoraSummaryFields } from "../../../utils/zoraEmbeds";
import { buildZoraWalletProfileResponse } from "../../../utils/walletEmbed";
import { isSummaryAssociatedWithAddress, isSummaryAssociatedWithUser } from "../../../utils/zoraAssociation";
import { sendClankerTokenPages } from "./clankerHandler";
import { buildFarcasterPresentation } from "../../../utils/farcasterPresentation";
import { buildWalletProfileResponse } from "../../../utils/walletEmbed";
import { sendPaginatedTelegramMessage } from "../utils/sendPaginated";
import { extractFirstAddress, extractZoraContractReference } from "../../../utils/address";
import { collectZoraIdentifiers } from "../../../utils/zoraPresentation";
import { safeFetchTokensByFid, safeFetchMostRecentCast } from "../../../utils/farcasterHelpers";
import { buildZoraCoinResponse } from "../../../handlers/zoraAddress";
import { fetchZoraCoin } from "../../../services/zora";
import { findUserByXHandle } from "../../../services/neynar";

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
          await bot.sendMessage(chatId, "Please provide a search query.\n\nUsage: `/search <query>`\nExample: `/search 0x1234...` or `/search @username`", { parse_mode: "Markdown" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
        await handleSearchQuery(bot, chatId, query);
        break;
      }

      case "zora": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a Zora query.\n\nUsage: `/zora <query>`\nExample: `/zora @username` or `/zora 0x1234...`", { parse_mode: "Markdown" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
        await handleZoraQuery(bot, chatId, query);
        break;
      }

      case "clanker": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a Clanker query.\n\nUsage: `/clanker <query>`\nExample: `/clanker tokenname` or `/clanker 0x1234...`", { parse_mode: "Markdown" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
        await handleClankerQuery(bot, chatId, query);
        break;
      }

      case "casts": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a keyword to search for casts.\n\nUsage: `/casts <keyword>`\nExample: `/casts base`", { parse_mode: "Markdown" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
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
        // Try Clanker (build all pages)
        const clankerSent = await sendClankerTokenPages(bot, chatId, address);
        if (clankerSent) {
          return;
        }

        // Try Zora profile lookup (Zora-only wallet, no Farcaster user)
        const zoraSummary = await findBestZoraSummary([address.toLowerCase()]);
        if (zoraSummary) {
          // Use buildZoraWalletProfileResponse for wallet lookups (same as Discord)
          const associated = isSummaryAssociatedWithAddress(zoraSummary, address)
            ? zoraSummary
            : null;
          
          const zoraResponse = buildZoraWalletProfileResponse({
            wallet: address,
            summary: associated ?? zoraSummary,
            returnAllPages: true, // Get all pages for Telegram
          });
          
          const identifier = `zora_wallet_${address.toLowerCase()}`;
          await sendPaginatedTelegramMessage(bot, chatId, zoraResponse.embeds, identifier);
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
              const identifier = `wallet_${address.toLowerCase()}`;
              const pageLabels = walletResponse.embeds.length > 1 
                ? ["Profile", "Clankers & Zora"] 
                : undefined;
              await sendPaginatedTelegramMessage(bot, chatId, walletResponse.embeds, identifier, pageLabels);
              return;
            }
          }
        } catch (error) {
          // User not found, continue
        }
      }
    }

    // Try X/Twitter account link
    const xLinkRegex = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>()]+/gi;
    if (xLinkRegex.test(query)) {
      const handles = extractXHandles(query);
      for (const handle of handles) {
        if (!handle) continue;

        const byXHandle = await findUserByXHandle(handle);
        let byUsername = null;
        if (!byXHandle) {
          try {
            byUsername = await findUserByUsername(handle);
          } catch (error) {
            // User not found, continue
          }
        }

        // If findUserByXHandle returned a user, trust it (the endpoint specifically looks up by X handle)
        // Otherwise, check if the username lookup found a user with matching X account
        const farcasterUser = byXHandle ?? (byUsername && userHasMatchingXAccount(byUsername, handle) ? byUsername : null);
        if (farcasterUser) {
          const [tokens, latestCast, zoraSummary] = await Promise.all([
            safeFetchTokensByFid(farcasterUser.fid),
            safeFetchMostRecentCast(farcasterUser.fid),
            findBestZoraSummary(collectZoraIdentifiers(farcasterUser)),
          ]);
          const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(farcasterUser, zoraSummary) ? zoraSummary : null;

          const result = await buildFarcasterPresentation(farcasterUser, {
            tokens,
            zoraSummary: associatedSummary,
            latestCast,
            returnAllPages: true, // Get all pages for Telegram
          });
          const identifier = `farcaster_x_${handle}`;
          const pageLabels = result.embeds.length > 1
            ? ["Profile", "Clankers & Zora"]
            : undefined;
          await sendPaginatedTelegramMessage(bot, chatId, result.embeds, identifier, pageLabels);
          return;
        }

        // If no Farcaster profile found
        await bot.sendMessage(chatId, `No Farcaster profile linked to X handle @${handle}.`);
        return;
      }
    }

    // Try Farcaster username
    const normalizedUsername = query.replace(/^@/, "").toLowerCase();
    try {
      const user = await findUserByUsername(normalizedUsername);
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

    // Try Farcaster username lookup first
    try {
      const user = await findUserByUsername(normalizedUsername);
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
        const identifier = `farcaster_username_${normalizedUsername}`;
        const pageLabels = result.embeds.length > 1
          ? ["Profile", "Clankers & Zora"]
          : undefined;
        await sendPaginatedTelegramMessage(bot, chatId, result.embeds, identifier, pageLabels);
        return;
      }
    } catch (error) {
      // User not found, continue to Zora lookup
    }

    // Fallback to Zora profile if Farcaster not found
    const zoraSummary = await findBestZoraSummary([normalizedUsername, `@${normalizedUsername}`, `${normalizedUsername}.eth`]);
    if (zoraSummary) {
      const embed = buildZoraProfileEmbed(zoraSummary);
      await appendZoraSummaryFields(embed, zoraSummary);
      // Split into pages if needed (same as Discord)
      const { splitEmbedIntoPages } = await import("../../../utils/pagination");
      const embeds = splitEmbedIntoPages(embed, 15);
      const identifier = `zora_profile_${normalizedUsername}`;
      await sendPaginatedTelegramMessage(bot, chatId, embeds, identifier);
      return;
    }

    await bot.sendMessage(chatId, `No results found for: ${query}`);
  } catch (error) {
    console.error("Error in handleSearchQuery:", error);
    await bot.sendMessage(chatId, "An error occurred while searching. Please try again.");
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

async function handleZoraQuery(bot: TelegramBot, chatId: number, query: string): Promise<void> {
  try {
    // Try as Zora contract reference first
    const reference = extractZoraContractReference(query);
    if (reference) {
      const coin = await fetchZoraCoin(reference.address, reference.chainId);
      if (coin) {
        const summary = await findBestZoraSummary([reference.address.toLowerCase()]);
        const response = await buildZoraCoinResponse(coin, summary, { returnAllPages: true }); // Get all pages for Telegram
        const identifier = `zora_coin_${reference.address.toLowerCase()}`;
        const pageLabels = response.embeds.length > 1
          ? ["Coin Details", "Creator Coin & Farcaster"]
          : undefined;
        await sendPaginatedTelegramMessage(bot, chatId, response.embeds, identifier, pageLabels);
        return;
      }
    }

    // Try as profile lookup
    const normalizedQuery = query.replace(/^@/, "").toLowerCase();
    const zoraSummary = await findBestZoraSummary([normalizedQuery, `@${normalizedQuery}`, `${normalizedQuery}.eth`]);
    if (zoraSummary) {
      const embed = buildZoraProfileEmbed(zoraSummary);
      await appendZoraSummaryFields(embed, zoraSummary);
      // Split into pages if needed (same as Discord)
      const { splitEmbedIntoPages } = await import("../../../utils/pagination");
      const embeds = splitEmbedIntoPages(embed, 15);
      const identifier = `zora_profile_${normalizedQuery}`;
      await sendPaginatedTelegramMessage(bot, chatId, embeds, identifier);
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
        const sent = await sendClankerTokenPages(bot, chatId, address);
        if (sent) {
          return;
        }
      }
    }

    // Try as token name/symbol search
    const tokens = await fetchTokensByQuery(query);
    if (tokens && tokens.length > 0) {
      const address = tokens[0].contract_address;
      if (address) {
        const sent = await sendClankerTokenPages(bot, chatId, address);
        if (sent) {
          return;
        }
      }
    }

    await bot.sendMessage(chatId, `No Clanker results found for: ${query}`);
  } catch (error) {
    console.error("Error in handleClankerQuery:", error);
    await bot.sendMessage(chatId, "An error occurred while searching Clanker. Please try again.");
  }
}

async function handleCastsQuery(bot: TelegramBot, chatId: number, keyword: string): Promise<void> {
  try {
    const { searchCastsByKeyword } = await import("../../../services/neynar");
    const { firstMatch, recent } = await searchCastsByKeyword(keyword, 2);
    
    const castsToShow = [];
    if (firstMatch) castsToShow.push(firstMatch);
    castsToShow.push(...recent.slice(0, 2));
    
    if (castsToShow.length > 0) {
      const { buildCastEmbed } = await import("../../../handlers/castLink");
      const { buildCastUrl } = await import("../../../utils/farcasterLinks");
      const embeds = castsToShow.map((cast: any, index: number) => {
        if (index === 0 && firstMatch && cast.hash === firstMatch.hash) {
          return buildCastEmbed(cast, buildCastUrl(cast.author.username, cast.hash), {
            title: `🔹 Earliest cast mentioning "${keyword}"`,
            color: 0xfbbf24,
            variant: "full",
          });
        }
        const recentIndex = index - (firstMatch ? 1 : 0);
        return buildCastEmbed(cast, buildCastUrl(cast.author.username, cast.hash), {
          title: `Recent cast #${recentIndex + 1} mentioning "${keyword}"`,
          color: 0x4338ca,
          footer: `Matched keyword: ${keyword}`,
          variant: "compact",
        });
      });
      const identifier = `cast_search_${keyword}`;
      await sendPaginatedTelegramMessage(bot, chatId, embeds, identifier);
    } else {
      await bot.sendMessage(chatId, `No casts found matching \`${keyword}\`.`);
    }
  } catch (error) {
    console.error("Error in handleCastsQuery:", error);
    await bot.sendMessage(chatId, "An error occurred while searching casts. Please try again.");
  }
}
