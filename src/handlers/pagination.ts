import { ButtonInteraction, MessageFlags } from "discord.js";
import { splitEmbedIntoPages, buildPaginationButtons } from "../utils/pagination";
import { EmbedBuilder } from "discord.js";

// Store for pagination data - maps identifier to embed fields
const paginationStore = new Map<string, EmbedBuilder>();

export async function handleGeneralPagination(
  interaction: ButtonInteraction,
  page: number,
  identifier: string,
): Promise<void> {
  await interaction.deferUpdate();

  // Handle multi-page structures (Zora coin, Farcaster, Clanker token, Cast search)
  if (identifier.startsWith("zora_coin_") || identifier.startsWith("farcaster_") || identifier.startsWith("clanker_token_") || identifier.startsWith("cast_search_")) {
    const page1Embed = paginationStore.get(identifier);
    if (!page1Embed) {
      await interaction.editReply({
        content: "Pagination data expired. Please run the command again.",
        embeds: [],
        components: [],
      });
      return;
    }

    // Determine total pages by checking for additional pages
    let totalPages = 1;
    const page2Embed = paginationStore.get(`${identifier}_page2`);
    const page3Embed = paginationStore.get(`${identifier}_page3`);
    
    if (page3Embed) {
      totalPages = 3;
    } else if (page2Embed) {
      totalPages = 2;
    }
    
    if (page < 0 || page >= totalPages) {
      await interaction.editReply({
        content: "Invalid page number.",
        embeds: [],
        components: [],
      });
      return;
    }

    // Get the embed for the requested page
    let embedToShow: EmbedBuilder | null = null;
    if (page === 0) {
      embedToShow = page1Embed;
    } else if (page === 1) {
      embedToShow = page2Embed ?? null;
    } else if (page === 2) {
      embedToShow = page3Embed ?? null;
    }

    if (!embedToShow) {
      await interaction.editReply({
        content: "Page not found.",
        embeds: [],
        components: [],
      });
      return;
    }

    const components: typeof buildPaginationButtons extends (...args: any[]) => infer R ? R : never = [];
    if (totalPages > 1) {
      components.push(...buildPaginationButtons(page, totalPages, identifier));
    }

    await interaction.editReply({
      embeds: [embedToShow],
      components,
    });
    return;
  }

  // Default behavior: split embed into pages by field count
  const storedEmbed = paginationStore.get(identifier);
  
  if (!storedEmbed) {
    await interaction.editReply({
      content: "Pagination data expired. Please run the command again.",
      embeds: [],
      components: [],
    });
    return;
  }

  const embeds = splitEmbedIntoPages(storedEmbed, 15);
  const totalPages = embeds.length;
  
  if (page < 0 || page >= totalPages) {
    await interaction.editReply({
      content: "Invalid page number.",
      embeds: [],
      components: [],
    });
    return;
  }

  const components: typeof buildPaginationButtons extends (...args: any[]) => infer R ? R : never = [];
  if (totalPages > 1) {
    components.push(...buildPaginationButtons(page, totalPages, identifier));
  }

  await interaction.editReply({
    embeds: [embeds[page]],
    components,
  });
}

// Helper to store embed for pagination
export function storeEmbedForPagination(identifier: string, embed: EmbedBuilder): void {
  paginationStore.set(identifier, embed);
  // Clean up after 5 minutes
  setTimeout(() => {
    paginationStore.delete(identifier);
  }, 5 * 60 * 1000);
}

