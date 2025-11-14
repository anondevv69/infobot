import { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "discord.js";
import type { User } from "@neynar/nodejs-sdk/build/api";
import type { ClankerToken } from "../services/clanker";
import type { Cast } from "@neynar/nodejs-sdk/build/api";
import {
  buildTokenDetailRows,
  buildUserClankerEmbed,
  ClankerDisplayEntry,
  getClankerDisplayEntries,
  formatClankerTokenDetails,
  formatRecentCastSummary,
} from "./clankerEmbeds";
import { splitClankerTokens } from "./clankerAssociation";
import { applyBranding } from "./branding";
import type { ZoraLookupResult } from "../services/zora";
import { appendZoraSummaryFields } from "./zoraEmbeds";
import { splitEmbedIntoPages, buildPaginationButtons } from "./pagination";
import { storeEmbedForPagination } from "../handlers/pagination";

export interface BuildFarcasterPresentationOptions {
  tokens?: ClankerToken[];
  zoraSummary?: ZoraLookupResult | null;
  latestCast?: Cast | null;
  titleSuffix?: string;
  includeButtons?: boolean;
}

export interface FarcasterPresentationResult {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  tokens: ClankerToken[];
  clankerEntries: ClankerDisplayEntry[];
}

export async function buildFarcasterPresentation(
  user: User,
  options?: BuildFarcasterPresentationOptions,
): Promise<FarcasterPresentationResult> {
  const tokens = options?.tokens ?? [];
  const latestCast = options?.latestCast ?? null;

  const { deployed } = splitClankerTokens(tokens, user);

  // Page 1: Farcaster info, wallets, recent cast (without Clankers and Zora)
  const { embed: page1Embed, clankerEntries } = buildUserClankerEmbed(
    user,
    options?.titleSuffix ?? "Farcaster Profile",
    undefined, // Don't include clankers on page 1
  );

  // Add latest cast if available
  if (latestCast) {
    page1Embed.addFields({
      name: "Most Recent Cast",
      value: formatRecentCastSummary(latestCast),
      inline: false,
    });
  }

  applyBranding(page1Embed, "farcaster lookup");

  const embeds: EmbedBuilder[] = [page1Embed];
  let totalPages = 1;

  // Page 2: Clanker coin details (first and recent) + Zora info (if available)
  const hasClankers = deployed.length > 0;
  const hasZora = options?.zoraSummary !== null && options?.zoraSummary !== undefined;
  
  if (hasClankers || hasZora) {
    const page2Embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Farcaster Profile • Page 2");

    // Add Clanker coin details (first and recent)
    if (hasClankers) {
      const clankerDisplayEntries = getClankerDisplayEntries(deployed);
      if (clankerDisplayEntries.length > 0) {
        clankerDisplayEntries.forEach(({ label, token }) => {
          const details = formatClankerTokenDetails(token);
          page2Embed.addFields({
            name: label,
            value: details,
            inline: false,
          });
        });
      }
    }

    // Add Zora info if available
    if (hasZora && options.zoraSummary) {
      appendZoraSummaryFields(page2Embed, options.zoraSummary, {
        latestCast: null, // Don't duplicate latest cast
      });
    }

    applyBranding(page2Embed, "farcaster lookup");
    embeds.push(page2Embed);
    totalPages = 2;
  }

  const identifier = `farcaster_${user.fid}`;

  // Store embeds for pagination
  if (totalPages > 1) {
    storeEmbedForPagination(identifier, embeds[0]);
    if (embeds.length > 1) {
      storeEmbedForPagination(`${identifier}_page2`, embeds[1]);
    }
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    components.push(...buildPaginationButtons(0, totalPages, identifier));
  }
  if (options?.includeButtons !== false) {
    components.push(...buildTokenDetailRows(clankerEntries.map((entry) => entry.token)));
  }

  return {
    embeds: [embeds[0]], // Return first page only
    components,
    tokens: deployed,
    clankerEntries,
  };
}
