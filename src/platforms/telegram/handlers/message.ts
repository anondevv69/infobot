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
    
    // Only process if it mentions the bot OR is clearly an address/URL
    const hasFarcasterLink = /https?:\/\/(?:www\.)?farcaster\.xyz\/[^\s<>()]+/gi.test(text);
    const hasParagraphLink = /https?:\/\/(?:www\.)?paragraph\.(?:com|xyz)\/[^\s<>()]+/gi.test(text);
    if (!mentionsBot && !isEthAddress(text) && !text.includes("zora.co") && !text.includes("clanker.world") && !hasFarcasterLink && !hasParagraphLink) {
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
    let tokenFound = false; // Track if we found a token
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
        // Check for Paragraph coin first (tokenized posts)
        const { getCoinByContract } = await import("../../../services/paragraph");
        const paragraphCoin = await getCoinByContract(address).catch(() => null);
        
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

          // Re-fetch Paragraph coin if we didn't get it earlier
          const finalParagraphCoin = paragraphCoin ?? await getCoinByContract(address).catch(() => null);
          
          // If we have a Paragraph coin, get post details and author to construct proper URL
          let paragraphPostAuthor: { name?: string | null; bio?: string | null; farcaster?: { username: string } | null; publicationId?: string | null } | null = null;
          let paragraphPostUrl: string | null = null;
          if (finalParagraphCoin) {
            try {
              const { getPostById, getUserByWallet } = await import("../../../services/paragraph");
              const { logger } = await import("../../../utils/logger");
              
              // Get post details to get the slug
              logger.debug(`[Paragraph] [Telegram] Getting post by ID: ${finalParagraphCoin.postId}`, {}, true);
              const post = await getPostById(finalParagraphCoin.postId, {
                includeAuthor: true,
                includePublication: true,
                includeContent: false,
              });
              
              if (!post) {
                logger.warn(`[Paragraph] [Telegram] Post not found for postId: ${finalParagraphCoin.postId}`);
              } else {
                logger.debug(`[Paragraph] [Telegram] Post details for ${finalParagraphCoin.postId}`, {
                  slug: post.slug,
                  title: post.title,
                  hasOwnerWallet: !!post.ownerWalletAddress,
                  hasOwnerUserId: !!post.ownerUserId,
                }, true);
                
                // Get author from post owner (more reliable than contract creator)
                let authorWallet: string | null = null;
                if (post.ownerWalletAddress) {
                  authorWallet = post.ownerWalletAddress;
                } else if (post.ownerUserId && post.ownerUserId.startsWith("0x")) {
                  authorWallet = post.ownerUserId;
                } else if (contractCreation?.contractCreator) {
                  // Fallback to contract creator if post owner not available
                  authorWallet = contractCreation.contractCreator;
                }
                
                if (authorWallet) {
                  logger.debug(`[Paragraph] [Telegram] Looking up author from wallet: ${authorWallet}`, {}, true);
                  const author = await getUserByWallet(authorWallet);
                  if (author) {
                    logger.debug(`[Paragraph] [Telegram] Found author: ${author.name}, publicationId: ${author.publicationId}`, {}, true);
                    paragraphPostAuthor = author;
                    // Construct URL using author's publicationId and post slug
                    if (author.publicationId && post.slug) {
                      paragraphPostUrl = `https://paragraph.com/@${author.publicationId}/${post.slug}`;
                      logger.debug(`[Paragraph] [Telegram] ✅ Constructed post URL: ${paragraphPostUrl}`, {}, true);
                    }
                  }
                }
              }
            } catch (error) {
              const { logger } = await import("../../../utils/logger");
              logger.warn(`[Paragraph] [Telegram] Failed to get post details for ${finalParagraphCoin.postId}`, { error: error instanceof Error ? error.message : String(error) });
            }
          }

          const { embed } = await buildBaseTokenEmbed(
            address,
            baseTokenData?.tokenName ?? null, // Token name from DexScreener
            baseTokenData?.tokenSymbol ?? null, // Token symbol from DexScreener
            baseTokenData,
            detectedFactory, // Use detected token factory (not DEX factory)
            contractCreation?.contractCreator ?? null,
            contractCreation?.createdAt ?? null, // Creation timestamp
            contractCreation?.txHash ?? null, // Creation transaction hash
            finalParagraphCoin ?? undefined, // Paragraph coin info if available
            paragraphPostAuthor ?? undefined, // Paragraph post author if available
            paragraphPostUrl ?? undefined, // Constructed post URL from post API
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

      // ============================================
      // STEP 4: MULTI-CHAIN TOKENS (Mantle, BSC, etc.)
      // ============================================
      // Multi-chain MUST run even if isEthAddress() === false
      let multiChainTokenData = null;

      try {
        multiChainTokenData = await fetchMultiChainTokenData(address);  // DexScreener API
      } catch (err) {
        console.error(`[Telegram] Multi-chain fetch failed for ${address}:`, err);
        // Don't return here - let it continue to wallet lookup
      }

      if (multiChainTokenData) {
        tokenFound = true;  // ✅ TOKEN FOUND
        const chainIdLower = multiChainTokenData.chainId.toLowerCase();
        // Handle all non-Base chains (including BSC, Mantle, etc.)
        const isBase = chainIdLower === "base" || multiChainTokenData.chainId === "8453";
        if (!isBase) {
          // Process non-Base multi-chain tokens
          // Fetch creator address and detect factory for this chain (with timeout for speed)
          const { getContractCreation, getContractCreationTx } = await import("../../../services/contractCreation");
          const { env } = await import("../../../config");
          
          // Fetch creator address and detect factory for this chain (with timeout for speed)
          const creatorLookupPromise = Promise.all([
            getContractCreation(address, multiChainTokenData.chainId, env.basescanApiKey).catch(() => null),
            getContractCreationTx(address, multiChainTokenData.chainId, env.basescanApiKey).catch(() => null),
          ]);
          
          const creatorTimeoutPromise = new Promise<[null, null]>((resolve) => {
            setTimeout(() => resolve([null, null]), 5000); // 5 second timeout for creator lookup
          });
          
          // Wait for creator lookup (with timeout) before building embed
          const [contractCreation, creationTx] = await Promise.race([
            creatorLookupPromise,
            creatorTimeoutPromise,
          ]);

          // Detect factory: if creationTx.to exists, that's the factory address
          let factoryName: string | null = null;
          if (creationTx?.to) {
            factoryName = `Factory: ${creationTx.to.slice(0, 10)}...${creationTx.to.slice(-8)}`;
          }

          // Add creator info to token data before building embed
          multiChainTokenData.creatorAddress = contractCreation?.contractCreator ?? null;
          multiChainTokenData.factoryName = factoryName;
          multiChainTokenData.createdAt = contractCreation?.createdAt ?? null;
          multiChainTokenData.creationTxHash = contractCreation?.txHash ?? null;

          // Build embed with creator info (if available)
          const { embed } = await buildMultiChainTokenEmbed(address, multiChainTokenData);
          const messages = embedsToTelegram([embed]);
          
          await bot.sendMessage(chatId, `${multiChainTokenData.chainName} token detected for <code>${address}</code>.`, {
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });
          await bot.sendMessage(chatId, messages[0], {
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });
          
          return;  // EXIT
        }
        
        // If multi-chain returned data but it's Base, we already handled it above
        // So we can return here
        if (multiChainTokenData) {
          return;  // EXIT
        }
      }
      
      // If DexScreener found nothing, try ERC-20 detection for tokens not on DEXes
      // This should run BEFORE wallet/Zora checks
      if (isEthFormat) {
        try {
          const { detectTokenContract } = await import("../../../services/tokenDetection");
          const tokenDetectionPromise = detectTokenContract(address);
          const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => {
              console.log(`[Telegram] Token detection timeout for ${address}`);
              resolve(null);
            }, 8000); // 8 second timeout
          });
          const tokenInfo = await Promise.race([tokenDetectionPromise, timeoutPromise]).catch(() => null);

          if (tokenInfo && tokenInfo.isToken) {
            tokenFound = true;  // ✅ TOKEN FOUND
            const tokenMessage = `🪙 Token Contract Detected\n\n` +
              `🔗 Chain: ${tokenInfo.chainName}\n` +
              (tokenInfo.name ? `🏠 Name: ${tokenInfo.name}\n` : "") +
              (tokenInfo.symbol ? `🔖 Symbol: ${tokenInfo.symbol}\n` : "") +
              (tokenInfo.decimals !== null ? `🔢 Decimals: ${tokenInfo.decimals}\n` : "") +
              (tokenInfo.totalSupply ? `📊 Total Supply: ${tokenInfo.totalSupply}\n` : "") +
              `🔑 Address: <code>${address}</code>\n\n` +
              `⚠️ This token is not yet listed on any DEX tracked by DexScreener.\n` +
              `It may be a new token that hasn't created a liquidity pool yet.`;
            await bot.sendMessage(chatId, tokenMessage, { parse_mode: "HTML", disable_web_page_preview: true });
            return;  // EXIT
          }
        } catch (error) {
          console.error(`[Telegram] Token detection failed:`, error);
        }
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

    // Keyword and @username auto-detections removed - use commands instead: /cast, /far, /z, /w, /x, /info

    // X/Twitter auto-detection removed - use /x command instead

    // Check if it's a Paragraph post link - use API directly (same as Discord)
    const paragraphUrlRegex = /https?:\/\/(?:www\.)?paragraph\.(?:com|xyz)\/@([^\/\s\)]+)\/([^\s\)]+)/i;
    if (paragraphUrlRegex.test(text)) {
      try {
        const match = text.match(paragraphUrlRegex);
        if (match) {
          const publicationSlug = match[1]; // e.g., "blog"
          const postSlug = match[2]; // e.g., "writer-coins"
          
          const { getPostBySlug, getCoinById } = await import("../../../services/paragraph");
          const { logger } = await import("../../../utils/logger");
          
          logger.debug(`[Paragraph] [Telegram] Getting post via API: publicationSlug=${publicationSlug}, postSlug=${postSlug}`, {}, true);
          
          // Step 1: Get post by publication slug + post slug
          const post = await getPostBySlug(publicationSlug, postSlug, false);
          
          if (!post) {
            logger.warn(`[Paragraph] [Telegram] Post not found for ${publicationSlug}/${postSlug}`);
            return;
          }
          
          logger.debug(`[Paragraph] [Telegram] ✅ Got post via API`, {
            postId: post.id,
            title: post.title,
            coinId: post.coinId,
            slug: post.slug
          }, true);
          
          // Step 2: Get coin by coinId to get contract address
          if (post.coinId) {
            logger.debug(`[Paragraph] [Telegram] Getting coin by coinId: ${post.coinId}`, {}, true);
            const coin = await getCoinById(post.coinId);
            if (coin && coin.contractAddress) {
              logger.debug(`[Paragraph] [Telegram] ✅ Got contract address from coin: ${coin.contractAddress}`, {}, true);
              // Process as a token address (will go through normal token detection)
              await processMessage(bot, chatId, coin.contractAddress);
              return;
            }
          } else {
            logger.warn(`[Paragraph] [Telegram] Post does not have a coinId (not tokenized)`);
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

    // Check if it's a Base post link (base.org or base.app)
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
            // Extract contract address using the same logic as Discord
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
              const coin = await fetchZoraCoin(contractAddress, 8453);
              const zoraSummary = coin ? await findBestZoraSummary([contractAddress]) : null;
              
              if (coin) {
                const response = await buildZoraCoinResponse(coin, zoraSummary, { returnAllPages: true });
                const identifier = `base_post_${contractAddress}`;
                const pageLabels = response.embeds.length > 1
                  ? ["Coin Details", "Creator Coin & Farcaster"]
                  : undefined;
                await sendPaginatedTelegramMessage(bot, chatId, response.embeds, identifier, pageLabels);
                return;
              }
            }
          }
        }
      } catch (error) {
        console.error("[Telegram] Error handling Base post:", error);
        // Continue to other handlers
      }
    }

    // Check if it's a Farcaster cast link (warpcast.com, fcast.me, farcaster.xyz)
    const castUrlRegex = /(https?:\/\/(?:www\.)?(?:warpcast\.com|fcast\.me|farcaster\.xyz)\/[^\s]+)/i;
    if (castUrlRegex.test(text)) {
      try {
        const match = text.match(castUrlRegex);
        if (match) {
          const castUrl = match[0].replace(/[).,!?\]]*$/, "");
          const { findCastByUrl, fetchEmbeddedUrlMetadata } = await import("../../../services/neynar");
          
          // Try to find cast by URL
          let cast = await findCastByUrl(castUrl);
          
          // If not found, try to resolve via metadata
          if (!cast) {
            try {
              const metadata = await fetchEmbeddedUrlMetadata(castUrl);
              // Extract canonical URL from metadata if available
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
        // Continue to other handlers
      }
    }

    // Check if it's a Zora contract URL (zora.co/collect or zora.co/coin)
    const zoraContractRegex = /https?:\/\/zora\.co\/(?:collect|coin)\/[^\s)]+/i;
    if (zoraContractRegex.test(text)) {
      try {
        const match = text.match(zoraContractRegex);
        if (match) {
          const url = match[0];
          // Extract address from URL or fetch from Zora API
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
        // Continue to other handlers
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

    // If we get here and it's a private chat, check if we should send a "not found" message
    // Only send if we actually tried to process an address (not just random text)
    // ERC-20 detection already ran above (before wallet/Zora checks)
    if (address && !tokenFound) {
      try {
        // Try basic address lookup as fallback
        const { lookupAddress } = await import("../../../services/addressLookup");
        const addressInfo = await lookupAddress(address).catch(() => null);
        
        if (addressInfo && addressInfo.length > 0) {
          // Found address info on some chain
          const info = addressInfo[0];
          const message = `🔍 Address found on ${info.chainName}\n` +
            `🔑 Address: <code>${address}</code>\n` +
            `${info.isContract ? "📄 Contract" : "👤 Wallet"}\n` +
            (info.balance ? `💰 Balance: ${info.balance}` : "") +
            `\n🔗 <a href="${info.explorerUrl}">View on Explorer</a>`;
          await bot.sendMessage(chatId, message, {
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });
        } else {
          // Nothing found - send helpful message
          await bot.sendMessage(chatId, `❌ No token or wallet information found for <code>${address}</code>.\n\n` +
            `This address may not be:\n` +
            `• Listed on any DEX tracked by DexScreener\n` +
            `• A token contract (ERC-20)\n` +
            `• A known wallet with Farcaster/Zora profiles\n` +
            `• Active on supported chains\n\n` +
            `Try searching for a different address or check the address on a block explorer.`, {
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });
        }
      } catch (fallbackError) {
        console.error(`[Telegram] Fallback lookup failed:`, fallbackError);
        // Send basic not found message
        await bot.sendMessage(chatId, `❌ No information found for <code>${address}</code>.`, {
          parse_mode: "HTML",
        });
      }
    }
    // In groups, we already filtered out non-mentions above
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
