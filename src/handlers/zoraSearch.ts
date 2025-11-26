import { Message, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { isEthAddress } from "../utils/address";
import { findBestZoraSummary, fetchZoraCoin } from "../services/zora";
import { buildZoraProfileEmbed, appendZoraSummaryFields } from "../utils/zoraEmbeds";
import { buildZoraCoinResponse } from "./zoraAddress";
import { buildZoraWalletProfileResponse } from "../utils/walletEmbed";
import { isSummaryAssociatedWithAddress } from "../utils/zoraAssociation";
import { splitEmbedIntoPages, buildPaginationButtons } from "../utils/pagination";
import { storeEmbedForPagination } from "./pagination";

const ZORA_SEARCH_REGEX = /(?:^|\s)zora\s+(.+)/i;

export async function handleZoraSearchMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const match = message.content.match(ZORA_SEARCH_REGEX);
  if (!match) {
    return false;
  }

  const query = match[1].trim();
  if (!query || query.length < 1) {
    return false;
  }

  try {
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
        });

        await message.reply({
          embeds: zoraResponse.embeds,
          components: zoraResponse.components,
        });
        return true;
      }
    }

    // Try as contract address
    if (isEthAddress(query)) {
      const coin = await fetchZoraCoin(query);
      if (coin) {
        const zoraSummary = await findBestZoraSummary([query.toLowerCase()]);
        const response = await buildZoraCoinResponse(coin, zoraSummary);
        await message.reply(response);
        return true;
      }
    }

    // Try as Zora profile (username/handle)
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
      const identifier = `zora_search_${normalizedQuery}`;

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

      await message.reply({
        embeds: [embeds[0]],
        components,
      });
      return true;
    }

    await message.reply({
      content: `No Zora profile or contract found for \`${query}\`.`,
    });
    return true;
  } catch (error) {
    console.error("Error handling zora search:", error);
    await message.reply({
      content: `Error searching for Zora profile: \`${query}\`.`,
    });
    return true;
  }
}
















