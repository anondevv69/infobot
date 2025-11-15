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
import { appendZoraSummaryFields, formatSocialRow } from "./zoraEmbeds";
import { splitEmbedIntoPages, buildPaginationButtons } from "./pagination";
import { storeEmbedForPagination } from "../handlers/pagination";

export interface BuildFarcasterPresentationOptions {
  tokens?: ClankerToken[];
  zoraSummary?: ZoraLookupResult | null;
  latestCast?: Cast | null;
  titleSuffix?: string;
  includeButtons?: boolean;
  paginationIdentifier?: string; // Optional custom identifier for pagination
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
  const { embed: page1Embed, clankerEntries } = await buildUserClankerEmbed(
    user,
    options?.titleSuffix ?? "Farcaster Profile",
    undefined, // Don't include clankers on page 1
  );

  // Add Zora socials to page 1 if available (combine with existing socials)
  if (options?.zoraSummary?.profile) {
    const zoraSocials = formatSocialRow(options.zoraSummary.profile);
    if (zoraSocials) {
      // Find the Profile field and update it to include Zora socials
      const fields = page1Embed.data.fields ?? [];
      const profileFieldIndex = fields.findIndex(f => f.name === "Profile");
      if (profileFieldIndex >= 0) {
        const profileField = fields[profileFieldIndex];
        // Check if socials already exist in the profile field
        if (profileField.value.includes("**Socials:**")) {
          // Replace existing socials with combined socials (F • X • Z format)
          const lines = profileField.value.split("\n");
          const socialsIndex = lines.findIndex(line => line.includes("**Socials:**"));
          if (socialsIndex >= 0) {
            lines[socialsIndex] = `**Socials:** ${zoraSocials}`;
            page1Embed.spliceFields(profileFieldIndex, 1, {
              name: "Profile",
              value: lines.join("\n"),
              inline: false,
            });
          }
        } else {
          // Add socials if they don't exist
          page1Embed.spliceFields(profileFieldIndex, 1, {
            name: "Profile",
            value: `${profileField.value}\n**Socials:** ${zoraSocials}`,
            inline: false,
          });
        }
      } else {
        // If no Profile field, add socials as a separate field
        page1Embed.addFields({
          name: "Socials",
          value: zoraSocials,
          inline: false,
        });
      }
    }
  }

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
  
  // Determine page 2 title based on content
  let page2Title = "Farcaster Profile";
  if (hasClankers && hasZora) {
    page2Title = "Farcaster Profile • Clankers & Zora";
  } else if (hasClankers) {
    page2Title = "Farcaster Profile • Clankers";
  } else if (hasZora) {
    page2Title = "Farcaster Profile • Zora";
  }
  
  if (hasClankers || hasZora) {
    const page2Embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(page2Title);

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
      await appendZoraSummaryFields(page2Embed, options.zoraSummary, {
        latestCast: null, // Don't duplicate latest cast
        skipSocials: true, // Socials are already on page 1
      });
    }

    applyBranding(page2Embed, "farcaster lookup");
    embeds.push(page2Embed);
    totalPages = 2;
  }

  const identifier = options?.paginationIdentifier ?? `farcaster_${user.fid}`;

  // Store embeds for pagination
  if (totalPages > 1) {
    storeEmbedForPagination(identifier, embeds[0]);
    if (embeds.length > 1) {
      storeEmbedForPagination(`${identifier}_page2`, embeds[1]);
    }
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    // Create page labels for descriptive buttons
    const pageLabels = [
      { label: "Profile" }, // Page 1
      { label: hasClankers && hasZora ? "Clankers & Zora" : hasClankers ? "Clankers" : "Zora" }, // Page 2
    ];
    components.push(...buildPaginationButtons(0, totalPages, identifier, pageLabels));
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
