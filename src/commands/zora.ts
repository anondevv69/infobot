import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { findBestZoraSummary, fetchZoraCoin } from "../services/zora";
import { buildZoraProfileEmbed, buildZoraCoinEmbed, appendZoraSummaryFields, buildCreatorCoinField } from "../utils/zoraEmbeds";
import { isEthAddress } from "../utils/address";
import { splitEmbedIntoPages, buildPaginationButtons } from "../utils/pagination";
import { storeEmbedForPagination } from "../handlers/pagination";

const BASE_CHAIN_ID = 8453;

export async function handleZoraProfileCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const rawQuery = interaction.options.getString("query", true).trim();
  if (!rawQuery) {
    await interaction.reply({
      content: "Please provide a contract address or Zora handle.",
    });
    return;
  }

  await interaction.deferReply();

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

  // Show profile with coins - merge into single embed with pagination
  const profileEmbed = buildZoraProfileEmbed(summary);
  await appendZoraSummaryFields(profileEmbed, summary);

  // Split into pages if needed
  const embeds = splitEmbedIntoPages(profileEmbed, 15);
  const totalPages = embeds.length;
  const identifier = `zora_profile_${normalized}`;

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

  // Merge creator coin into the coin embed if available
  if (summary?.profile?.creatorCoinAddress && summary.profile.creatorCoinAddress.toLowerCase() !== coin.address.toLowerCase()) {
    const creatorCoinField = buildCreatorCoinField(summary.profile, false, null);
    if (creatorCoinField) {
      coinEmbed.addFields(creatorCoinField);
    }
  }

  // Split into pages if needed
  const embeds = splitEmbedIntoPages(coinEmbed, 15);
  const totalPages = embeds.length;
  const identifier = `zora_coin_${address}`;

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
}
