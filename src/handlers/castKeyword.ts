import { Message, ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "discord.js";
import type { Cast } from "@neynar/nodejs-sdk/build/api";
import { searchCastsByKeyword, NeynarLookupError } from "../services/neynar";
import { buildCastEmbed } from "./castLink";
import { buildPaginationButtons } from "../utils/pagination";
import { storeEmbedForPagination } from "./pagination";
import { buildCastUrl } from "../utils/farcasterLinks";

const CAST_KEYWORD_REGEX = /(?:^|\s)(?:cast|find)\s+([^\s]+)/i;

export async function handleCastKeywordMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const match = message.content.match(CAST_KEYWORD_REGEX);
  if (!match) {
    return false;
  }

  const keyword = match[1].trim();
  if (!keyword || keyword.length < 2) {
    return false;
  }

  try {
    // Search for casts: earliest first, then 2 most recent
    const { firstMatch, recent } = await searchCastsByKeyword(keyword, 2);
    
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
      await message.reply({
        content: `No casts found matching \`${keyword}\`.`,
      });
      return true;
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
          buildCastUrl(cast.author.username, cast.hash),
          {
            title: `🔹 Earliest cast mentioning "${keyword}"`,
            color: 0xfbbf24,
            variant: "full",
          },
        );
      }
      // Pages 2-3: Recent casts
      const recentIndex = index - (firstMatch ? 1 : 0);
      return buildCastEmbed(cast, buildCastUrl(cast.author.username, cast.hash), {
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

    await message.reply({
      embeds: [embeds[0]], // Show first page only
      components,
    });
    return true;
  } catch (error) {
    if (error instanceof NeynarLookupError) {
      console.warn("Neynar lookup error for cast keyword:", error.message);
      return false;
    }
    console.error("Unexpected error handling cast keyword:", error);
    return false;
  }
}

