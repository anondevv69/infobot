import { ButtonInteraction } from "discord.js";
import { splitEmbedIntoPages, buildPaginationButtons, type PageInfo } from "../utils/pagination";
import { EmbedBuilder } from "discord.js";

// Store for pagination data - maps identifier to embed fields
export const paginationStore = new Map<string, EmbedBuilder>();

// Helper to extract search query from identifier for friendly error messages
function extractSearchQuery(identifier: string): string | null {
  if (identifier.startsWith("cast_search_")) {
    return identifier.replace("cast_search_", "");
  }
  if (identifier.startsWith("farcaster_username_")) {
    return `@${identifier.replace("farcaster_username_", "")}`;
  }
  if (identifier.startsWith("farcaster_wallet_")) {
    return identifier.replace("farcaster_wallet_", "");
  }
  if (identifier.startsWith("farcaster_")) {
    // FID-based identifier, can't extract username easily
    return null;
  }
  if (identifier.startsWith("zora_coin_")) {
    return identifier.replace("zora_coin_", "");
  }
  if (identifier.startsWith("clanker_token_")) {
    return identifier.replace("clanker_token_", "");
  }
  if (identifier.startsWith("wallet_profile_")) {
    return identifier.replace("wallet_profile_", "");
  }
  if (identifier.startsWith("zora_wallet_")) {
    return identifier.replace("zora_wallet_", "");
  }
  if (identifier.startsWith("zora_profile_")) {
    return identifier.replace("zora_profile_", "");
  }
  return null;
}

// Helper to format friendly expiration message
function formatExpirationMessage(identifier: string): string {
  const query = extractSearchQuery(identifier);
  
  if (query) {
    if (identifier.startsWith("cast_search_")) {
      return `⏰ This search expired after a few minutes. Run \`/casts ${query}\` to search again!`;
    }
    if (identifier.startsWith("farcaster_username_")) {
      return `⏰ This search expired after a few minutes. Search for \`${query}\` again to see the results!`;
    }
    if (identifier.startsWith("zora_coin_") || identifier.startsWith("clanker_token_")) {
      return `⏰ This search expired after a few minutes. Paste \`${query}\` again to see the results!`;
    }
    if (identifier.startsWith("wallet_profile_") || identifier.startsWith("zora_wallet_") || identifier.startsWith("farcaster_wallet_")) {
      return `⏰ This search expired after a few minutes. Search for \`${query}\` again to see the results!`;
    }
    return `⏰ This search expired after a few minutes. Search for \`${query}\` again to see the results!`;
  }
  
  return "⏰ This search expired after a few minutes. Run your search again to see the results!";
}

export async function handleGeneralPagination(
  interaction: ButtonInteraction,
  page: number,
  identifier: string,
): Promise<void> {
  await interaction.deferUpdate();

  // Handle multi-page structures (Zora coin, Farcaster, Clanker token, Cast search, Wallet profile)
  if (identifier.startsWith("zora_coin_") || identifier.startsWith("farcaster_") || identifier.startsWith("clanker_token_") || identifier.startsWith("cast_search_") || identifier.startsWith("wallet_profile_") || identifier.startsWith("zora_wallet_")) {
    const page1Embed = paginationStore.get(identifier);
    if (!page1Embed) {
      await interaction.editReply({
        content: formatExpirationMessage(identifier),
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

    // Reconstruct page labels based on identifier pattern
    const pageLabels = getPageLabelsForIdentifier(identifier, totalPages, page2Embed, page3Embed);
    
    const components: typeof buildPaginationButtons extends (...args: any[]) => infer R ? R : never = [];
    if (totalPages > 1) {
      components.push(...buildPaginationButtons(page, totalPages, identifier, pageLabels));
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
      content: formatExpirationMessage(identifier),
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
  // Clean up after 1 hour (maximum storage time)
  setTimeout(() => {
    paginationStore.delete(identifier);
  }, 60 * 60 * 1000); // 1 hour
}

// Reconstruct page labels based on identifier and embed titles
function getPageLabelsForIdentifier(
  identifier: string,
  totalPages: number,
  page2Embed?: EmbedBuilder | null,
  page3Embed?: EmbedBuilder | null,
): PageInfo[] {
  const labels: PageInfo[] = [];
  
  if (identifier.startsWith("farcaster_")) {
    labels.push({ label: "Profile" });
    if (totalPages > 1) {
      const page2Title = page2Embed?.data.title ?? "";
      if (page2Title.includes("Clankers & Zora")) {
        labels.push({ label: "Clankers & Zora" });
      } else if (page2Title.includes("Clankers")) {
        labels.push({ label: "Clankers" });
      } else if (page2Title.includes("Zora")) {
        labels.push({ label: "Zora" });
      } else {
        labels.push({ label: "More Info" });
      }
    }
  } else if (identifier.startsWith("zora_coin_")) {
    labels.push({ label: "Coin Details" });
    if (totalPages > 1) {
      const page2Title = page2Embed?.data.title ?? "";
      if (page2Title.includes("Creator Coin & Farcaster")) {
        labels.push({ label: "Creator Coin & Farcaster" });
      } else if (page2Title.includes("Creator Coin")) {
        labels.push({ label: "Creator Coin" });
      } else if (page2Title.includes("Farcaster")) {
        labels.push({ label: "Farcaster Profile" });
      } else {
        labels.push({ label: "More Info" });
      }
    }
  } else if (identifier.startsWith("clanker_token_")) {
    labels.push({ label: "Token Details" });
    if (totalPages > 1) {
      labels.push({ label: "Dev Profile" });
    }
    if (totalPages > 2) {
      labels.push({ label: "Zora" });
    }
  } else if (identifier.startsWith("cast_search_")) {
    labels.push({ label: "Earliest Cast" });
    if (totalPages > 1) {
      labels.push({ label: "Recent Cast #1" });
    }
    if (totalPages > 2) {
      labels.push({ label: "Recent Cast #2" });
    }
  } else if (identifier.startsWith("wallet_profile_")) {
    labels.push({ label: "Profile" });
    if (totalPages > 1) {
      const page2Title = page2Embed?.data.title ?? "";
      if (page2Title.includes("Clankers & Zora")) {
        labels.push({ label: "Clankers & Zora" });
      } else if (page2Title.includes("Clankers")) {
        labels.push({ label: "Clankers" });
      } else if (page2Title.includes("Zora")) {
        labels.push({ label: "Zora" });
      } else {
        labels.push({ label: "More Info" });
      }
    }
  } else if (identifier.startsWith("zora_wallet_") || identifier.startsWith("zora_profile_")) {
    labels.push({ label: "Profile" });
    for (let i = 1; i < totalPages; i++) {
      labels.push({ label: `Page ${i + 1}` });
    }
  } else {
    // Generic fallback
    for (let i = 0; i < totalPages; i++) {
      labels.push({ label: `Page ${i + 1}` });
    }
  }
  
  return labels;
}

