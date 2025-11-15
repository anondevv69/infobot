import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js";
import type { Cast } from "@neynar/nodejs-sdk/build/api";
import {
  buildCastEmbed,
  CastEmbedOptions,
} from "../handlers/castLink";
import {
  searchCastsByKeyword,
  NeynarLookupError,
} from "../services/neynar";
import { buildPaginationButtons } from "../utils/pagination";
import { storeEmbedForPagination } from "../handlers/pagination";

const MAX_RECENT_RESULTS = 5;

export async function handleCastsCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const keyword = interaction.options.getString("keyword", true).trim();
  const recentCount =
    interaction.options.getInteger("recent_count") ?? 2;

  if (!keyword) {
    await interaction.reply({
      content: "Please provide a keyword to search for.",
    });
    return;
  }

  const boundedRecentCount = Math.max(
    0,
    Math.min(recentCount, MAX_RECENT_RESULTS),
  );

  await interaction.deferReply();

  try {
    const { firstMatch, recent } = await searchCastsByKeyword(
      keyword,
      boundedRecentCount,
    );

    if (!firstMatch && recent.length === 0) {
      await interaction.editReply({
        content: `No casts found matching \`${keyword}\`. Try a different keyword or broaden your search.`,
      });
      return;
    }

    // Order: earliest first, then 2 most recent (max 3 pages)
    const castsToShow: Cast[] = [];
    
    // Page 1: Earliest cast (firstMatch)
    if (firstMatch) {
      castsToShow.push(firstMatch);
    }
    
    // Pages 2-3: 2 most recent casts
    const recentToShow = recent.slice(0, 2);
    castsToShow.push(...recentToShow);

    if (castsToShow.length === 0) {
      await interaction.editReply({
        content: `No casts found matching \`${keyword}\`. Try a different keyword or broaden your search.`,
      });
      return;
    }

    const totalPages = castsToShow.length;
    const identifier = `cast_search_${keyword}`;

    // Build embeds for each cast (one per page)
    // Page 1 = earliest, Pages 2-3 = most recent
    const embeds: EmbedBuilder[] = castsToShow.map((cast, index) => {
      if (index === 0 && firstMatch && cast.hash === firstMatch.hash) {
        // Page 1: Earliest cast (highlighted)
        return buildCastEmbed(
          cast,
          canonicalCastUrl(cast),
          highlightOptions(`Earliest cast mentioning "${keyword}"`),
        );
      }
      // Pages 2-3: Recent casts
      const recentIndex = index - (firstMatch ? 1 : 0);
      return buildCastEmbed(cast, canonicalCastUrl(cast), {
        title: `Recent cast #${recentIndex + 1} mentioning "${keyword}"`,
        color: 0x4338ca,
        footer: `Matched keyword: ${keyword}`,
        variant: "compact",
      });
    });

    // Store all embeds for pagination
    embeds.forEach((embed, index) => {
      if (index === 0) {
        storeEmbedForPagination(identifier, embed);
      } else {
        storeEmbedForPagination(`${identifier}_page${index + 1}`, embed);
      }
    });

    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    if (totalPages > 1) {
      // Create page labels for descriptive buttons
      const pageLabels = [
        { label: "Earliest Cast" }, // Page 1
        { label: "Recent Cast #1" }, // Page 2
        { label: "Recent Cast #2" }, // Page 3
      ].slice(0, totalPages);
      components.push(...buildPaginationButtons(0, totalPages, identifier, pageLabels));
    }

    await interaction.editReply({ 
      embeds: [embeds[0]], // Show first page only
      components,
    });
  } catch (error) {
    const message =
      error instanceof NeynarLookupError
        ? error.message
        : "Unexpected error while searching casts.";
    await interaction.editReply({
      content: `${message} Please try again later.`,
    });
  }
}

function canonicalCastUrl(cast: Cast): string {
  const username = cast.author.username;
  const hash = cast.hash;
  return `https://warpcast.com/${username}/${hash}`;
}

function highlightOptions(title: string): CastEmbedOptions {
  return {
    title: `🔹 ${title}`,
    color: 0xfbbf24,
    variant: "full",
  };
}

