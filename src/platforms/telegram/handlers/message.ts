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
    
    // Only process if it mentions the bot OR is clearly an address/username/X link/Farcaster link
    const hasXLink = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>()]+/gi.test(text);
    const hasFarcasterLink = /https?:\/\/(?:www\.)?farcaster\.xyz\/[^\s<>()]+/gi.test(text);
    if (!mentionsBot && !isEthAddress(text) && !text.startsWith("@") && !text.includes("zora.co") && !hasXLink && !hasFarcasterLink) {
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
    
    // Extract address first (works for any EVM address format)
    const address = extractFirstAddress(text);
    if (address) {
      // Check if it's an Ethereum address format (for Base token checks)
      const isEthFormat = isEthAddress(address);
        // Check Zora/Clanker FIRST (they have creator info, so we don't need Basescan API)
        // Only use Basescan API for Base tokens that are NOT Zora/Clanker
        
        // IMPORTANT: Check order must match Discord EXACTLY:
        // 1. Zora coins FIRST (check if address IS a Zora coin)
        // 2. Clanker tokens
        // 3. Base tokens
        // 4. Multi-chain tokens (Mantle, BSC, etc.)
        // 5. Farcaster user with wallet (includes Zora profile if associated)
        // 6. Zora profile ONLY as part of wallet lookup, not standalone

        // CRITICAL: Flag to block Zora fallback when any token is found
        let tokenFound = false;
        const normalizedAddress = address.toLowerCase();

        // FIRST: Check if this is a creator coin or any Zora coin - do this before any other processing
        // This matches Discord's exact order
        const reference = extractZoraContractReference(text);
        if (isEthAddress(address) || reference) {
          // Try to fetch the coin directly first
          let coin = await fetchZoraCoin(reference?.address || address, reference?.chainId);
          let summary = await findBestZoraSummary([normalizedAddress]);
          
          // If we got a summary but no coin, try to get the coin from the summary
          if (!coin && summary) {
            // Check if this address matches the creator coin address
            if (summary.profile?.creatorCoinAddress?.toLowerCase() === normalizedAddress) {
              coin = await fetchZoraCoin(summary.profile.creatorCoinAddress);
            }
            // Or check if it's in the createdCoins array
            if (!coin && summary.createdCoins) {
              const matchingCoin = summary.createdCoins.find(c => c.address?.toLowerCase() === normalizedAddress);
              if (matchingCoin) {
                coin = matchingCoin;
              }
            }
            // Or try the latest coin
            if (!coin && summary.latestCoin?.coin?.address?.toLowerCase() === normalizedAddress) {
              coin = summary.latestCoin.coin;
            }
          }
          
          // If we have a coin, show it as a coin card (not a profile) - matching Discord
          if (coin) {
            tokenFound = true;
            // Get the full summary if we don't have it yet
            if (!summary) {
              const { fetchZoraSummary } = await import("../../../services/zora");
              if (coin.creatorProfile?.handle) {
                summary = await fetchZoraSummary(coin.creatorProfile.handle);
              } else if (coin.creatorAddress) {
                summary = await findBestZoraSummary([coin.creatorAddress]);
              }
            }
            
            const { buildZoraCoinResponse } = await import("../../../handlers/zoraAddress");
            const response = await buildZoraCoinResponse(coin, summary, { returnAllPages: true });
            const identifier = `zora_coin_${normalizedAddress}`;
            const pageLabels = response.embeds.length > 1
              ? ["Coin Details", "Creator Coin & Farcaster"]
              : undefined;
            await sendPaginatedTelegramMessage(bot, chatId, response.embeds, identifier, pageLabels);
            return;
          }
        }

        // SECOND: Check for direct Clanker matches (just like Discord does)
        // This must happen BEFORE calling sendClankerTokenPages to match Discord logic
        const { fetchTokensByAddress } = await import("../../../services/clanker");
        const tokens = await fetchTokensByAddress(address).catch(() => []);
        const directClankerMatches = tokens.filter(
          (t) => t.contract_address?.toLowerCase() === normalizedAddress
        );

        if (directClankerMatches.length > 0) {
          tokenFound = true;
          const clankerSent = await sendClankerTokenPages(bot, chatId, address);
          if (clankerSent) {
            return; // Found Clanker token, don't check Base tokens
          }
        }
        
        // NOW check for Base network tokens (only if NOT Zora/Clanker)
        // Only use Basescan API here since we've confirmed it's NOT Zora/Clanker
        const { fetchBaseTokenData, fetchMultiChainTokenData } = await import("../../../services/dexscreener");
        const { detectTokenFactory } = await import("../../../services/baseFactories");
        const { buildBaseTokenEmbed } = await import("../../../utils/baseTokenEmbeds");
        const { buildMultiChainTokenEmbed } = await import("../../../utils/multiChainTokenEmbeds");
        const { embedsToTelegram } = await import("../adapters/telegramAdapter");
        
        // First check if it's a Base token (DexScreener - no rate limits)
        // Only check Base if it's an ETH address format (Base is an EVM chain)
        if (isEthFormat) {
          const [baseTokenData, factory] = await Promise.all([
            fetchBaseTokenData(address),
            detectTokenFactory(address),
          ]);

          if (baseTokenData) {
            tokenFound = true;
            // Fetch creator address and detect factory for Base tokens
            const { getContractCreation } = await import("../../../services/basescan");
            const { getContractCreationTx } = await import("../../../services/contractCreation");
            const { env } = await import("../../../config");
            
            const [contractCreation, creationTx] = await Promise.all([
              getContractCreation(address).catch(() => null),
              getContractCreationTx(address, "base", env.basescanApiKey).catch(() => null),
            ]);

            // Detect TOKEN factory: Get the transaction details to find the token factory address
            // The TOKEN factory is the "to" field in the creation transaction (NOT the pool/DEX factory)
            let detectedFactoryName: string | null = null;
            let detectedFactory: any = null;
            
            if (contractCreation?.txHash) {
              try {
                // Use Base RPC directly to get transaction details (more reliable than deprecated Basescan API)
                const BASE_RPC_URL = "https://mainnet.base.org";
                const rpcResponse = await fetch(BASE_RPC_URL, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "eth_getTransactionByHash",
                    params: [contractCreation.txHash],
                    id: 1,
                  }),
                });
                
                if (rpcResponse.ok) {
                  const rpcData = (await rpcResponse.json()) as { result?: { from?: string; to?: string | null } };
                  if (rpcData.result?.to) {
                    // The "to" field is the TOKEN factory address (Fey, ApeStore, KLIK, etc.)
                    const tokenFactoryAddress = rpcData.result.to.toLowerCase();
                    const { getTokenFactoryName, createTokenFactory } = await import("../../../services/baseFactories");
                    const tokenFactoryName = getTokenFactoryName(tokenFactoryAddress);
                    if (tokenFactoryName) {
                      detectedFactory = createTokenFactory(tokenFactoryAddress);
                      detectedFactoryName = tokenFactoryName;
                    } else {
                      detectedFactoryName = `Factory: ${tokenFactoryAddress.slice(0, 10)}...${tokenFactoryAddress.slice(-8)}`;
                    }
                  }
                }
              } catch (error) {
                console.error(`[Base Token] Failed to get transaction details for factory detection:`, error);
              }
            }

            // Add creator, factory, and creation date to token data
            baseTokenData.creatorAddress = contractCreation?.contractCreator ?? null;
            // Use detected token factory name (not DEX factory)
            baseTokenData.factoryName = detectedFactoryName ?? null;
            baseTokenData.createdAt = contractCreation?.createdAt ?? null;

            const { embed } = await buildBaseTokenEmbed(
              address,
              baseTokenData?.tokenName ?? null, // Token name from DexScreener
              baseTokenData?.tokenSymbol ?? null, // Token symbol from DexScreener
              baseTokenData,
              detectedFactory, // Use detected token factory (not DEX factory)
              contractCreation?.contractCreator ?? null,
              contractCreation?.createdAt ?? null, // Creation timestamp
              contractCreation?.txHash ?? null, // Creation transaction hash
            );

            const factoryDisplayName = factory ? ` (${factory.name})` : "";
            const messages = embedsToTelegram([embed]);
            await bot.sendMessage(chatId, `Base token detected${factoryDisplayName} for <code>${address}</code>.`, {
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

        // CRITICAL: Multi-chain token check MUST ALWAYS RUN (not behind ETH guard)
        // This matches Discord behavior - multi-chain check runs regardless of isEthAddress result
        // DexScreener accepts any EVM address format, so we should check even if isEthAddress() fails
        let multiChainTokenData;
        try {
          multiChainTokenData = await fetchMultiChainTokenData(address);
        } catch (err) {
          console.error(`[Telegram] Multi-chain fetch failed for ${address}:`, err);
          return; // CRITICAL: Stop before Zora fallback if token loader fails
        }
        
        console.log(`[Telegram] Multi-chain token check for ${address}:`, multiChainTokenData ? `Found on ${multiChainTokenData.chainName} (${multiChainTokenData.chainId})` : 'Not found');
        
        if (multiChainTokenData) {
          tokenFound = true;
          // Only show if it's NOT on Base (we already checked Base above)
          const chainIdLower = multiChainTokenData.chainId.toLowerCase();
          if (chainIdLower !== "base" && multiChainTokenData.chainId !== "8453") {
            console.log(`[Telegram] ✅ Showing ${multiChainTokenData.chainName} token for ${address} (chainId: ${multiChainTokenData.chainId})`);
            // Fetch creator address and detect factory for this chain
            const { getContractCreation, getContractCreationTx } = await import("../../../services/contractCreation");
            const { env } = await import("../../../config");
            const [contractCreation, creationTx] = await Promise.all([
              getContractCreation(address, multiChainTokenData.chainId, env.basescanApiKey).catch(() => null),
              getContractCreationTx(address, multiChainTokenData.chainId, env.basescanApiKey).catch(() => null),
            ]);

            // Detect factory: if creationTx.to exists, that's the factory address
            let factoryName: string | null = null;
            if (creationTx?.to) {
              factoryName = `Factory: ${creationTx.to.slice(0, 10)}...${creationTx.to.slice(-8)}`;
            }

            multiChainTokenData.creatorAddress = contractCreation?.contractCreator ?? null;
            multiChainTokenData.factoryName = factoryName;
            multiChainTokenData.createdAt = contractCreation?.createdAt ?? null;

            const { embed } = buildMultiChainTokenEmbed(address, multiChainTokenData);
            const messages = embedsToTelegram([embed]);
            await bot.sendMessage(chatId, `${multiChainTokenData.chainName} token detected for <code>${address}</code>.`, {
              parse_mode: "HTML",
              disable_web_page_preview: true,
            });
            await bot.sendMessage(chatId, messages[0], {
              parse_mode: "HTML",
              disable_web_page_preview: true,
            });
            return; // CRITICAL: Return here to prevent Zora profile check
          } else {
            console.log(`[Telegram] Multi-chain token found but on Base chain (${multiChainTokenData.chainId}), skipping (already checked above)`);
          }
        } else {
          console.log(`[Telegram] No multi-chain token data found for ${address} - will continue to wallet/profile checks`);
        }

        // Try wallet (need to find user first)
        // This matches Discord - fetch zoraSummary early for fallback use
        let user = null;
        let zoraSummaryFromAddress = null;
        try {
          user = await findUserByWallet(address);
        } catch (error) {
          // User not found, continue
        }
        
        // Fetch Zora summary early (like Discord does) for potential fallback
        zoraSummaryFromAddress = await findBestZoraSummary([address.toLowerCase()]);
        
        // If we found a Farcaster user, show wallet profile
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

        // CRITICAL: Block Zora fallback if any token was found
        if (tokenFound) {
          return; // Do not show Zora profile if we found any token
        }

        // Fallback: If no user found but we have a Zora summary, show it (matching Discord)
        // This is the LAST fallback, only after all token checks
        if (zoraSummaryFromAddress) {
          const hasZoraCoinData =
            Boolean(zoraSummaryFromAddress.latestCoin?.coin) ||
            (zoraSummaryFromAddress.createdCoins ?? []).length > 0;

          // Only show Zora profile if there's no coin data (we already checked for coins above)
          if (!hasZoraCoinData) {
            const associated = isSummaryAssociatedWithAddress(zoraSummaryFromAddress, address)
              ? zoraSummaryFromAddress
              : null;

            const zoraResponse = buildZoraWalletProfileResponse({
              wallet: address,
              summary: associated ?? zoraSummaryFromAddress,
              returnAllPages: true,
            });

            // Try to get Farcaster user from Zora handle (matching Discord)
            let farcasterEmbeds = null;
            const farcasterHandle = zoraSummaryFromAddress.profile.farcasterHandle;
            if (farcasterHandle) {
              try {
                const farcasterUser = await findUserByUsername(farcasterHandle.replace(/^@/, ""));
                if (farcasterUser) {
                  farcasterEmbeds = await buildFarcasterPresentation(farcasterUser, {
                    zoraSummary: associated,
                    returnAllPages: true,
                  });
                }
              } catch (error) {
                console.warn("Failed to fetch Farcaster profile for Zora summary:", error);
              }
            }

            const identifier = `zora_wallet_${address.toLowerCase()}`;
            const embedsToSend = farcasterEmbeds
              ? [...farcasterEmbeds.embeds, ...zoraResponse.embeds]
              : zoraResponse.embeds;
            await sendPaginatedTelegramMessage(bot, chatId, embedsToSend, identifier);
            return;
          }
        }
      }
    }

    // Check for Farcaster profile URLs (https://farcaster.xyz/username)
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

        // IMPORTANT: Match Discord order exactly for /far command too:
        // 1. Zora coins FIRST
        // 2. Clanker tokens
        // 3. Base tokens
        // 4. Multi-chain tokens
        // 5. Farcaster user with wallet
        // 6. Zora profile fallback

        // CRITICAL: Flag to block Zora fallback when any token is found
        let tokenFound = false;
        const normalizedAddress = address.toLowerCase();

        // FIRST: Check if this is a Zora coin
        const reference = extractZoraContractReference(text);
        if (isEthAddress(address) || reference) {
          let coin = await fetchZoraCoin(reference?.address || address, reference?.chainId);
          let summary = await findBestZoraSummary([normalizedAddress]);
          
          if (!coin && summary) {
            if (summary.profile?.creatorCoinAddress?.toLowerCase() === normalizedAddress) {
              coin = await fetchZoraCoin(summary.profile.creatorCoinAddress);
            }
            if (!coin && summary.createdCoins) {
              const matchingCoin = summary.createdCoins.find(c => c.address?.toLowerCase() === normalizedAddress);
              if (matchingCoin) {
                coin = matchingCoin;
              }
            }
            if (!coin && summary.latestCoin?.coin?.address?.toLowerCase() === normalizedAddress) {
              coin = summary.latestCoin.coin;
            }
          }
          
          if (coin) {
            tokenFound = true;
            if (!summary) {
              const { fetchZoraSummary } = await import("../../../services/zora");
              if (coin.creatorProfile?.handle) {
                summary = await fetchZoraSummary(coin.creatorProfile.handle);
              } else if (coin.creatorAddress) {
                summary = await findBestZoraSummary([coin.creatorAddress]);
              }
            }
            
            const { buildZoraCoinResponse } = await import("../../../handlers/zoraAddress");
            const response = await buildZoraCoinResponse(coin, summary, { returnAllPages: true });
            const identifier = `zora_coin_${normalizedAddress}`;
            const pageLabels = response.embeds.length > 1
              ? ["Coin Details", "Creator Coin & Farcaster"]
              : undefined;
            await sendPaginatedTelegramMessage(bot, chatId, response.embeds, identifier, pageLabels);
            return;
          }
        }

        // SECOND: Check for direct Clanker matches (just like Discord does)
        // This must happen BEFORE calling sendClankerTokenPages to match Discord logic
        const { fetchTokensByAddress } = await import("../../../services/clanker");
        const tokens = await fetchTokensByAddress(address).catch(() => []);
        const directClankerMatches = tokens.filter(
          (t) => t.contract_address?.toLowerCase() === normalizedAddress
        );

        if (directClankerMatches.length > 0) {
          tokenFound = true;
          const { sendClankerTokenPages } = await import("./clankerHandler");
          const clankerSent = await sendClankerTokenPages(bot, chatId, address);
          if (clankerSent) {
            return;
          }
        }

        // THIRD: Check for Base network tokens (only if NOT Zora/Clanker to save Basescan API calls)
        if (isEthAddress(address)) {
          const { fetchBaseTokenData, fetchMultiChainTokenData } = await import("../../../services/dexscreener");
          const { detectTokenFactory } = await import("../../../services/baseFactories");
          const { buildBaseTokenEmbed } = await import("../../../utils/baseTokenEmbeds");
          const { buildMultiChainTokenEmbed } = await import("../../../utils/multiChainTokenEmbeds");
          const { embedsToTelegram } = await import("../adapters/telegramAdapter");
          
          // First check if it's a Base token (DexScreener - no rate limits)
          const [baseTokenData, factory] = await Promise.all([
            fetchBaseTokenData(address),
            detectTokenFactory(address),
          ]);

          if (baseTokenData) {
            tokenFound = true;
            // Only fetch creator from Basescan if it's a Base token that's NOT Zora/Clanker
            // This saves API calls since Zora/Clanker already have creator info
            const { getContractCreation } = await import("../../../services/basescan");
            const contractCreation = await getContractCreation(address).catch(() => null);

            // Detect TOKEN factory from creation transaction
            let detectedFactoryName: string | null = null;
            let detectedFactory: any = null;
            
            if (contractCreation?.txHash) {
              try {
                const BASE_RPC_URL = "https://mainnet.base.org";
                const rpcResponse = await fetch(BASE_RPC_URL, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "eth_getTransactionByHash",
                    params: [contractCreation.txHash],
                    id: 1,
                  }),
                });
                
                if (rpcResponse.ok) {
                  const rpcData = (await rpcResponse.json()) as { result?: { from?: string; to?: string | null } };
                  if (rpcData.result?.to) {
                    const tokenFactoryAddress = rpcData.result.to.toLowerCase();
                    const { getTokenFactoryName, createTokenFactory } = await import("../../../services/baseFactories");
                    const tokenFactoryName = getTokenFactoryName(tokenFactoryAddress);
                    if (tokenFactoryName) {
                      detectedFactory = createTokenFactory(tokenFactoryAddress);
                      detectedFactoryName = tokenFactoryName;
                    } else {
                      detectedFactoryName = `Factory: ${tokenFactoryAddress.slice(0, 10)}...${tokenFactoryAddress.slice(-8)}`;
                    }
                  }
                }
              } catch (error) {
                console.error(`[Base Token] Failed to get transaction details for factory detection:`, error);
              }
            }

            const { embed } = await buildBaseTokenEmbed(
              address,
              baseTokenData?.tokenName ?? null, // Token name
              baseTokenData?.tokenSymbol ?? null, // Token symbol
              baseTokenData,
              detectedFactory, // Use detected token factory (not DEX factory)
              contractCreation?.contractCreator ?? null,
              contractCreation?.createdAt ?? null, // Creation timestamp
              contractCreation?.txHash ?? null, // Creation transaction hash
            );

            const factoryName = detectedFactory ? ` (${detectedFactory.name})` : "";
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

          // Check for tokens on OTHER EVM chains (BSC, Ethereum, Polygon, Mantle, etc.)
          // BEFORE treating it as a wallet to avoid showing wrong information
          // CRITICAL: Do NOT swallow errors - if fetch fails, return early to prevent Zora fallback
          let multiChainTokenData;
          try {
            multiChainTokenData = await fetchMultiChainTokenData(address);
          } catch (err) {
            console.error(`[Telegram /far] Multi-chain fetch failed for ${address}:`, err);
            return; // CRITICAL: Stop before Zora fallback if token loader fails
          }
          
          console.log(`[Telegram /far] Multi-chain token check for ${address}:`, multiChainTokenData ? `Found on ${multiChainTokenData.chainName} (${multiChainTokenData.chainId})` : 'Not found');
          
          if (multiChainTokenData) {
            tokenFound = true;
            // Only show if it's NOT on Base (we already checked Base above)
            const chainIdLower = multiChainTokenData.chainId.toLowerCase();
            if (chainIdLower !== "base" && multiChainTokenData.chainId !== "8453") {
              console.log(`[Telegram /far] ✅ Showing ${multiChainTokenData.chainName} token for ${address} (chainId: ${multiChainTokenData.chainId})`);
              // Fetch creator address and detect factory for this chain
              const { getContractCreation, getContractCreationTx } = await import("../../../services/contractCreation");
              const { env } = await import("../../../config");
              const [contractCreation, creationTx] = await Promise.all([
                getContractCreation(address, multiChainTokenData.chainId, env.basescanApiKey).catch(() => null),
                getContractCreationTx(address, multiChainTokenData.chainId, env.basescanApiKey).catch(() => null),
              ]);

              // Detect factory: if creationTx.to exists, that's the factory address
              let factoryName: string | null = null;
              if (creationTx?.to) {
                factoryName = `Factory: ${creationTx.to.slice(0, 10)}...${creationTx.to.slice(-8)}`;
              }

              multiChainTokenData.creatorAddress = contractCreation?.contractCreator ?? null;
              multiChainTokenData.factoryName = factoryName;
              multiChainTokenData.createdAt = contractCreation?.createdAt ?? null;

              const { embed } = buildMultiChainTokenEmbed(address, multiChainTokenData);
              const messages = embedsToTelegram([embed]);
              await bot.sendMessage(chatId, `${multiChainTokenData.chainName} token detected for <code>${address}</code>.`, {
                parse_mode: "HTML",
                disable_web_page_preview: true,
              });
              await bot.sendMessage(chatId, messages[0], {
                parse_mode: "HTML",
                disable_web_page_preview: true,
              });
              return; // CRITICAL: Return here to prevent Zora profile check
            } else {
              console.log(`[Telegram /far] Multi-chain token found but on Base chain (${multiChainTokenData.chainId}), skipping (already checked above)`);
            }
          } else {
            console.log(`[Telegram /far] No multi-chain token data found for ${address} - will continue to wallet/profile checks`);
          }
        }

        // FOURTH: Try Farcaster user by wallet (after all token checks)
        let user;
        try {
          user = await findUserByWallet(address);
        } catch (error) {
          // Continue with other lookups
        }

        // Fetch Zora summary for potential fallback
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

        // CRITICAL: Block Zora fallback if any token was found
        if (tokenFound) {
          return; // Do not show Zora profile if we found any token
        }

        // FIFTH: Fallback - Try Zora profile (only if no coin data, matching Discord)
        if (zoraSummaryFromAddress) {
          const hasZoraCoinData =
            Boolean(zoraSummaryFromAddress.latestCoin?.coin) ||
            (zoraSummaryFromAddress.createdCoins ?? []).length > 0;

          if (!hasZoraCoinData) {
            // Show Zora wallet profile (we already checked for coins above, so this is just a profile)
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

        // Use Neynar API to search X account directly - it searches against Farcaster profiles
        const byXHandle = await findUserByXHandle(handle);
        
        // If the experimental endpoint works, use it directly
        // Only fallback to username lookup if the endpoint fails (402 Payment Required)
        let byUsername = null;
        if (!byXHandle) {
          // Fallback: try username lookup and check if it has matching X account
          // This is only needed if the experimental endpoint requires Enterprise tier
          try {
            byUsername = await findUserByUsername(handle);
            // Only use if it has matching X account
            if (byUsername && !userHasMatchingXAccount(byUsername, handle)) {
              byUsername = null;
            }
          } catch (error) {
            // User not found, continue
          }
        }

        // Trust the X handle lookup result (it searches X accounts directly)
        // Only use username fallback if X handle lookup failed
        const farcasterUser = byXHandle ?? byUsername;
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
