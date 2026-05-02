import { ChatInputCommandInteraction } from "discord.js";
import { isEthAddress } from "../utils/address";
import { trackUser, trackSearch, trackResponseTime } from "../utils/botStats";
import { logger } from "../utils/logger";
import { fetchBaseTokenData, fetchMultiChainTokenData } from "../services/dexscreener";
import { detectTokenFactory } from "../services/baseFactories";
import { getContractCreation } from "../services/contractCreation";
import { buildBaseTokenEmbed } from "../utils/baseTokenEmbeds";
import { buildMultiChainTokenEmbed } from "../utils/multiChainTokenEmbeds";
import { getCoinByContract } from "../services/paragraph";

/**
 * Token command - looks up token contract address and shows all available information
 */
export async function handleTokenCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const query = interaction.options.getString("query", true).trim();
  const userId = interaction.user.id;
  const guildId = interaction.guildId || undefined;
  const channelId = interaction.channelId;

  trackUser(userId, "discord");
  const startTime = Date.now();

  try {
    // Validate it's an Ethereum address
    if (!isEthAddress(query)) {
      await interaction.editReply({
        content: `Invalid token address format: \`${query}\`. Please provide a valid Ethereum contract address (0x...).`,
      });
      return;
    }

    const address = query.toLowerCase();

    // Check for Paragraph coin first (tokenized posts)
    const paragraphCoin = await getCoinByContract(address).catch(() => null);

    // Check for Base tokens (Rainbow, ApeStore, Fey, Paragraph, etc.)
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
            if (post.publicationSlug && post.slug) {
              paragraphPostUrl = `https://paragraph.com/@${post.publicationSlug}/${post.slug}`;
            } else if (post.publicationSlug) {
              paragraphPostUrl = `https://paragraph.com/@${post.publicationSlug}`;
            }

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
          console.warn(`[Token] Failed to fetch Paragraph post details:`, error);
        }
      }

      const { embed, components } = await buildBaseTokenEmbed(
        address,
        null,
        null,
        baseTokenData,
        factory,
        contractCreation?.contractCreator ?? null,
        contractCreation?.createdAt ?? null,
        contractCreation?.txHash ?? null,
        paragraphCoin ?? null,
        paragraphPostAuthor ?? undefined,
        paragraphPostUrl ?? undefined,
      );

      const responseTime = Date.now() - startTime;
      trackResponseTime(responseTime);
      trackSearch();

      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "token_base",
      });

      await interaction.editReply({
        embeds: [embed],
        components,
      });
      return;
    }

    // Check for multi-chain tokens (Mantle, BSC, Monad, etc.)
    let multiChainTokenData;
    try {
      multiChainTokenData = await fetchMultiChainTokenData(address);
    } catch (err) {
      console.error(`[Token] Multi-chain fetch failed for ${address}:`, err);
    }

    if (multiChainTokenData) {
      const chainIdLower = multiChainTokenData.chainId.toLowerCase();
      const isMonadTokenFromDexScreener = (
        multiChainTokenData.chainId === "5001" ||
        chainIdLower === "monad"
      );

      if (isMonadTokenFromDexScreener) {
        const { getContractCreation } = await import("../services/contractCreation");
        const { getTokenFactoryName } = await import("../services/baseFactories");

        const contractCreation = await getContractCreation(address, "monad").catch(() => null);
        let factoryName: string | null = null;
        if (contractCreation?.contractCreator) {
          factoryName = getTokenFactoryName(contractCreation.contractCreator);
        }

        const monadTokenData: import("../services/dexscreener").MultiChainTokenData = {
          ...multiChainTokenData,
          creatorAddress: contractCreation?.contractCreator ?? multiChainTokenData.creatorAddress ?? null,
          factoryName: factoryName ?? multiChainTokenData.factoryName ?? null,
          createdAt: contractCreation?.createdAt ?? multiChainTokenData.createdAt ?? null,
          creationTxHash: contractCreation?.txHash ?? multiChainTokenData.creationTxHash ?? null,
        };

        const { embed, components } = await buildMultiChainTokenEmbed(address, monadTokenData);

        const responseTime = Date.now() - startTime;
        trackResponseTime(responseTime);
        trackSearch();

        logger.search(query, "discord", userId, guildId, channelId, {
          success: true,
          type: "token_monad",
        });

        await interaction.editReply({
          embeds: [embed],
          components,
        });
        return;
      }

      // Only show other multi-chain tokens if it's NOT Base (Base tokens handled above)
      if (chainIdLower !== "base" && multiChainTokenData.chainId !== "8453") {
        const { embed, components } = await buildMultiChainTokenEmbed(address, multiChainTokenData);

        const responseTime = Date.now() - startTime;
        trackResponseTime(responseTime);
        trackSearch();

        logger.search(query, "discord", userId, guildId, channelId, {
          success: true,
          type: "token_multi_chain",
        });

        await interaction.editReply({
          embeds: [embed],
          components,
        });
        return;
      }
    }

    // If no token data found, check if it's a Clanker token
    const { fetchTokensByAddress } = await import("../services/clanker");
    const clankerTokens = await fetchTokensByAddress(address);
    
    if (clankerTokens.length > 0) {
      const firstToken = clankerTokens[0];
      const { resolveUserFromToken } = await import("../utils/clankerEmbeds");
      const { buildTokenEmbed } = await import("../utils/clankerEmbeds");
      const { splitEmbedIntoPages, buildPaginationButtons } = await import("../utils/pagination");
      const { storeEmbedForPagination } = await import("../handlers/pagination");
      
      const associatedUser = await Promise.race([
        resolveUserFromToken(firstToken),
        new Promise<import("@neynar/nodejs-sdk/build/api").User | null>((resolve) =>
          setTimeout(() => resolve(null), 3000)
        ),
      ]);

      const tokenEmbed = await buildTokenEmbed(firstToken, {
        farcasterUser: associatedUser ?? undefined,
      });

      const embeds = splitEmbedIntoPages(tokenEmbed, 15);
      const totalPages = embeds.length;
      const identifier = `clanker_token_${address}`;

      if (totalPages > 1) {
        storeEmbedForPagination(identifier, tokenEmbed);
      }

      const components: any[] = [];
      if (totalPages > 1) {
        components.push(...buildPaginationButtons(0, totalPages, identifier));
      }

      const responseTime = Date.now() - startTime;
      trackResponseTime(responseTime);
      trackSearch();

      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "token_clanker",
      });

      await interaction.editReply({
        embeds: [embeds[0]],
        components,
      });
      return;
    }

    // No token found
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
    trackSearch();

    logger.search(query, "discord", userId, guildId, channelId, {
      success: false,
      type: "token",
    });

    await interaction.editReply({
      content: `No token information found for contract address \`${query}\`.\n\nThis address may not be a token contract, or it may not be listed on supported exchanges.`,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
    trackSearch();

    logger.error(`Token command failed for ${query}`, error, {
      query,
      userId,
      guildId,
      channelId,
      platform: "discord",
    });

    logger.search(query, "discord", userId, guildId, channelId, {
      success: false,
      type: "token",
    });

    await interaction.editReply({
      content: `❌ An error occurred while looking up token \`${query}\`. Please try again.`,
    });
  }
}

