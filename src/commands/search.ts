import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder } from "discord.js";
import type { User } from "@neynar/nodejs-sdk/build/api";
import {
  findUserByUsername,
  findUserByWallet,
  NeynarLookupError,
} from "../services/neynar";
import {
  fetchTokensByAddress,
  fetchTokensByQuery,
  type ClankerToken,
} from "../services/clanker";
import { fetchZoraCoin } from "../services/zora";
import {
  findBestZoraSummary,
  type ZoraLookupResult,
} from "../services/zora";
import {
  buildTokenDetailRows,
  buildTokenEmbed,
  buildUserClankerEmbed,
  resolveUserFromToken,
} from "../utils/clankerEmbeds";
import { safeFetchMostRecentCast, safeFetchTokensByFid, safeFetchEarliestCastByQuery } from "../utils/farcasterHelpers";
import { isEthAddress, isSolAddress } from "../utils/address";
import { buildZoraPresentation, collectZoraIdentifiers } from "../utils/zoraPresentation";
import { appendZoraSummaryFields, buildZoraProfileEmbed } from "../utils/zoraEmbeds";
import { buildWalletProfileResponse, buildZoraWalletProfileResponse } from "../utils/walletEmbed";
import { buildFarcasterPresentation } from "../utils/farcasterPresentation";
import { isSummaryAssociatedWithAddress, isSummaryAssociatedWithUser } from "../utils/zoraAssociation";
import { splitClankerTokens } from "../utils/clankerAssociation";
import { buildZoraCoinResponse } from "../handlers/zoraAddress";
import { splitEmbedIntoPages, buildPaginationButtons } from "../utils/pagination";
import { storeEmbedForPagination } from "../handlers/pagination";

export async function handleSearchCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const query = interaction.options.getString("query", true).trim();

  if (!query) {
    await interaction.reply({
      content: "Please provide a wallet address, username, or token to search.",
    });
    return;
  }

  await interaction.deferReply();

  try {
    if (isEthAddress(query) || isSolAddress(query)) {
      await handleWalletSearch(interaction, query);
      return;
    }

    // Try Farcaster username lookup first
    const normalizedUsername = normalizeUsername(query);
    const handledUsername = await replyWithUsernameLookup(
      interaction,
      normalizedUsername,
    );
    if (handledUsername) {
      return;
    }

    // Fallback to Zora account lookup if Farcaster not found
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
      const identifier = `zora_profile_${normalizedQuery}`;

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

      await interaction.editReply({
        embeds: [embeds[0]],
        components,
      });
      return;
    }

    // Final fallback to Clanker token lookup
    await replyWithClankerTokenLookup(interaction, query);
  } catch (error) {
    const message =
      error instanceof NeynarLookupError
        ? error.message
        : "Unexpected error while querying Neynar.";

    await interaction.editReply({
      content: `${message} Please retry later or check the provided value.`,
    });
  }
}

async function handleWalletSearch(
  interaction: ChatInputCommandInteraction,
  address: string,
): Promise<void> {
  const zoraSummaryFromAddressPromise = findBestZoraSummary([address]);
  let user: User | null = null;
  try {
    user = await findUserByWallet(address);
  } catch (error) {
    console.warn("Failed Neynar wallet lookup, continuing with other lookups:", error);
  }
  const zoraSummaryFromAddress = await zoraSummaryFromAddressPromise;

  if (!user && zoraSummaryFromAddress?.profile?.farcasterHandle) {
    try {
      const handle = zoraSummaryFromAddress.profile.farcasterHandle.replace(/^@/, "");
      user = await findUserByUsername(handle);
    } catch (error) {
      console.warn("Failed to resolve user from Zora Farcaster handle:", error);
    }
  }

  if (user) {
    const zoraIdentifiers = collectZoraIdentifiers(user, address);
    const [tokens, latestCast, zoraSummaryForUser] = await Promise.all([
      safeFetchTokensByFid(user.fid),
      safeFetchMostRecentCast(user.fid),
      findBestZoraSummary(zoraIdentifiers),
    ]);

    const associatedSummary =
      zoraSummaryForUser && isSummaryAssociatedWithUser(user, zoraSummaryForUser)
        ? zoraSummaryForUser
        : zoraSummaryFromAddress;

    const walletResponse = await buildWalletProfileResponse({
      wallet: address,
      user,
      zoraSummary: associatedSummary,
      clankerTokens: tokens,
      latestCast,
    });

    await interaction.editReply({
      embeds: walletResponse.embeds,
      components: walletResponse.components,
    });
    return;
  }

  const tokens = await fetchTokensByAddress(address);
  if (tokens.length > 0) {
    const firstToken = tokens[0];
    const associatedUser = await resolveUserFromToken(firstToken);
    if (associatedUser) {
      const [creatorTokens, latestCast, zoraSummaryForCreator] = await Promise.all([
        safeFetchTokensByFid(associatedUser.fid),
        safeFetchMostRecentCast(associatedUser.fid),
        findBestZoraSummary(collectZoraIdentifiers(associatedUser, address)),
      ]);

      const associatedSummary =
        zoraSummaryForCreator &&
        isSummaryAssociatedWithUser(associatedUser, zoraSummaryForCreator)
          ? zoraSummaryForCreator
          : zoraSummaryFromAddress;

      const walletResponse = await buildWalletProfileResponse({
        wallet: address,
        user: associatedUser,
        zoraSummary: associatedSummary,
        clankerTokens: creatorTokens,
        latestCast,
      });

      await interaction.editReply({
        content: `No Farcaster profile linked directly to \`${address}\`, but the address is associated with this Clanker creator:`,
        embeds: walletResponse.embeds,
        components: walletResponse.components,
      });
      return;
    }

    const earliestCast = firstToken.contract_address
      ? await safeFetchEarliestCastByQuery(firstToken.contract_address)
      : null;
    
    const tokenEmbed = await buildTokenEmbed(firstToken, {
      farcasterUser: associatedUser ?? undefined,
      zoraSummary: zoraSummaryFromAddress ?? undefined,
      earliestCast,
    });

    // Split into pages if needed
    const embeds = splitEmbedIntoPages(tokenEmbed, 15);
    const totalPages = embeds.length;
    const identifier = `clanker_token_${firstToken.contract_address ?? address}`;
    
    if (totalPages > 1) {
      storeEmbedForPagination(identifier, tokenEmbed);
    }

    const components: typeof buildPaginationButtons extends (...args: any[]) => infer R ? R : never = [];
    if (totalPages > 1) {
      components.push(...buildPaginationButtons(0, totalPages, identifier));
    }

    await interaction.editReply({
      content: `No Farcaster profile linked directly to \`${address}\`. Showing Clanker token associated with this address:`,
      embeds: [embeds[0]],
      components,
    });
    return;
  }

  if (zoraSummaryFromAddress) {
    const lowerAddress = address.toLowerCase();
    let matchedCoin =
      zoraSummaryFromAddress.latestCoin?.coin.address?.toLowerCase() === lowerAddress
        ? zoraSummaryFromAddress.latestCoin.coin
        : null;

    if (
      !matchedCoin &&
      zoraSummaryFromAddress.profile.creatorCoinAddress?.toLowerCase() === lowerAddress
    ) {
      matchedCoin =
        zoraSummaryFromAddress.createdCoins?.find(
          (coin) => coin.address?.toLowerCase() === lowerAddress,
        ) ?? null;
    }

    if (!matchedCoin) {
      matchedCoin = await fetchZoraCoin(address);
    }

    if (matchedCoin) {
      const response = await buildZoraCoinResponse(matchedCoin, zoraSummaryFromAddress);
      await interaction.editReply(response);
      return;
    }
  }

  if (zoraSummaryFromAddress?.latestCoin) {
    const associated = isSummaryAssociatedWithAddress(zoraSummaryFromAddress, address)
      ? zoraSummaryFromAddress
      : null;

    const zoraResponse = buildZoraWalletProfileResponse({
      wallet: address,
      summary: associated ?? zoraSummaryFromAddress,
    });

    let farcasterEmbeds: Awaited<ReturnType<typeof buildFarcasterPresentation>> | null = null;
    const farcasterHandle = zoraSummaryFromAddress.profile.farcasterHandle;
    if (farcasterHandle) {
      try {
        const user = await findUserByUsername(farcasterHandle.replace(/^@/, ""));
        if (user) {
          farcasterEmbeds = await buildFarcasterPresentation(user, {
            zoraSummary: associated,
          });
        }
      } catch (error) {
        console.warn("Failed to fetch Farcaster profile for search result:", error);
      }
    }

    await interaction.editReply({
      content: `No Farcaster profile or Clanker deployments found for \`${address}\`, but the address is associated with this Zora profile:`,
      embeds: farcasterEmbeds
        ? [...farcasterEmbeds.embeds, ...zoraResponse.embeds]
        : zoraResponse.embeds,
      components: farcasterEmbeds?.components ?? [],
    });
    return;
  }

  await interaction.editReply({
    content: `We're continuing to add more wallet tracking systems and cannot connect \`${address}\` to any wallet or contract at this time.`,
  });
}

async function replyWithUsernameLookup(
  interaction: ChatInputCommandInteraction,
  username: string,
): Promise<boolean> {
  const user = await findUserByUsername(username);

  if (!user) {
    return false;
  }

  const identifiers = collectZoraIdentifiers(user);
  const [tokens, latestCast, zoraSummary] = await Promise.all([
    safeFetchTokensByFid(user.fid),
    safeFetchMostRecentCast(user.fid),
    findBestZoraSummary(identifiers),
  ]);
  const { embed, clankerEntries } = await buildUserClankerEmbed(
    user,
    "Username Lookup",
    tokens,
  );
  const detailRows = buildTokenDetailRows(
    clankerEntries.map((entry) => entry.token),
    { includeButtons: false },
  );
  await appendZoraSummaryFields(embed, zoraSummary, { latestCast });

  // Split into pages if needed
  const embeds = splitEmbedIntoPages(embed, 15);
  const totalPages = embeds.length;
  const identifier = `farcaster_username_${username}`;

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
  // Add detail rows if any
  if (detailRows.length > 0) {
    components.push(...detailRows);
  }

  await interaction.editReply({
    embeds: [embeds[0]],
    components,
  });

  return true;
}

function normalizeUsername(value: string): string {
  return value.replace(/^@/, "").toLowerCase();
}

async function replyWithClankerTokenLookup(
  interaction: ChatInputCommandInteraction,
  query: string,
): Promise<void> {
  let tokens: ClankerToken[] = [];
  if (isEthAddress(query) || isSolAddress(query)) {
    tokens = await fetchTokensByAddress(query);
  }
  if (tokens.length === 0) {
    tokens = await fetchTokensByQuery(query);
  }
  if (tokens.length === 0) {
    await interaction.editReply({
      content: `No Farcaster profile or Clanker deployments found for \`${query}\`.`,
    });
    return;
  }

  const primaryToken = tokens[0];
  const associatedUser = await resolveUserFromToken(primaryToken);
  if (associatedUser) {
    const [creatorTokens, latestCast] = await Promise.all([
      safeFetchTokensByFid(associatedUser.fid),
      safeFetchMostRecentCast(associatedUser.fid),
    ]);
    const { embed: userEmbed, clankerEntries } = await buildUserClankerEmbed(
      associatedUser,
      "Clanker Creator",
      creatorTokens,
    );
    const detailRows = buildTokenDetailRows(
      [primaryToken, ...clankerEntries.map((entry) => entry.token)],
      { includeButtons: false },
    );
    const zoraSummary = await findBestZoraSummary(collectZoraIdentifiers(associatedUser));

    await appendZoraSummaryFields(userEmbed, zoraSummary, { latestCast });

    await interaction.editReply({
      content: `No Farcaster profile found for \`${query}\`, but the keyword matches this Clanker creator:`,
      embeds: [userEmbed],
      components: detailRows,
    });
    return;
  }

  const earliestCast = primaryToken.contract_address
    ? await safeFetchEarliestCastByQuery(primaryToken.contract_address)
    : null;

  const tokenEmbed = await buildTokenEmbed(primaryToken, { 
    earliestCast,
  });
  const embeds = splitEmbedIntoPages(tokenEmbed, 15);
  const totalPages = embeds.length;
  const identifier = `clanker_token_${primaryToken.contract_address ?? query}`;
  
  if (totalPages > 1) {
    storeEmbedForPagination(identifier, tokenEmbed);
  }

  const components: typeof buildPaginationButtons extends (...args: any[]) => infer R ? R : never = [];
  if (totalPages > 1) {
    components.push(...buildPaginationButtons(0, totalPages, identifier));
  }

  await interaction.editReply({
    content: `No Farcaster profile found for \`${query}\`, but the keyword matches this Clanker deployment:`,
    embeds: [embeds[0]],
    components,
  });
}
