import { Message, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { findBestZoraSummary } from "../services/zora";
import { buildZoraProfileEmbed, appendZoraSummaryFields } from "../utils/zoraEmbeds";
import { splitEmbedIntoPages, buildPaginationButtons } from "../utils/pagination";
import { storeEmbedForPagination } from "./pagination";

const ZORA_PROFILE_REGEX = /https:\/\/zora\.co\/@([a-z0-9_.-]+)/gi;

export async function handleZoraProfileMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const matches = [...message.content.matchAll(ZORA_PROFILE_REGEX)];
  if (matches.length === 0) {
    return false;
  }

  const seen = new Set<string>();
  for (const match of matches) {
    const username = match[1].toLowerCase();
    if (seen.has(username)) {
      continue;
    }
    seen.add(username);

    const summary = await findBestZoraSummary([username, `@${username}`]);
    if (!summary) {
      continue;
    }

    const profileEmbed = buildZoraProfileEmbed(summary);
    // Append Zora summary fields (creator coin, latest coin) directly to profile embed
    await appendZoraSummaryFields(profileEmbed, summary);

    // Split into pages if needed
    const embeds = splitEmbedIntoPages(profileEmbed, 15);
    const totalPages = embeds.length;
    const identifier = `zora_profile_${username}`;

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

  return false;
}
