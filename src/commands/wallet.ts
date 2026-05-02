import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { isEthAddress, isSolAddress } from "../utils/address";
import { lookupAddress } from "../services/addressLookup";
import { trackUser, trackSearch, trackResponseTime } from "../utils/botStats";
import { logger } from "../utils/logger";
import { applyBranding } from "../utils/branding";
import { findUserByWallet } from "../services/neynar";
import { findBestZoraSummary } from "../services/zora";
import { collectZoraIdentifiers } from "../utils/zoraPresentation";
import { safeFetchTokensByFid } from "../utils/farcasterHelpers";
import { buildWalletProfileResponse } from "../utils/walletEmbed";

/**
 * Wallet command - searches across all EVM chains to determine what an address is
 */
export async function handleWalletCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const query = interaction.options.getString("query", true).trim();
  const userId = interaction.user.id;
  const guildId = interaction.guildId || undefined;
  const channelId = interaction.channelId;

  trackUser(userId, "discord");
  const startTime = Date.now();

  try {
    // Validate address format
    if (!isEthAddress(query) && !isSolAddress(query)) {
      await interaction.editReply({
        content: `Invalid address format: \`${query}\`. Please provide a valid Ethereum (0x...), Base, Monad, or Solana address.`,
      });
      return;
    }

    // For Solana addresses, use search command handler (it handles Solana better)
    if (isSolAddress(query)) {
      const { handleSearchCommand } = await import("./search");
      await handleSearchCommand(interaction);
      return;
    }

    const address = query.toLowerCase();

    // PRIORITY 1: Check for Farcaster user by wallet
    const user = await findUserByWallet(address).catch(() => null);
    
    // PRIORITY 2: Check for Zora profile
    const [zoraSummaryFromAddress, paragraphUser] = await Promise.all([
      findBestZoraSummary([address]).catch(() => null),
      import("../services/paragraph").then(m => m.getUserByWallet(address)).catch(() => null),
    ]);

    // If no user found but Zora has Farcaster handle, try that lookup
    let finalUser = user;
    if (!finalUser && zoraSummaryFromAddress?.profile?.farcasterHandle) {
      try {
        const { findUserByUsername } = await import("../services/neynar");
        const handle = zoraSummaryFromAddress.profile.farcasterHandle.replace(/^@/, "");
        finalUser = await Promise.race([
          findUserByUsername(handle),
          new Promise<import("@neynar/nodejs-sdk/build/api").User | null>((resolve) =>
            setTimeout(() => resolve(null), 3000)
          ),
        ]);
      } catch (error) {
        console.warn("Failed to resolve user from Zora Farcaster handle:", error);
      }
    }

    // If we found a Farcaster user, show Farcaster profile
    if (finalUser) {
      const { safeFetchTokensByFid, safeFetchMostRecentCast } = await import("../utils/farcasterHelpers");
      const { isSummaryAssociatedWithUser } = await import("../utils/zoraAssociation");
      
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

      const responseTime = Date.now() - startTime;
      trackResponseTime(responseTime);
      trackSearch();

      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "wallet_farcaster",
      });

      await interaction.editReply({
        embeds: walletResponse.embeds,
        components: walletResponse.components,
      });
      return;
    }

    // PRIORITY 3: Check for Zora profile (without Farcaster)
    if (zoraSummaryFromAddress) {
      const { isSummaryAssociatedWithAddress, shouldShowZoraFallback } = await import("../utils/zoraAssociation");
      
      if (isSummaryAssociatedWithAddress(zoraSummaryFromAddress, address) && shouldShowZoraFallback(zoraSummaryFromAddress)) {
        const { buildZoraWalletProfileResponse } = await import("../utils/walletEmbed");
        const { buildFarcasterPresentation } = await import("../utils/farcasterPresentation");
        const { findUserByUsername } = await import("../services/neynar");
        const { safeFetchTokensByFid, safeFetchMostRecentCast } = await import("../utils/farcasterHelpers");
        
        // If Zora profile has a Farcaster handle, fetch and display the Farcaster profile
        let farcasterEmbeds: Awaited<ReturnType<typeof buildFarcasterPresentation>> | null = null;
        const farcasterHandle = zoraSummaryFromAddress.profile.farcasterHandle;
        
        if (farcasterHandle) {
          try {
            const farcasterUser = await findUserByUsername(farcasterHandle.replace(/^@/, ""));
            if (farcasterUser) {
              const [tokens, latestCast] = await Promise.all([
                safeFetchTokensByFid(farcasterUser.fid),
                safeFetchMostRecentCast(farcasterUser.fid),
              ]);
              
              farcasterEmbeds = await buildFarcasterPresentation(farcasterUser, {
                tokens,
                latestCast,
                zoraSummary: zoraSummaryFromAddress,
                titleSuffix: "Farcaster Profile",
              });
            }
          } catch (error) {
            console.warn("Failed to fetch Farcaster profile for Zora fallback:", error);
          }
        }

        if (farcasterEmbeds) {
          const responseTime = Date.now() - startTime;
          trackResponseTime(responseTime);
          trackSearch();

          logger.search(query, "discord", userId, guildId, channelId, {
            success: true,
            type: "wallet_farcaster_via_zora",
          });

          await interaction.editReply({
            embeds: farcasterEmbeds.embeds,
            components: farcasterEmbeds.components ?? [],
          });
          return;
        } else {
          const zoraResponse = buildZoraWalletProfileResponse({
            wallet: address,
            summary: zoraSummaryFromAddress,
          });

          const responseTime = Date.now() - startTime;
          trackResponseTime(responseTime);
          trackSearch();

          logger.search(query, "discord", userId, guildId, channelId, {
            success: true,
            type: "wallet_zora_profile",
          });

          await interaction.editReply({
            embeds: zoraResponse.embeds,
            components: zoraResponse.components ?? [],
          });
          return;
        }
      }
    }

    // PRIORITY 4: Fallback to multi-chain wallet information
    const addressInfo = await lookupAddress(address);

    if (!addressInfo || addressInfo.length === 0) {
      await interaction.editReply({
        content: `No Farcaster profile, Zora account, or activity found for address \`${query}\` on any supported EVM chain (Ethereum, Base, Monad).`,
      });
      return;
    }

    // Add multi-chain address information
    const addressEmbed = new EmbedBuilder()
      .setTitle("🌐 Multi-Chain Address Information")
      .setColor(0x00d4ff)
      .setDescription(`Address \`${query}\` found on ${addressInfo.length} chain(s):`);

    for (const info of addressInfo) {
      const fields: string[] = [];
      fields.push(`**Chain:** ${info.chainName}`);
      if (info.isContract !== undefined) {
        fields.push(`**Type:** ${info.isContract ? "📄 Contract" : "👤 Wallet"}`);
      }
      if (info.balance) {
        fields.push(`**Balance:** ${info.balance}`);
      }
      if (info.transactionCount !== undefined && info.transactionCount !== null) {
        fields.push(`**Transactions:** ${info.transactionCount.toLocaleString()}`);
      }
      fields.push(`**Explorer:** [View on ${info.chainName === "Monad" ? "MonadScan" : info.chainName === "Base" ? "Basescan" : "Etherscan"}](${info.explorerUrl})`);

      addressEmbed.addFields({
        name: `${info.chainName} ${info.isContract ? "📄" : "👤"}`,
        value: fields.join("\n"),
        inline: true,
      });
    }

    applyBranding(addressEmbed, "wallet lookup");

    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
    trackSearch();

    logger.search(query, "discord", userId, guildId, channelId, {
      success: true,
      type: "wallet_multi_chain",
    });

    await interaction.editReply({
      embeds: [addressEmbed],
      components: [],
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
    trackSearch();

    logger.error(`Wallet command failed for ${query}`, error, {
      query,
      userId,
      guildId,
      channelId,
      platform: "discord",
    });

    logger.search(query, "discord", userId, guildId, channelId, {
      success: false,
      type: "wallet",
    });

    await interaction.editReply({
      content: `❌ An error occurred while searching for wallet \`${query}\`. Please try again.`,
    });
  }
}

