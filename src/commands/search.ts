import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "discord.js";
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
import { isEthAddress, isSolAddress, isTransactionHash } from "../utils/address";
import { extractTransactionHash } from "../services/relay";
import { lookupTransaction, detectChainFromTransactionLink } from "../services/transactionLookup";
import { lookupAddress } from "../services/addressLookup";
import { buildZoraPresentation, collectZoraIdentifiers } from "../utils/zoraPresentation";
import { appendZoraSummaryFields, buildZoraProfileEmbed } from "../utils/zoraEmbeds";
import { buildWalletProfileResponse, buildZoraWalletProfileResponse } from "../utils/walletEmbed";
import { buildFarcasterPresentation } from "../utils/farcasterPresentation";
import { isSummaryAssociatedWithAddress, isSummaryAssociatedWithUser } from "../utils/zoraAssociation";
import { splitClankerTokens } from "../utils/clankerAssociation";
import { buildZoraCoinResponse } from "../handlers/zoraAddress";
import { splitEmbedIntoPages, buildPaginationButtons } from "../utils/pagination";
import { storeEmbedForPagination } from "../handlers/pagination";
import { logger } from "../utils/logger";

export async function handleSearchCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const query = interaction.options.getString("query", true).trim();
  const userId = interaction.user.id;
  const guildId = interaction.guildId || undefined;
  const channelId = interaction.channelId;

  logger.command("search", "discord", userId, guildId, channelId, { query });

  if (!query) {
    await interaction.reply({
      content: "Please provide a wallet address, username, or token to search.",
    });
    return;
  }

  // Log search immediately (before processing)
  logger.search(query, "discord", userId, guildId, channelId, {
    success: true, // Will update if it fails
    type: "pending",
  });

  await interaction.deferReply();

  try {
    // Check if it's a transaction hash first
    const txHash = extractTransactionHash(query);
    if (txHash && isTransactionHash(txHash)) {
      await handleTransactionSearch(interaction, txHash, query);
      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "transaction",
      });
      return;
    }

    if (isEthAddress(query) || isSolAddress(query)) {
      await handleWalletSearch(interaction, query, userId, guildId, channelId);
      return;
    }

    // Try Farcaster username lookup first
    const normalizedUsername = normalizeUsername(query);
    const handledUsername = await replyWithUsernameLookup(
      interaction,
      normalizedUsername,
    );
    if (handledUsername) {
      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "farcaster",
      });
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
      
      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "zora",
        count: 1,
      });
      return;
    }

    // Final fallback to Clanker token lookup
    const clankerHandled = await replyWithClankerTokenLookup(interaction, query);
    if (clankerHandled) {
      logger.search(query, "discord", userId, guildId, channelId, {
        success: true,
        type: "clanker",
      });
    } else {
      logger.search(query, "discord", userId, guildId, channelId, {
        success: false,
        type: "not_found",
      });
    }
  } catch (error) {
    const message =
      error instanceof NeynarLookupError
        ? error.message
        : "Unexpected error while querying Neynar.";

    logger.error(
      `Search failed for query: ${query}`,
      error,
      { query, userId, guildId, channelId, platform: "discord" }
    );

    logger.search(query, "discord", userId, guildId, channelId, {
      success: false,
    });

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
    
    logger.search(address, "discord", userId, guildId, channelId, {
      success: true,
      type: "wallet_farcaster",
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
    
    logger.search(address, "discord", userId, guildId, channelId, {
      success: true,
      type: "wallet_clanker_token",
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
      
      logger.search(address, "discord", userId, guildId, channelId, {
        success: true,
        type: "wallet_zora_coin",
      });
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
    
    logger.search(address, "discord", userId, guildId, channelId, {
      success: true,
      type: "wallet_zora_profile",
    });
    return;
  }

  // Final fallback: Try to get basic address information across chains
  const addressInfo = await lookupAddress(address);
  
  if (addressInfo.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("🔍 Address Information")
      .setDescription(`Found activity for \`${address}\` on ${addressInfo.length} chain(s)`)
      .setColor(0x00d4ff);

    for (const info of addressInfo) {
      let value = "";
      if (info.isContract) {
        value += "📄 **Contract**\n";
      } else {
        value += "👤 **EOA (Externally Owned Account)**\n";
      }

      if (info.balance) {
        try {
          const balanceWei = BigInt(info.balance);
          const balanceEth = Number(balanceWei) / 1e18;
          if (balanceEth > 0) {
            value += `💰 Balance: ${balanceEth.toFixed(6)} ETH\n`;
          }
        } catch (error) {
          // Ignore balance parsing errors
        }
      }

      if (info.transactionCount !== null) {
        value += `📊 Transactions: ${info.transactionCount.toLocaleString()}\n`;
      }

      value += `🔗 [View on ${info.chainName} Explorer](${info.explorerUrl})`;

      embed.addFields({
        name: `${info.chainName} (Chain ID: ${info.chainId})`,
        value,
        inline: false,
      });
    }

    embed.setFooter({
      text: `Address: ${address.slice(0, 10)}...${address.slice(-8)}`,
    });

    await interaction.editReply({
      content: `No Farcaster profile, Clanker deployments, or Zora coins found for \`${address}\`, but found activity on the following chain(s):`,
      embeds: [embed],
    });
    return;
  }

  await interaction.editReply({
    content: `We're continuing to add more wallet tracking systems and cannot connect \`${address}\` to any wallet or contract at this time.\n\n**Note:** This address has no activity on any supported chain (Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BSC, Fantom, Mantle).`,
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
): Promise<boolean> {
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
    return false;
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

/**
 * Handle transaction hash search
 */
async function handleTransactionSearch(
  interaction: ChatInputCommandInteraction,
  txHash: string,
  originalQuery: string,
): Promise<void> {
  // Try to detect chain from link if it's a URL
  const preferredChainId = detectChainFromTransactionLink(originalQuery);
  
  const transaction = await lookupTransaction(txHash, preferredChainId || undefined);

  if (!transaction) {
    await interaction.editReply({
      content: `❌ Transaction \`${txHash}\` not found on any supported chain.\n\n**Supported chains:** Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BSC, Fantom, Mantle, Gnosis, Celo, Linea, Scroll\n\n**Note:** If this is a Relay cross-chain transaction, use \`/relay\` instead.`,
    });
    return;
  }

  // Build embed with transaction details
  const embed = new EmbedBuilder()
    .setTitle("🔍 Transaction Details")
    .setColor(transaction.status === "success" ? 0x00ff00 : transaction.status === "failed" ? 0xff0000 : 0xffff00)
    .addFields(
      {
        name: "🌐 Chain",
        value: `${transaction.chainName} (Chain ID: ${transaction.chainId})`,
        inline: true,
      },
      {
        name: "📊 Status",
        value: transaction.status === "success" ? "✅ Success" : transaction.status === "failed" ? "❌ Failed" : transaction.status === "pending" ? "⏳ Pending" : "❓ Unknown",
        inline: true,
      },
      {
        name: "📤 From",
        value: `\`${transaction.from}\``,
        inline: false,
      },
    );

  if (transaction.to) {
    embed.addFields({
      name: "📥 To",
      value: `\`${transaction.to}\``,
      inline: false,
    });
  }

  if (transaction.blockNumber) {
    embed.addFields({
      name: "🔢 Block",
      value: `#${transaction.blockNumber.toLocaleString()}`,
      inline: true,
    });
  }

  if (transaction.timestamp) {
    embed.addFields({
      name: "🕐 Time",
      value: `<t:${transaction.timestamp}:F>`,
      inline: true,
    });
  }

  // Convert value from hex to ETH
  if (transaction.value && transaction.value !== "0x0") {
    try {
      const valueWei = BigInt(transaction.value);
      const valueEth = Number(valueWei) / 1e18;
      if (valueEth > 0) {
        embed.addFields({
          name: "💰 Value",
          value: `${valueEth.toFixed(6)} ETH`,
          inline: true,
        });
      }
    } catch (error) {
      // Ignore value parsing errors
    }
  }

  if (transaction.gasUsed) {
    try {
      const gasUsed = parseInt(transaction.gasUsed, 16);
      embed.addFields({
        name: "⛽ Gas Used",
        value: gasUsed.toLocaleString(),
        inline: true,
      });
    } catch (error) {
      // Ignore gas parsing errors
    }
  }

  embed
    .addFields({
      name: "🔗 Explorer",
      value: `[View on ${transaction.chainName} Explorer](${transaction.explorerUrl})`,
      inline: false,
    })
    .setFooter({
      text: `Transaction Hash: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`,
    });

  await interaction.editReply({
    embeds: [embed],
  });
}
