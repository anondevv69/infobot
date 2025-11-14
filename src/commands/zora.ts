import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { findBestZoraSummary, fetchZoraCoin } from "../services/zora";
import { buildZoraProfileEmbed, buildZoraCoinEmbed } from "../utils/zoraEmbeds";
import { buildZoraPresentation } from "../utils/zoraPresentation";
import { isEthAddress } from "../utils/address";

const BASE_CHAIN_ID = 8453;

export async function handleZoraProfileCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const rawQuery = interaction.options.getString("query", true).trim();
  if (!rawQuery) {
    await interaction.reply({
      content: "Please provide a contract address or Zora handle.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Check if it's a contract address (Zora coin or creator coin)
  if (isEthAddress(rawQuery)) {
    await replyWithCoin(interaction, rawQuery);
    return;
  }

  // Try as Zora handle/username
  const normalized = rawQuery.replace(/^@/, "").toLowerCase();
  const summary =
    (await findBestZoraSummary([normalized])) ??
    (await findBestZoraSummary([`${normalized}.eth`])) ??
    (await findBestZoraSummary([`${normalized}.xyz`])) ??
    (await findBestZoraSummary([`@${normalized}`]));

  if (!summary) {
    await interaction.editReply({
      content: `No Zora profile or coin found for \`${rawQuery}\``,
    });
    return;
  }

  // Check if they're searching for a specific creator coin
  const creatorCoinAddress = summary.profile?.creatorCoinAddress;
  if (creatorCoinAddress) {
    // Try to fetch the creator coin
    const creatorCoin = await fetchZoraCoin(creatorCoinAddress, BASE_CHAIN_ID);
    if (creatorCoin) {
      const coinSummary = {
        coin: creatorCoin,
        isCreatorCoin: true,
        source: "direct" as const,
      };
      const coinEmbed = buildZoraCoinEmbed(coinSummary, {
        title: "Creator Coin",
        profile: summary.profile,
        creatorCoin: creatorCoin,
      });
      await interaction.editReply({
        embeds: [coinEmbed],
      });
      return;
    }
  }

  // Show profile with coins
  const profileEmbed = buildZoraProfileEmbed(summary);
  const coinEmbeds = await buildZoraPresentation(summary, {
    includeLatest: true,
    includeCreatorCoin: true,
  });

  await interaction.editReply({
    embeds: [profileEmbed, ...coinEmbeds],
  });
}

async function replyWithCoin(
  interaction: ChatInputCommandInteraction,
  address: string,
): Promise<void> {
  const coin = await fetchZoraCoin(address, BASE_CHAIN_ID);
  if (!coin) {
    await interaction.editReply({
      content: `No Zora coin found for address \`${address}\``,
    });
    return;
  }

  const summary = await findBestZoraSummary([
    coin.creatorProfile?.handle ?? "",
    coin.creatorAddress ?? "",
  ].filter(Boolean));

  const coinEmbed = buildZoraCoinEmbed(
    {
      coin,
      isCreatorCoin:
        summary?.profile?.creatorCoinAddress?.toLowerCase() === coin.address.toLowerCase(),
      source: "direct",
    },
    {
      title: "Zora Coin Lookup",
      profile: summary?.profile ?? null,
    },
  );

  const extraEmbeds = await buildZoraPresentation(summary, {
    includeLatest: false,
    includeCreatorCoin: true,
    excludeAddresses: [coin.address],
  });

  await interaction.editReply({
    embeds: [coinEmbed, ...extraEmbeds],
  });
}
