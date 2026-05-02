import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { findUserByUsername, findUserByWallet } from "../services/neynar";
import { isEthAddress, isSolAddress } from "../utils/address";
import { buildFarcasterPresentation } from "../utils/farcasterPresentation";
import { buildWalletProfileResponse } from "../utils/walletEmbed";
import { safeFetchTokensByFid, safeFetchMostRecentCast } from "../utils/farcasterHelpers";
import { collectZoraIdentifiers } from "../utils/zoraPresentation";
import { findBestZoraSummary } from "../services/zora";
import { isSummaryAssociatedWithUser } from "../utils/zoraAssociation";
import { trackUser, trackSearch, trackResponseTime } from "../utils/botStats";
import { logger } from "../utils/logger";

export async function handleFarCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const query = interaction.options.getString("query", true).trim();
  const userId = interaction.user.id;
  const guildId = interaction.guildId || undefined;
  const channelId = interaction.channelId;

  trackUser(userId, "discord");
  const startTime = Date.now();

  try {
    // Try as wallet address first
    if (isEthAddress(query) || isSolAddress(query)) {
      const user = await findUserByWallet(query);
      if (user) {
        const [tokens, latestCast, zoraSummary, paragraphUser] = await Promise.all([
          safeFetchTokensByFid(user.fid),
          safeFetchMostRecentCast(user.fid),
          findBestZoraSummary(collectZoraIdentifiers(user)),
          import("../services/paragraph").then(m => m.getUserByWallet(query)).catch(() => null),
        ]);
        const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;

        const walletResponse = await buildWalletProfileResponse({
          wallet: query,
          user,
          zoraSummary: associatedSummary,
          clankerTokens: tokens,
          latestCast,
          paragraphUser: paragraphUser ?? undefined,
        });

        const responseTime = Date.now() - startTime;
        trackResponseTime(responseTime);
        trackSearch();

        logger.search(query, "discord", userId, guildId, channelId, {
          success: true,
          type: "farcaster_wallet",
        });

        await interaction.editReply({
          embeds: walletResponse.embeds,
          components: walletResponse.components,
        });
        return;
      }
    }

    // Try as Farcaster username (with or without @)
    const normalizedUsername = query.replace(/^@/, "").toLowerCase();
    const user = await findUserByUsername(normalizedUsername);
    
    if (user) {
      const [tokens, latestCast, zoraSummary] = await Promise.all([
        safeFetchTokensByFid(user.fid),
        safeFetchMostRecentCast(user.fid),
        findBestZoraSummary(collectZoraIdentifiers(user)),
      ]);
      const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;

      const presentation = await buildFarcasterPresentation(user, {
        tokens,
        zoraSummary: associatedSummary,
        latestCast,
        titleSuffix: "Farcaster Search",
      });

      const responseTime = Date.now() - startTime;
      trackResponseTime(responseTime);
      trackSearch();

      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "farcaster",
      });

      await interaction.editReply({
        embeds: presentation.embeds,
        components: presentation.components,
      });
      return;
    }

    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
    trackSearch();

    logger.search(query, "discord", userId, guildId, channelId, {
      success: false,
      type: "farcaster",
    });

    await interaction.editReply({
      content: `No Farcaster profile found for \`${query}\`.`,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
    trackSearch();

    logger.search(query, "discord", userId, guildId, channelId, {
      success: false,
      type: "farcaster",
    });

    await interaction.editReply({
      content: `Error searching for Farcaster profile: \`${query}\`.`,
    });
  }
}

