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

  await interaction.deferReply();

  try {
    // Validate address format
    if (!isEthAddress(query) && !isSolAddress(query)) {
      await interaction.editReply({
        content: `Invalid address format: \`${query}\`. Please provide a valid Ethereum (0x...) or Solana address.`,
      });
      return;
    }

    // Lookup address across all EVM chains
    const addressInfo = await lookupAddress(query);

    if (!addressInfo || addressInfo.length === 0) {
      await interaction.editReply({
        content: `No activity found for address \`${query}\` on any supported chain (Ethereum, Base, Monad).`,
      });
      return;
    }

    // Check for Farcaster user by wallet
    const farcasterUser = await findUserByWallet(query).catch(() => null);
    
    // Get Zora summary if available
    const zoraSummary = farcasterUser
      ? await findBestZoraSummary(collectZoraIdentifiers(farcasterUser, query)).catch(() => null)
      : await findBestZoraSummary([query]).catch(() => null);

    // Get Clanker tokens if available
    const clankerTokens = farcasterUser
      ? await safeFetchTokensByFid(farcasterUser.fid).catch(() => [])
      : [];

    // Build comprehensive wallet profile (only if we have a Farcaster user)
    let walletResponse: { embeds: EmbedBuilder[]; components: any[] } | null = null;
    if (farcasterUser) {
      walletResponse = await buildWalletProfileResponse({
        wallet: query,
        user: farcasterUser,
        zoraSummary: zoraSummary ?? undefined,
        clankerTokens,
        latestCast: undefined,
        paragraphUser: undefined,
      });
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

    // Combine wallet profile with address info (if we have a wallet profile)
    const allEmbeds = walletResponse ? [...walletResponse.embeds, addressEmbed] : [addressEmbed];
    const components = walletResponse?.components ?? [];

    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
    trackSearch();

    logger.search(query, "discord", userId, guildId, channelId, {
      success: true,
      type: "wallet_multi_chain",
    });

    await interaction.editReply({
      embeds: allEmbeds,
      components,
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

