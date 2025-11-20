import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";

export interface PaginatedEmbedOptions {
  embeds: EmbedBuilder[];
  page: number;
  totalPages: number;
  identifier: string;
}

export interface PageInfo {
  label: string; // e.g., "Clankers & Zora", "Dev Profile", "Zora Creator"
}

export function buildPaginationButtons(
  page: number,
  totalPages: number,
  identifier: string,
  pageLabels?: PageInfo[], // Optional labels for each page
): ActionRowBuilder<ButtonBuilder>[] {
  if (totalPages <= 1) {
    return [];
  }

  const row = new ActionRowBuilder<ButtonBuilder>();
  const encodedId = Buffer.from(identifier).toString("base64url");

  // Determine button labels based on page content
  let prevLabel = "◀ Previous";
  let nextLabel = "Next ▶";

  if (pageLabels && pageLabels.length > 0) {
    if (page > 0 && pageLabels[page - 1]) {
      prevLabel = `◀ ${pageLabels[page - 1].label}`;
    }
    if (page < totalPages - 1 && pageLabels[page + 1]) {
      nextLabel = `${pageLabels[page + 1].label} ▶`;
    }
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`page_${page - 1}|${encodedId}`)
      .setLabel(prevLabel)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`page_${page + 1}|${encodedId}`)
      .setLabel(nextLabel)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );

  return [row];
}

export function parsePaginationButton(customId: string): {
  page: number;
  identifier: string;
} | null {
  const match = customId.match(/^page_(-?\d+)\|(.+)$/);
  if (match) {
    const page = parseInt(match[1], 10);
    const encodedId = match[2];
    try {
      const identifier = Buffer.from(encodedId, "base64url").toString("utf-8");
      if (!isNaN(page)) {
        return { page, identifier };
      }
    } catch (error) {
      console.warn("Failed to decode pagination identifier:", error);
    }
  }
  return null;
}

/**
 * Splits an embed into multiple pages if it has too many fields.
 * Discord limit is 25 fields per embed.
 */
export function splitEmbedIntoPages(
  embed: EmbedBuilder,
  maxFieldsPerPage = 15,
): EmbedBuilder[] {
  const fields = embed.data.fields ?? [];
  if (fields.length <= maxFieldsPerPage) {
    return [embed];
  }

  const pages: EmbedBuilder[] = [];
  const totalPages = Math.ceil(fields.length / maxFieldsPerPage);

  for (let i = 0; i < totalPages; i++) {
    const startIdx = i * maxFieldsPerPage;
    const endIdx = Math.min(startIdx + maxFieldsPerPage, fields.length);
    const pageFields = fields.slice(startIdx, endIdx);

    const pageEmbed = new EmbedBuilder()
      .setColor(embed.data.color ?? null)
      .setTitle(embed.data.title ? `${embed.data.title} (Page ${i + 1}/${totalPages})` : null)
      .setDescription(i === 0 ? embed.data.description ?? null : null)
      .setThumbnail(i === 0 ? embed.data.thumbnail?.url ?? null : null)
      .setURL(i === 0 ? embed.data.url ?? null : null)
      // Preserve footer on all pages (branding should be on all pages)
      .setFooter(embed.data.footer ? { text: embed.data.footer.text, iconURL: embed.data.footer.icon_url ?? undefined } : null)
      .addFields(pageFields);

    pages.push(pageEmbed);
  }

  return pages;
}

