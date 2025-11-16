import TelegramBot from "node-telegram-bot-api";
import { isEthAddress, isSolAddress, extractFirstAddress, extractZoraContractReference } from "../../../utils/address";
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
    
    // Only process if it mentions the bot OR is clearly an address/username/X link
    const hasXLink = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>()]+/gi.test(text);
    if (!mentionsBot && !isEthAddress(text) && !text.startsWith("@") && !text.includes("zora.co") && !hasXLink) {
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
    // Send typing indicator for any search operation
    await bot.sendChatAction(chatId, "typing");
    
    // Check if it's an Ethereum address
    if (isEthAddress(text)) {
      const address = extractFirstAddress(text);
      if (address) {
        // Check for Base network tokens FIRST (like Discord does)
        const { fetchBaseTokenData } = await import("../../../services/dexscreener");
        const { detectTokenFactory } = await import("../../../services/baseFactories");
        const { buildBaseTokenEmbed } = await import("../../../utils/baseTokenEmbeds");
        const { embedsToTelegram } = await import("../adapters/telegramAdapter");
        const { getContractCreation } = await import("../../../services/basescan");
        
        const [baseTokenData, factory, contractCreation] = await Promise.all([
          fetchBaseTokenData(address),
          detectTokenFactory(address),
          getContractCreation(address).catch(() => null),
        ]);

        if (baseTokenData) {
          const { embed } = await buildBaseTokenEmbed(
            address,
            null, // Token name
            null, // Token symbol
            baseTokenData,
            factory,
            contractCreation?.contractCreator ?? null,
          );

          const factoryName = factory ? ` (${factory.name})` : "";
          const messages = embedsToTelegram([embed]);
          await bot.sendMessage(chatId, `Base token detected${factoryName} for <code>${address}</code>.`, {
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });
          await bot.sendMessage(chatId, messages[0], {
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });
          return;
        }

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
            const identifier = `zora_coin_${address.toLowerCase()}`;
            const pageLabels = response.embeds.length > 1
              ? ["Coin Details", "Creator Coin & Farcaster"]
              : undefined;
            await sendPaginatedTelegramMessage(bot, chatId, response.embeds, identifier, pageLabels);
            return;
          }
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

    // Check for keyword searches: "cast <keyword>", "far <query>", "zora <query>"
    const castMatch = text.match(/(?:^|\s)cast\s+([^\s]+)/i);
    if (castMatch) {
      const keyword = castMatch[1].trim();
      if (keyword && keyword.length >= 2) {
        const { searchCastsByKeyword } = await import("../../../services/neynar");
        try {
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
            return;
          } else {
            await bot.sendMessage(chatId, `No casts found matching \`${keyword}\`.`);
            return;
          }
        } catch (error) {
          console.error("Error searching casts:", error);
        }
      }
    }

    const farMatch = text.match(/(?:^|\s)far\s+(.+)/i);
    if (farMatch) {
      const query = farMatch[1].trim();
      if (query) {
        // Try as wallet address first
        if (isEthAddress(query) || isSolAddress(query)) {
          try {
            const user = await findUserByWallet(query);
            if (user) {
              const [tokens, latestCast, zoraSummary] = await Promise.all([
                safeFetchTokensByFid(user.fid),
                safeFetchMostRecentCast(user.fid),
                findBestZoraSummary(collectZoraIdentifiers(user)),
              ]);
              const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;

              const walletResponse = await buildWalletProfileResponse({
                wallet: query,
                user,
                zoraSummary: associatedSummary,
                clankerTokens: tokens,
                latestCast,
                returnAllPages: true,
              });

              const identifier = `wallet_${query.toLowerCase()}`;
              const pageLabels = walletResponse.embeds.length > 1
                ? ["Profile", "Clankers & Zora"]
                : undefined;
              await sendPaginatedTelegramMessage(bot, chatId, walletResponse.embeds, identifier, pageLabels);
              return;
            }
          } catch (error) {
            // Continue to username lookup
          }
        }

        // Try as Farcaster username
        try {
          const normalizedUsername = query.replace(/^@/, "").toLowerCase();
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
              returnAllPages: true,
            });
            const identifier = `farcaster_username_${normalizedUsername}`;
            const pageLabels = result.embeds.length > 1
              ? ["Profile", "Clankers & Zora"]
              : undefined;
            await sendPaginatedTelegramMessage(bot, chatId, result.embeds, identifier, pageLabels);
            return;
          }
        } catch (error) {
          // User not found
        }

        await bot.sendMessage(chatId, `No Farcaster profile found for \`${query}\`.`);
        return;
      }
    }

    const zoraMatch = text.match(/(?:^|\s)zora\s+(.+)/i);
    if (zoraMatch) {
      const query = zoraMatch[1].trim();
      if (query) {
        // Try as wallet address first
        if (isEthAddress(query)) {
          const zoraSummary = await findBestZoraSummary([query.toLowerCase()]);
          if (zoraSummary) {
            const associated = isSummaryAssociatedWithAddress(zoraSummary, query)
              ? zoraSummary
              : null;
            
            const zoraResponse = buildZoraWalletProfileResponse({
              wallet: query,
              summary: associated ?? zoraSummary,
              returnAllPages: true,
            });

            const identifier = `zora_wallet_${query.toLowerCase()}`;
            await sendPaginatedTelegramMessage(bot, chatId, zoraResponse.embeds, identifier);
            return;
          }
        }

        // Try as contract address
        if (isEthAddress(query)) {
          try {
            const coin = await fetchZoraCoin(query);
            if (coin) {
              const zoraSummary = await findBestZoraSummary([query.toLowerCase()]);
              const response = await buildZoraCoinResponse(coin, zoraSummary, { returnAllPages: true });
              const identifier = `zora_coin_${query.toLowerCase()}`;
              const pageLabels = response.embeds.length > 1
                ? ["Coin Details", "Creator Coin & Farcaster"]
                : undefined;
              await sendPaginatedTelegramMessage(bot, chatId, response.embeds, identifier, pageLabels);
              return;
            }
          } catch (error) {
            // Continue to profile lookup
          }
        }

        // Try as Zora profile
        const normalizedQuery = query.replace(/^@/, "").toLowerCase();
        const zoraSummary = await findBestZoraSummary([
          normalizedQuery,
          `@${normalizedQuery}`,
          `${normalizedQuery}.eth`,
          `${normalizedQuery}.xyz`,
        ]);
        
        if (zoraSummary) {
          const embed = buildZoraProfileEmbed(zoraSummary);
          await appendZoraSummaryFields(embed, zoraSummary);
          const embeds = splitEmbedIntoPages(embed, 15);
          const identifier = `zora_search_${normalizedQuery}`;
          await sendPaginatedTelegramMessage(bot, chatId, embeds, identifier);
          return;
        }

        await bot.sendMessage(chatId, `No Zora profile or contract found for \`${query}\`.`);
        return;
      }
    }

    const walletMatch = text.match(/(?:^|\s)wallet\s+(.+)/i);
    if (walletMatch) {
      const query = walletMatch[1].trim();
      if (query) {
        // Must be a valid wallet address
        if (!isEthAddress(query) && !isSolAddress(query)) {
          await bot.sendMessage(chatId, `\`${query}\` is not a valid wallet address. Please provide an Ethereum (0x...) or Solana address.`);
          return;
        }

        const address = query;

        // Try Farcaster user by wallet first
        let user;
        try {
          user = await findUserByWallet(address);
        } catch (error) {
          // Continue with other lookups
        }

        // Try Zora summary
        const zoraSummaryFromAddress = await findBestZoraSummary([address.toLowerCase()]);

        // If we have a Farcaster user, show wallet profile with Farcaster info
        if (user) {
          const zoraIdentifiers = collectZoraIdentifiers(user, address);
          const [tokens, latestCast, zoraSummaryForUser] = await Promise.all([
            safeFetchTokensByFid(user.fid),
            safeFetchMostRecentCast(user.fid),
            findBestZoraSummary(zoraIdentifiers),
          ]);

          const associatedSummary =
            zoraSummaryForUser && isSummaryAssociatedWithUser(user, zoraSummaryForUser)
              ? zoraSummaryForUser
              : zoraSummaryFromAddress;

          const walletResponse = await buildWalletProfileResponse({
            wallet: address,
            user,
            zoraSummary: associatedSummary,
            clankerTokens: tokens,
            latestCast,
            returnAllPages: true,
          });

          const identifier = `wallet_${address.toLowerCase()}`;
          const pageLabels = walletResponse.embeds.length > 1
            ? ["Profile", "Clankers & Zora"]
            : undefined;
          await sendPaginatedTelegramMessage(bot, chatId, walletResponse.embeds, identifier, pageLabels);
          return;
        }

        // Check for Base network tokens FIRST (like Discord does)
        if (isEthAddress(address)) {
          const { fetchBaseTokenData } = await import("../../../services/dexscreener");
          const { detectTokenFactory } = await import("../../../services/baseFactories");
          const { buildBaseTokenEmbed } = await import("../../../utils/baseTokenEmbeds");
          const { embedsToTelegram } = await import("../adapters/telegramAdapter");
          
          const { getContractCreation } = await import("../../../services/basescan");
          
          const [baseTokenData, factory, contractCreation] = await Promise.all([
            fetchBaseTokenData(address),
            detectTokenFactory(address),
            getContractCreation(address).catch(() => null),
          ]);

          if (baseTokenData) {
            const { embed } = await buildBaseTokenEmbed(
              address,
              null, // Token name
              null, // Token symbol
              baseTokenData,
              factory,
              contractCreation?.contractCreator ?? null,
            );

            const factoryName = factory ? ` (${factory.name})` : "";
            const messages = embedsToTelegram([embed]);
            await bot.sendMessage(chatId, `Base token detected${factoryName} for <code>${address}</code>.`, {
              parse_mode: "HTML",
              disable_web_page_preview: true,
            });
            await bot.sendMessage(chatId, messages[0], {
              parse_mode: "HTML",
              disable_web_page_preview: true,
            });
            return;
          }
        }

        // Try Clanker tokens
        const { fetchTokensByAddress } = await import("../../../services/clanker");
        const clankerTokens = await fetchTokensByAddress(address);
        if (clankerTokens.length > 0) {
          const { sendClankerTokenPages } = await import("./clankerHandler");
          const clankerSent = await sendClankerTokenPages(bot, chatId, address);
          if (clankerSent) {
            return;
          }
        }

        // Try Zora coin
        if (zoraSummaryFromAddress) {
          const lowerAddress = address.toLowerCase();
          let matchedCoin =
            zoraSummaryFromAddress.latestCoin?.coin.address?.toLowerCase() === lowerAddress
              ? zoraSummaryFromAddress.latestCoin.coin
              : null;

          if (
            !matchedCoin &&
            zoraSummaryFromAddress.profile.creatorCoinAddress?.toLowerCase() === lowerAddress
          ) {
            matchedCoin =
              zoraSummaryFromAddress.createdCoins?.find(
                (coin) => coin.address?.toLowerCase() === lowerAddress,
              ) ?? null;
          }

          if (!matchedCoin) {
            try {
              matchedCoin = await fetchZoraCoin(address);
            } catch (error) {
              // Continue to wallet profile
            }
          }

          if (matchedCoin) {
            const response = await buildZoraCoinResponse(matchedCoin, zoraSummaryFromAddress, { returnAllPages: true });
            const identifier = `zora_coin_${address.toLowerCase()}`;
            const pageLabels = response.embeds.length > 1
              ? ["Coin Details", "Creator Coin & Farcaster"]
              : undefined;
            await sendPaginatedTelegramMessage(bot, chatId, response.embeds, identifier, pageLabels);
            return;
          }

          // Show Zora wallet profile
          const associated = isSummaryAssociatedWithAddress(zoraSummaryFromAddress, address)
            ? zoraSummaryFromAddress
            : null;

          const zoraResponse = buildZoraWalletProfileResponse({
            wallet: address,
            summary: associated ?? zoraSummaryFromAddress,
            returnAllPages: true,
          });

          const identifier = `zora_wallet_${address.toLowerCase()}`;
          await sendPaginatedTelegramMessage(bot, chatId, zoraResponse.embeds, identifier);
          return;
        }

        // No results
        await bot.sendMessage(chatId, `No Farcaster profile, Clanker deployments, or Zora profile found for wallet \`${address}\`.`);
        return;
      }
    }

    // Check if it's an X/Twitter account link
    const xLinkRegex = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>()]+/gi;
    if (xLinkRegex.test(text)) {
      const handles = extractXHandles(text);
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

    // Check if it's a Zora profile URL or handle
    if (text.includes("zora.co") || text.startsWith("zora/")) {
      const reference = extractZoraContractReference(text);
      if (reference) {
        const coin = await fetchZoraCoin(reference.address, reference.chainId);
        if (coin) {
          const zoraSummary = await findBestZoraSummary([reference.address.toLowerCase()]);
          const response = await buildZoraCoinResponse(coin, zoraSummary, { returnAllPages: true }); // Get all pages for Telegram
          const identifier = `zora_coin_${reference.address.toLowerCase()}`;
          const pageLabels = response.embeds.length > 1
            ? ["Coin Details", "Creator Coin & Farcaster"]
            : undefined;
          await sendPaginatedTelegramMessage(bot, chatId, response.embeds, identifier, pageLabels);
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
        const identifier = `zora_profile_${text}`;
        await sendPaginatedTelegramMessage(bot, chatId, embeds, identifier);
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
