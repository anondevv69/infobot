import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "discord.js";
import type { User } from "@neynar/nodejs-sdk/build/api";
import {
  findUserByUsername,
  findUserByWallet,
  NeynarLookupError,
} from "../services/neynar";
import {
  fetchTokensByAddress,
  fetchTokensByQuery,
  type ClankerToken,
} from "../services/clanker";
import { fetchZoraCoin } from "../services/zora";
import {
  findBestZoraSummary,
  type ZoraLookupResult,
} from "../services/zora";
import {
  buildTokenDetailRows,
  buildTokenEmbed,
  buildUserClankerEmbed,
  resolveUserFromToken,
} from "../utils/clankerEmbeds";
import { safeFetchMostRecentCast, safeFetchTokensByFid, safeFetchEarliestCastByQuery } from "../utils/farcasterHelpers";
import { isEthAddress, isSolAddress, isTransactionHash } from "../utils/address";
import { extractTransactionHash } from "../services/relay";
import { lookupTransaction, detectChainFromTransactionLink } from "../services/transactionLookup";
import { lookupAddress } from "../services/addressLookup";
import { buildZoraPresentation, collectZoraIdentifiers } from "../utils/zoraPresentation";
import { appendZoraSummaryFields, buildZoraProfileEmbed } from "../utils/zoraEmbeds";
import { buildWalletProfileResponse, buildZoraWalletProfileResponse } from "../utils/walletEmbed";
import { buildFarcasterPresentation } from "../utils/farcasterPresentation";
import { isSummaryAssociatedWithAddress, isSummaryAssociatedWithUser } from "../utils/zoraAssociation";
import { splitClankerTokens } from "../utils/clankerAssociation";
import { buildZoraCoinResponse } from "../handlers/zoraAddress";
import { splitEmbedIntoPages, buildPaginationButtons } from "../utils/pagination";
import { storeEmbedForPagination } from "../handlers/pagination";
import { logger } from "../utils/logger";
import { trackUser, trackSearch, trackResponseTime } from "../utils/botStats";
import { applyBranding } from "../utils/branding";
import type { MultiChainTokenData } from "../services/dexscreener";

export async function handleSearchCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const query = interaction.options.getString("query", true).trim();
  const userId = interaction.user.id;
  const guildId = interaction.guildId || undefined;
  const channelId = interaction.channelId;

  // Track user and search
  trackUser(userId, "discord");
  trackSearch();

  logger.command("search", "discord", userId, guildId, channelId, { query });

  if (!query) {
    await interaction.reply({
      content: "Please provide a wallet address, username, or token to search.",
    });
    return;
  }

  // Log search immediately (before processing)
  logger.search(query, "discord", userId, guildId, channelId, {
    success: true, // Will update if it fails
    type: "pending",
  });

  // Track response time
  const startTime = Date.now();
  await interaction.deferReply();

  try {
    // Check if it's a transaction hash first
    const txHash = extractTransactionHash(query);
    if (txHash && isTransactionHash(txHash)) {
      await handleTransactionSearch(interaction, txHash, query);
      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "transaction",
      });
      return;
    }

    if (isEthAddress(query) || isSolAddress(query)) {
      await handleWalletSearch(interaction, query, userId, guildId, channelId);
      return;
    }

    // Try Farcaster username lookup first
    const normalizedUsername = normalizeUsername(query);
    const handledUsername = await replyWithUsernameLookup(
      interaction,
      normalizedUsername,
    );
    if (handledUsername) {
      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "farcaster",
      });
      return;
    }

    // Fallback to Zora account lookup if Farcaster not found
    const normalizedQuery = query.replace(/^@/, "").toLowerCase();
    const zoraSummary = await findBestZoraSummary([
      normalizedQuery,
      `@${normalizedQuery}`,
      `${normalizedQuery}.eth`,
      `${normalizedQuery}.xyz`,
    ]);
    
    if (zoraSummary) {
      const profileEmbed = buildZoraProfileEmbed(zoraSummary);
      await appendZoraSummaryFields(profileEmbed, zoraSummary);
      
      // Split into pages if needed
      const embeds = splitEmbedIntoPages(profileEmbed, 15);
      const totalPages = embeds.length;
      const identifier = `zora_profile_${normalizedQuery}`;

      // Store for pagination
      if (totalPages > 1) {
        embeds.forEach((embed, index) => {
          if (index === 0) {
            storeEmbedForPagination(identifier, embed);
          } else {
            storeEmbedForPagination(`${identifier}_page${index + 1}`, embed);
          }
        });
      }

      const components: ActionRowBuilder<ButtonBuilder>[] = [];
      if (totalPages > 1) {
        components.push(...buildPaginationButtons(0, totalPages, identifier));
      }

      await interaction.editReply({
        embeds: [embeds[0]],
        components,
      });
      
      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "zora",
        count: 1,
      });
      return;
    }

    // Final fallback to Clanker token lookup
    const clankerHandled = await replyWithClankerTokenLookup(interaction, query);
    if (clankerHandled) {
      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "clanker",
      });
    } else {
      logger.search(query, "discord", userId, guildId, channelId, {
        success: false,
        type: "not_found",
      });
    }
  } catch (error) {
    const message =
      error instanceof NeynarLookupError
        ? error.message
        : "Unexpected error while querying Neynar.";

    logger.error(
      `Search failed for query: ${query}`,
      error,
      { query, userId, guildId, channelId, platform: "discord" }
    );

    logger.search(query, "discord", userId, guildId, channelId, {
      success: false,
    });

    await interaction.editReply({
      content: `${message} Please retry later or check the provided value.`,
    });
  } finally {
    // Track response time for this command
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
  }
}

async function handleWalletSearch(
  interaction: ChatInputCommandInteraction,
  address: string,
  userId?: string,
  guildId?: string,
  channelId?: string,
): Promise<void> {
  // Run initial lookups in PARALLEL (major performance improvement)
  const [zoraSummaryFromAddress, user, paragraphUser] = await Promise.all([
    findBestZoraSummary([address]).catch(() => null),
    findUserByWallet(address).catch(() => null),
    import("../services/paragraph").then(m => m.getUserByWallet(address)).catch(() => null),
  ]);

  // If no user found but Zora has Farcaster handle, try that lookup (with timeout)
  let finalUser = user;
  if (!finalUser && zoraSummaryFromAddress?.profile?.farcasterHandle) {
    try {
      const handle = zoraSummaryFromAddress.profile.farcasterHandle.replace(/^@/, "");
      // Add timeout to username lookup
      finalUser = await Promise.race([
        findUserByUsername(handle),
        new Promise<User | null>((resolve) => 
          setTimeout(() => resolve(null), 3000)
        ),
      ]);
    } catch (error) {
      console.warn("Failed to resolve user from Zora Farcaster handle:", error);
    }
  }

  if (finalUser) {
    const zoraIdentifiers = collectZoraIdentifiers(finalUser, address);
    const [tokens, latestCast, zoraSummaryForUser] = await Promise.all([
      safeFetchTokensByFid(finalUser.fid),
      safeFetchMostRecentCast(finalUser.fid),
      findBestZoraSummary(zoraIdentifiers),
    ]);

    const associatedSummary =
      zoraSummaryForUser && isSummaryAssociatedWithUser(finalUser, zoraSummaryForUser)
        ? zoraSummaryForUser
        : zoraSummaryFromAddress;

    const walletResponse = await buildWalletProfileResponse({
      wallet: address,
      user: finalUser,
      zoraSummary: associatedSummary,
      clankerTokens: tokens,
      latestCast,
      paragraphUser: paragraphUser ?? undefined,
    });

    await interaction.editReply({
      embeds: walletResponse.embeds,
      components: walletResponse.components,
    });
    
    logger.search(address, "discord", userId, guildId, channelId, {
      success: true,
      type: "wallet_farcaster",
    });
    return;
  }

  // Fetch Clanker tokens (with timeout protection)
  const tokens = await fetchTokensByAddress(address);
  
  if (tokens.length > 0) {
    const firstToken = tokens[0];
    // Resolve user with timeout (3 seconds max)
    const associatedUser = await Promise.race([
      resolveUserFromToken(firstToken),
      new Promise<User | null>((resolve) => 
        setTimeout(() => resolve(null), 3000)
      ),
    ]);
    
    if (associatedUser) {
      const [creatorTokens, latestCast, zoraSummaryForCreator] = await Promise.all([
        safeFetchTokensByFid(associatedUser.fid),
        safeFetchMostRecentCast(associatedUser.fid),
        findBestZoraSummary(collectZoraIdentifiers(associatedUser, address)),
      ]);

      const associatedSummary =
        zoraSummaryForCreator &&
        isSummaryAssociatedWithUser(associatedUser, zoraSummaryForCreator)
          ? zoraSummaryForCreator
          : zoraSummaryFromAddress;

      const walletResponse = await buildWalletProfileResponse({
        wallet: address,
        user: associatedUser,
        zoraSummary: associatedSummary,
        clankerTokens: creatorTokens,
        latestCast,
        paragraphUser: paragraphUser ?? undefined,
      });

      await interaction.editReply({
        content: `No Farcaster profile linked directly to \`${address}\`, but the address is associated with this Clanker creator:`,
        embeds: walletResponse.embeds,
        components: walletResponse.components,
      });
      return;
    }

    const earliestCast = firstToken.contract_address
      ? await safeFetchEarliestCastByQuery(firstToken.contract_address)
      : null;
    
    const tokenEmbed = await buildTokenEmbed(firstToken, {
      farcasterUser: associatedUser ?? undefined,
      zoraSummary: zoraSummaryFromAddress ?? undefined,
      earliestCast,
    });

    // Split into pages if needed
    const embeds = splitEmbedIntoPages(tokenEmbed, 15);
    const totalPages = embeds.length;
    const identifier = `clanker_token_${firstToken.contract_address ?? address}`;
    
    if (totalPages > 1) {
      storeEmbedForPagination(identifier, tokenEmbed);
    }

    const components: typeof buildPaginationButtons extends (...args: any[]) => infer R ? R : never = [];
    if (totalPages > 1) {
      components.push(...buildPaginationButtons(0, totalPages, identifier));
    }

    await interaction.editReply({
      content: `No Farcaster profile linked directly to \`${address}\`. Showing Clanker token associated with this address:`,
      embeds: [embeds[0]],
      components,
    });
    
    logger.search(address, "discord", userId, guildId, channelId, {
      success: true,
      type: "wallet_clanker_token",
    });
    return;
  }

  // Fallback: Check if it's a Monad Clanker token not yet indexed by Clanker API
  // Check if it's a Monad contract from the Clanker factory
  if (isEthAddress(address)) {
    try {
      const { getMonadAccountInfo } = await import("../services/blockvision");
      const { getContractCreation } = await import("../services/contractCreation");
      const { detectTokenFactory } = await import("../services/baseFactories");
      
      const [monadAccountInfo, contractCreation] = await Promise.all([
        getMonadAccountInfo(address).catch(() => null),
        getContractCreation(address, "monad").catch(() => null),
      ]);
      
      // Check if it's a contract on Monad
      if (monadAccountInfo?.isContract && contractCreation?.contractCreator) {
        // Check if the creator is the Clanker Monad factory (0xf9a0c289eab6b571c6247094a853810987e5b26d)
        const creatorLower = contractCreation.contractCreator.toLowerCase();
        const clankerMonadFactory = "0xf9a0c289eab6b571c6247094a853810987e5b26d".toLowerCase();
        if (creatorLower === clankerMonadFactory) {
          // It's a Monad Clanker token - create a basic Clanker token embed
          const { buildMultiChainTokenEmbed } = await import("../utils/multiChainTokenEmbeds");
          const monadTokenData: MultiChainTokenData = {
            chainId: "5001",
            chainName: "Monad",
            tokenName: null,
            tokenSymbol: null,
            priceUsd: null,
            priceChange24h: null,
            volume24h: null,
            liquidity: null,
            marketCap: null,
            fdv: null,
            trades24h: null,
            dexUrl: null,
            dexName: null,
            pairAddress: null,
            creatorAddress: contractCreation.contractCreator,
            factoryName: "Clanker",
            createdAt: contractCreation.createdAt ?? null,
            creationTxHash: contractCreation.txHash ?? null,
          };
          
          const { embed, components } = await buildMultiChainTokenEmbed(address, monadTokenData);
          
          await interaction.editReply({
            embeds: [embed],
            components,
          });
          
          logger.search(address, "discord", userId, guildId, channelId, {
            success: true,
            type: "wallet_monad_clanker_token",
          });
          return;
        }
      }
    } catch (error) {
      console.error(`[Search] Monad Clanker fallback check failed for ${address}:`, error);
    }
  }

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
      matchedCoin = await fetchZoraCoin(address);
    }

    if (matchedCoin) {
      const response = await buildZoraCoinResponse(matchedCoin, zoraSummaryFromAddress);
      await interaction.editReply(response);
      
      logger.search(address, "discord", userId, guildId, channelId, {
        success: true,
        type: "wallet_zora_coin",
      });
      return;
    }
  }

  // Check for Base tokens and multi-chain tokens BEFORE falling back to Zora profile
  // This ensures contracts are detected as tokens, not just Zora profiles
  if (isEthAddress(address)) {
    // Check for Paragraph coin first (tokenized posts)
    const { getCoinByContract } = await import("../services/paragraph");
    const paragraphCoin = await getCoinByContract(address).catch((error) => {
      console.warn(`[Search] Failed to fetch Paragraph coin for ${address}:`, error);
      return null;
    });
    
    // Debug: Log if Paragraph coin was found
    if (paragraphCoin) {
      console.log(`[Search] ✅ Found Paragraph coin for ${address}:`, paragraphCoin);
    }
    
    // Check for Base tokens (Rainbow, ApeStore, Fey, Paragraph, etc.)
    const { fetchBaseTokenData, fetchMultiChainTokenData } = await import("../services/dexscreener");
    const { detectTokenFactory } = await import("../services/baseFactories");
    const { getContractCreation } = await import("../services/contractCreation");
    const { buildBaseTokenEmbed } = await import("../utils/baseTokenEmbeds");
    const { buildMultiChainTokenEmbed } = await import("../utils/multiChainTokenEmbeds");
    
    const [baseTokenData, factory] = await Promise.all([
      fetchBaseTokenData(address),
      detectTokenFactory(address),
    ]);

    if (baseTokenData) {
      // Fetch creator address for Base tokens
      const contractCreation = await getContractCreation(address, "base").catch(() => null);
      
      // If this is a Paragraph token, fetch post details and author
      let paragraphPostAuthor: { name?: string | null; bio?: string | null; farcaster?: { username: string } | null; publicationId?: string | null; walletAddress?: string } | null = null;
      let paragraphPostUrl: string | null = null;
      
      if (paragraphCoin) {
        try {
          const { getPostById } = await import("../services/paragraph");
          const post = await getPostById(paragraphCoin.postId, {
            includeAuthor: true,
            includePublication: true,
            includeContent: false,
          });
          
          if (post) {
            // Build post URL from publication slug and post slug
            if (post.publicationSlug && post.slug) {
              paragraphPostUrl = `https://paragraph.com/@${post.publicationSlug}/${post.slug}`;
            } else if (post.publicationSlug) {
              paragraphPostUrl = `https://paragraph.com/@${post.publicationSlug}`;
            }
            
            // Extract author information
            if (post.author || post.authorId) {
              const author = post.author;
              const authorWallet = author?.walletAddress ?? author?.wallet ?? undefined;
              paragraphPostAuthor = {
                name: author?.name ?? null,
                bio: null,
                farcaster: null,
                publicationId: author?.publicationId ?? post.publicationId ?? null,
                walletAddress: authorWallet,
              };
              
              // If we have a wallet address, try to get full user info including Farcaster
              if (authorWallet) {
                try {
                  const { getUserByWallet } = await import("../services/paragraph");
                  const fullUser = await getUserByWallet(authorWallet);
                  if (fullUser && paragraphPostAuthor) {
                    paragraphPostAuthor.farcaster = fullUser.farcaster ? {
                      username: fullUser.farcaster.username,
                    } : null;
                    paragraphPostAuthor.name = paragraphPostAuthor.name ?? fullUser.name ?? null;
                    paragraphPostAuthor.publicationId = paragraphPostAuthor.publicationId ?? fullUser.publicationId ?? null;
                  }
                } catch (error) {
                  // Ignore errors fetching full user info
                }
              }
            }
          }
        } catch (error) {
          // Ignore errors fetching post details
          console.warn(`[Search] Failed to fetch Paragraph post details:`, error);
        }
      }
      
      const { embed, components } = await buildBaseTokenEmbed(
        address,
        null, // tokenName
        null, // tokenSymbol
        baseTokenData,
        factory,
        contractCreation?.contractCreator ?? null,
        contractCreation?.createdAt ?? null,
        contractCreation?.txHash ?? null,
        paragraphCoin ?? null,
        paragraphPostAuthor ?? undefined,
        paragraphPostUrl ?? undefined,
      );

      await interaction.editReply({
        embeds: [embed],
        components,
      });
      
      logger.search(address, "discord", userId, guildId, channelId, {
        success: true,
        type: "wallet_base_token",
      });
      return;
    }

    // Check for multi-chain tokens (Mantle, BSC, Monad, etc.)
    let multiChainTokenData;
    try {
      multiChainTokenData = await fetchMultiChainTokenData(address);
    } catch (err) {
      console.error(`[Search] Multi-chain fetch failed for ${address}:`, err);
    }

    if (multiChainTokenData) {
      const chainIdLower = multiChainTokenData.chainId.toLowerCase();
      // Only show multi-chain if it's NOT Base (Base tokens handled above)
      if (chainIdLower !== "base" && multiChainTokenData.chainId !== "8453") {
        const { embed, components } = await buildMultiChainTokenEmbed(address, multiChainTokenData);
        
        await interaction.editReply({
          embeds: [embed],
          components,
        });
        
        logger.search(address, "discord", userId, guildId, channelId, {
          success: true,
          type: "wallet_multi_chain_token",
        });
        return;
      }
    }

    // Fallback: Check if it's a Monad contract (BlockVision API)
    // DexScreener might not have all Monad tokens yet, so we check directly
    // Check Monad even if DexScreener returned data for other chains (Monad might not be in DexScreener)
    let monadAccountInfo: { isContract: boolean } | null = null;
    // Only skip Monad check if we already found a Monad token from DexScreener
    const isMonadTokenFromDexScreener = multiChainTokenData && (
      multiChainTokenData.chainId === "5001" || 
      multiChainTokenData.chainId?.toLowerCase() === "monad"
    );
    
    if (!isMonadTokenFromDexScreener) {
      const { getMonadAccountInfo, MONAD_CHAIN_ID } = await import("../services/blockvision");
      monadAccountInfo = await getMonadAccountInfo(address).catch(() => null);
      
      if (monadAccountInfo?.isContract) {
        // It's a contract on Monad, create a basic token embed
        const { buildMultiChainTokenEmbed } = await import("../utils/multiChainTokenEmbeds");
        const { getContractCreation } = await import("../services/contractCreation");
        const { getTokenFactoryName } = await import("../services/baseFactories");
        
        // Try to get contract creation info
        const contractCreation = await getContractCreation(address, "monad").catch(() => null);
        
        // Check if it's from a known factory (Nad.fun, Clanker, etc.)
        let factoryName: string | null = null;
        if (contractCreation?.contractCreator) {
          factoryName = getTokenFactoryName(contractCreation.contractCreator);
        }
        
        // Create a basic Monad token data structure
        const monadTokenData: MultiChainTokenData = {
          chainId: String(MONAD_CHAIN_ID),
          chainName: "Monad",
          tokenName: null,
          tokenSymbol: null,
          priceUsd: null,
          priceChange24h: null,
          volume24h: null,
          liquidity: null,
          marketCap: null,
          fdv: null,
          trades24h: null,
          dexUrl: null,
          dexName: null,
          pairAddress: null,
          creatorAddress: contractCreation?.contractCreator ?? null,
          factoryName: factoryName,
          createdAt: contractCreation?.createdAt ?? null,
          creationTxHash: contractCreation?.txHash ?? null,
        };
        
        const { embed, components } = await buildMultiChainTokenEmbed(address, monadTokenData);
        
        await interaction.editReply({
          embeds: [embed],
          components,
        });
        
        logger.search(address, "discord", userId, guildId, channelId, {
          success: true,
          type: "wallet_monad_token",
        });
        return;
      }
    }

    // Fallback: Check for ERC-20 tokens not on DEXes (via RPC calls)
    // This catches tokens that DexScreener doesn't have yet
    if (!baseTokenData && !multiChainTokenData && !monadAccountInfo?.isContract) {
      try {
        const { detectTokenContract } = await import("../services/tokenDetection");
        const tokenDetectionPromise = detectTokenContract(address);
        const timeoutPromise = new Promise<null>((resolve) => {
          setTimeout(() => {
            console.log(`[Search] Token detection timeout for ${address}`);
            resolve(null);
          }, 8000); // 8 second timeout
        });
        const tokenInfo = await Promise.race([tokenDetectionPromise, timeoutPromise]).catch(() => null);

        if (tokenInfo && tokenInfo.isToken) {
          const { getContractCreation } = await import("../services/contractCreation");
          const contractCreation = await getContractCreation(address, tokenInfo.chainName.toLowerCase()).catch(() => null);
          
          // Build a basic token embed
          const embed = new EmbedBuilder()
            .setTitle(`🪙 ${tokenInfo.symbol || "Token"} • ${tokenInfo.name || "Unknown"}`)
            .setDescription(`Token contract detected on ${tokenInfo.chainName}`)
            .addFields(
              {
                name: "🔗 Chain",
                value: tokenInfo.chainName,
                inline: true,
              },
              {
                name: "🏠 Name",
                value: tokenInfo.name || "Unknown",
                inline: true,
              },
              {
                name: "🔖 Symbol",
                value: tokenInfo.symbol || "Unknown",
                inline: true,
              },
              {
                name: "🔑 Address",
                value: `\`${address}\``,
                inline: false,
              }
            )
            .setColor(0x5865f2);

          if (tokenInfo.decimals !== null) {
            embed.addFields({
              name: "🔢 Decimals",
              value: String(tokenInfo.decimals),
              inline: true,
            });
          }

          if (tokenInfo.totalSupply) {
            embed.addFields({
              name: "📊 Total Supply",
              value: tokenInfo.totalSupply,
              inline: true,
            });
          }

          if (contractCreation?.contractCreator) {
            embed.addFields({
              name: "👤 Creator",
              value: `\`${contractCreation.contractCreator}\``,
              inline: false,
            });
          }

          embed.addFields({
            name: "⚠️ Note",
            value: "This token is not yet listed on any DEX tracked by DexScreener. It may be a new token that hasn't created a liquidity pool yet.",
            inline: false,
          });

          applyBranding(embed, "erc20 token");

          await interaction.editReply({
            embeds: [embed],
          });

          logger.search(address, "discord", userId, guildId, channelId, {
            success: true,
            type: "wallet_erc20_token",
          });
          return;
        }
      } catch (error) {
        console.error(`[Search] Token detection failed for ${address}:`, error);
      }
    }
  }

  // Only show Zora profile if no tokens were found
  if (zoraSummaryFromAddress?.latestCoin) {
    const associated = isSummaryAssociatedWithAddress(zoraSummaryFromAddress, address)
      ? zoraSummaryFromAddress
      : null;

    const zoraResponse = buildZoraWalletProfileResponse({
      wallet: address,
      summary: associated ?? zoraSummaryFromAddress,
    });

    let farcasterEmbeds: Awaited<ReturnType<typeof buildFarcasterPresentation>> | null = null;
    const farcasterHandle = zoraSummaryFromAddress.profile.farcasterHandle;
    if (farcasterHandle) {
      try {
        const user = await findUserByUsername(farcasterHandle.replace(/^@/, ""));
        if (user) {
          farcasterEmbeds = await buildFarcasterPresentation(user, {
            zoraSummary: associated,
          });
        }
      } catch (error) {
        console.warn("Failed to fetch Farcaster profile for search result:", error);
      }
    }

    await interaction.editReply({
      content: `No Farcaster profile, Clanker deployments, or token information found for \`${address}\`, but the address is associated with this Zora profile:`,
      embeds: farcasterEmbeds
        ? [...farcasterEmbeds.embeds, ...zoraResponse.embeds]
        : zoraResponse.embeds,
      components: farcasterEmbeds?.components ?? [],
    });
    
    logger.search(address, "discord", userId, guildId, channelId, {
      success: true,
      type: "wallet_zora_profile",
    });
    return;
  }

  // Final fallback: Try to get basic address information across chains
  const addressInfo = await lookupAddress(address);
  
  if (addressInfo.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("🔍 Address Information")
      .setDescription(`Found activity for \`${address}\` on ${addressInfo.length} chain(s)`)
      .setColor(0x00d4ff);

    for (const info of addressInfo) {
      let value = "";
      if (info.isContract) {
        value += "📄 **Contract**\n";
      } else {
        value += "👤 **EOA (Externally Owned Account)**\n";
      }

      if (info.balance) {
        try {
          const balanceWei = BigInt(info.balance);
          const balanceEth = Number(balanceWei) / 1e18;
          if (balanceEth > 0) {
            value += `💰 Balance: ${balanceEth.toFixed(6)} ETH\n`;
          }
        } catch (error) {
          // Ignore balance parsing errors
        }
      }

      if (info.transactionCount !== null) {
        value += `📊 Transactions: ${info.transactionCount.toLocaleString()}\n`;
      }

      value += `🔗 [View on ${info.chainName} Explorer](${info.explorerUrl})`;

      embed.addFields({
        name: `${info.chainName} (Chain ID: ${info.chainId})`,
        value,
        inline: false,
      });
    }

    // Apply branding first (this sets the footer with branding)
    applyBranding(embed, "address lookup");
    
    // Append address to footer (preserving branding)
    const currentFooter = embed.data.footer;
    if (currentFooter) {
      embed.setFooter({
        text: `${currentFooter.text} • Address: ${address.slice(0, 10)}...${address.slice(-8)}`,
        iconURL: currentFooter.icon_url ?? undefined,
      });
    }
    
    await interaction.editReply({
      content: `No Farcaster profile, Clanker deployments, or Zora coins found for \`${address}\`, but found activity on the following chain(s):`,
      embeds: [embed],
    });
    return;
  }

  const errorMsg = `We're continuing to add more wallet tracking systems and cannot connect \`${address}\` to any wallet or contract at this time.\n\n**Note:** This address has no activity on any supported chain (Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BSC, Fantom, Mantle, Monad).`;
  const truncatedMsg = errorMsg.length > 2000 
    ? errorMsg.substring(0, 1997) + "..." 
    : errorMsg;
  await interaction.editReply({
    content: truncatedMsg,
  });
}

async function replyWithUsernameLookup(
  interaction: ChatInputCommandInteraction,
  username: string,
): Promise<boolean> {
  const user = await findUserByUsername(username);

  if (!user) {
    return false;
  }

  const identifiers = collectZoraIdentifiers(user);
  const [tokens, latestCast, zoraSummary] = await Promise.all([
    safeFetchTokensByFid(user.fid),
    safeFetchMostRecentCast(user.fid),
    findBestZoraSummary(identifiers),
  ]);
  const { embed, clankerEntries } = await buildUserClankerEmbed(
    user,
    "Username Lookup",
    tokens,
  );
  const detailRows = buildTokenDetailRows(
    clankerEntries.map((entry) => entry.token),
    { includeButtons: false },
  );
  await appendZoraSummaryFields(embed, zoraSummary, { latestCast });

  // Split into pages if needed
  const embeds = splitEmbedIntoPages(embed, 15);
  const totalPages = embeds.length;
  const identifier = `farcaster_username_${username}`;

  // Store for pagination
  if (totalPages > 1) {
    embeds.forEach((embed, index) => {
      if (index === 0) {
        storeEmbedForPagination(identifier, embed);
      } else {
        storeEmbedForPagination(`${identifier}_page${index + 1}`, embed);
      }
    });
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    components.push(...buildPaginationButtons(0, totalPages, identifier));
  }
  // Add detail rows if any
  if (detailRows.length > 0) {
    components.push(...detailRows);
  }

  await interaction.editReply({
    embeds: [embeds[0]],
    components,
  });

  return true;
}

function normalizeUsername(value: string): string {
  return value.replace(/^@/, "").toLowerCase();
}

async function replyWithClankerTokenLookup(
  interaction: ChatInputCommandInteraction,
  query: string,
): Promise<boolean> {
  // Run both lookups in parallel if query is an address (major performance improvement)
  let tokens: ClankerToken[] = [];
  if (isEthAddress(query) || isSolAddress(query)) {
    const [addressTokens, queryTokens] = await Promise.all([
      fetchTokensByAddress(query),
      fetchTokensByQuery(query),
    ]);
    // Prefer address results, fallback to query results
    tokens = addressTokens.length > 0 ? addressTokens : queryTokens;
  } else {
    // For non-address queries, just use query search
    tokens = await fetchTokensByQuery(query);
  }
  
  if (tokens.length === 0) {
    await interaction.editReply({
      content: `No Farcaster profile or Clanker deployments found for \`${query}\`.`,
    });
    return false;
  }

  const primaryToken = tokens[0];
  const associatedUser = await resolveUserFromToken(primaryToken);
  if (associatedUser) {
    const [creatorTokens, latestCast] = await Promise.all([
      safeFetchTokensByFid(associatedUser.fid),
      safeFetchMostRecentCast(associatedUser.fid),
    ]);
    const { embed: userEmbed, clankerEntries } = await buildUserClankerEmbed(
      associatedUser,
      "Clanker Creator",
      creatorTokens,
    );
    const detailRows = buildTokenDetailRows(
      [primaryToken, ...clankerEntries.map((entry) => entry.token)],
      { includeButtons: false },
    );
    const zoraSummary = await findBestZoraSummary(collectZoraIdentifiers(associatedUser));

    await appendZoraSummaryFields(userEmbed, zoraSummary, { latestCast });

    await interaction.editReply({
      content: `No Farcaster profile found for \`${query}\`, but the keyword matches this Clanker creator:`,
      embeds: [userEmbed],
      components: detailRows,
    });
    return true;
  }

  const earliestCast = primaryToken.contract_address
    ? await safeFetchEarliestCastByQuery(primaryToken.contract_address)
    : null;

  const tokenEmbed = await buildTokenEmbed(primaryToken, { 
    earliestCast,
  });
  const embeds = splitEmbedIntoPages(tokenEmbed, 15);
  const totalPages = embeds.length;
  const identifier = `clanker_token_${primaryToken.contract_address ?? query}`;
  
  if (totalPages > 1) {
    storeEmbedForPagination(identifier, tokenEmbed);
  }

  const components: typeof buildPaginationButtons extends (...args: any[]) => infer R ? R : never = [];
  if (totalPages > 1) {
    components.push(...buildPaginationButtons(0, totalPages, identifier));
  }

  await interaction.editReply({
    content: `No Farcaster profile found for \`${query}\`, but the keyword matches this Clanker deployment:`,
    embeds: [embeds[0]],
    components,
  });
  return true;
}

/**
 * Handle transaction hash search
 */
async function handleTransactionSearch(
  interaction: ChatInputCommandInteraction,
  txHash: string,
  originalQuery: string,
): Promise<void> {
  // Try to detect chain from link if it's a URL
  const preferredChainId = detectChainFromTransactionLink(originalQuery);
  
  const transaction = await lookupTransaction(txHash, preferredChainId || undefined);

  if (!transaction) {
    const errorMsg = `❌ Transaction \`${txHash}\` not found on any supported chain.\n\n**Supported chains:** Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BSC, Fantom, Mantle, Monad, Gnosis, Celo, Linea, Scroll\n\n**Note:** If this is a Relay cross-chain transaction, use \`/relay\` instead.`;
    const truncatedMsg = errorMsg.length > 2000 
      ? errorMsg.substring(0, 1997) + "..." 
      : errorMsg;
    await interaction.editReply({
      content: truncatedMsg,
    });
    return;
  }

  // Build embed with transaction details
  const embed = new EmbedBuilder()
    .setTitle("🔍 Transaction Details")
    .setColor(transaction.status === "success" ? 0x00ff00 : transaction.status === "failed" ? 0xff0000 : 0xffff00)
    .addFields(
      {
        name: "🌐 Chain",
        value: `${transaction.chainName} (Chain ID: ${transaction.chainId})`,
        inline: true,
      },
      {
        name: "📊 Status",
        value: transaction.status === "success" ? "✅ Success" : transaction.status === "failed" ? "❌ Failed" : transaction.status === "pending" ? "⏳ Pending" : "❓ Unknown",
        inline: true,
      },
      {
        name: "📤 From",
        value: `\`${transaction.from}\``,
        inline: false,
      },
    );

  if (transaction.to) {
    embed.addFields({
      name: "📥 To",
      value: `\`${transaction.to}\``,
      inline: false,
    });
  }

  if (transaction.blockNumber) {
    embed.addFields({
      name: "🔢 Block",
      value: `#${transaction.blockNumber.toLocaleString()}`,
      inline: true,
    });
  }

  if (transaction.timestamp) {
    embed.addFields({
      name: "🕐 Time",
      value: `<t:${transaction.timestamp}:F>`,
      inline: true,
    });
  }

  // Convert value from hex to ETH
  if (transaction.value && transaction.value !== "0x0") {
    try {
      const valueWei = BigInt(transaction.value);
      const valueEth = Number(valueWei) / 1e18;
      if (valueEth > 0) {
        embed.addFields({
          name: "💰 Value",
          value: `${valueEth.toFixed(6)} ETH`,
          inline: true,
        });
      }
    } catch (error) {
      // Ignore value parsing errors
    }
  }

  if (transaction.gasUsed) {
    try {
      const gasUsed = parseInt(transaction.gasUsed, 16);
      embed.addFields({
        name: "⛽ Gas Used",
        value: gasUsed.toLocaleString(),
        inline: true,
      });
    } catch (error) {
      // Ignore gas parsing errors
    }
  }

  embed
    .addFields({
      name: "🔗 Explorer",
      value: `[View on ${transaction.chainName} Explorer](${transaction.explorerUrl})`,
      inline: false,
    })
    .setFooter({
      text: `Transaction Hash: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`,
    });

  // Apply branding before sending
  applyBranding(embed, "transaction lookup");
  
  await interaction.editReply({
    embeds: [embed],
  });
}
