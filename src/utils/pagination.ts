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

export function buildPaginationButtons(
  page: number,
  totalPages: number,
  identifier: string,
): ActionRowBuilder<ButtonBuilder>[] {
  if (totalPages <= 1) {
    return [];
  }

  const row = new ActionRowBuilder<ButtonBuilder>();
  const encodedId = Buffer.from(identifier).toString("base64url");

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`page_${page - 1}|${encodedId}`)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`page_${page + 1}|${encodedId}`)
      .setLabel("Next ▶")
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
      .setFooter(i === totalPages - 1 ? (embed.data.footer ? { text: embed.data.footer.text, iconURL: embed.data.footer.icon_url ?? undefined } : null) : null)
      .addFields(pageFields);

    pages.push(pageEmbed);
  }

  return pages;
}

