import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { User } from "@neynar/nodejs-sdk/build/api";
import {
  fetchTokensByAddress,
  fetchTokensByQuery,
  type ClankerToken,
} from "../services/clanker";
import { findUserByUsername, findUserByWallet } from "../services/neynar";
import { safeFetchTokensByFid } from "../utils/farcasterHelpers";
import { splitClankerTokens } from "../utils/clankerAssociation";
import { sortClankerTokens, formatClankerTokenDetails } from "../utils/clankerEmbeds";
import { isEthAddress, isSolAddress } from "../utils/address";
import { buildFarcasterProfileUrl } from "../utils/farcasterLinks";
import { applyBranding } from "../utils/branding";
import { buildTradingLinks } from "../utils/tradingButtons";

const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TOKENS_PER_PAGE = 8; // Reduced to prevent field value length issues

export async function handleClankerCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const query = interaction.options.getString("query", true).trim();

  if (!query) {
    await interaction.reply({
      content: "Please provide a Farcaster username (with or without @) or wallet address (0x...) to see all Clanker deployments.\n\nExample: `/cl @username` or `/cl 0x1234...`",
    });
    return;
  }

  await interaction.deferReply();

  // Check if it's a Farcaster username or wallet address
  const normalizedQuery = query.replace(/^@/, "").toLowerCase();
  let user: User | null = null;
  let allTokens: ClankerToken[] = [];

  if (isEthAddress(query) || isSolAddress(query)) {
    try {
      user = await findUserByWallet(query);
      if (user) {
        allTokens = await safeFetchTokensByFid(user.fid);
        const { deployed } = splitClankerTokens(allTokens, user);
        allTokens = deployed;
      } else {
        allTokens = await fetchTokensByAddress(query);
      }
    } catch (error) {
      console.warn("Failed to lookup user by wallet:", error);
      allTokens = await fetchTokensByAddress(query);
    }
  } else {
    // Try as Farcaster username first
    try {
      user = await findUserByUsername(normalizedQuery);
      if (user) {
        allTokens = await safeFetchTokensByFid(user.fid);
        const { deployed } = splitClankerTokens(allTokens, user);
        allTokens = deployed;
      }
    } catch (error) {
      console.warn("Failed to lookup user by username:", error);
    }

    // Only try token query if no user was found
    // If a user was found, we should only show their deployed tokens (even if empty)
    if (!user && allTokens.length === 0) {
      allTokens = await fetchTokensByQuery(query);
    }
  }

  if (allTokens.length === 0) {
    await interaction.editReply({
      content: `No Clanker deployments found for \`${query}\`.`,
    });
    return;
  }

  // Sort tokens and prioritize first/latest
  const sortedTokens = sortClankerTokens(allTokens);
  const prioritizedTokens = prioritizeFirstAndLatest(sortedTokens);

  // Check if user has over 100 clanks
  const hasManyClanks = allTokens.length > 100;
  const clankMessage = hasManyClanks
    ? `\n\n⚠️ **Note:** This user has deployed ${allTokens.length} Clanker tokens. Showing first and latest, then paginated results.`
    : "";

  // Create paginated embeds
  const totalPages = Math.ceil(prioritizedTokens.length / TOKENS_PER_PAGE);
  const page = 0;

  const { embeds, components } = buildClankerPage(
    prioritizedTokens,
    page,
    totalPages,
    user,
    query,
    allTokens.length,
    hasManyClanks,
  );

  // Use embed description instead of content to avoid 2000 character limit
  // If query is very long, truncate it in the description
  const queryDisplay = query.length > 50 ? query.substring(0, 47) + "..." : query;
  const description = `Clanker results for \`${queryDisplay}\` (${allTokens.length} total)${clankMessage}`;
  
  // If description is too long, put it in the first embed instead
  if (description.length > 2000) {
    // Truncate description and put in first embed
    const truncatedDesc = description.substring(0, 4096); // Embed description limit is 4096
    if (embeds.length > 0) {
      embeds[0].setDescription(truncatedDesc);
    }
    await interaction.editReply({
      embeds,
      components,
    });
  } else {
    await interaction.editReply({
      content: description,
      embeds,
      components,
    });
  }
}

export async function handleClankerPagination(
  interaction: ButtonInteraction,
  page: number,
  query: string,
): Promise<void> {
  await interaction.deferUpdate();

  const normalizedQuery = query.replace(/^@/, "").toLowerCase();
  let user: User | null = null;
  let allTokens: ClankerToken[] = [];

  if (isEthAddress(query) || isSolAddress(query)) {
    try {
      user = await findUserByWallet(query);
      if (user) {
        allTokens = await safeFetchTokensByFid(user.fid);
        const { deployed } = splitClankerTokens(allTokens, user);
        allTokens = deployed;
      } else {
        allTokens = await fetchTokensByAddress(query);
      }
    } catch (error) {
      console.warn("Failed to lookup user by wallet:", error);
      allTokens = await fetchTokensByAddress(query);
    }
  } else {
    try {
      user = await findUserByUsername(normalizedQuery);
      if (user) {
        allTokens = await safeFetchTokensByFid(user.fid);
        const { deployed } = splitClankerTokens(allTokens, user);
        allTokens = deployed;
      }
    } catch (error) {
      console.warn("Failed to lookup user by username:", error);
    }

    // Only try token query if no user was found
    // If a user was found, we should only show their deployed tokens (even if empty)
    if (!user && allTokens.length === 0) {
      allTokens = await fetchTokensByQuery(query);
    }
  }

  if (allTokens.length === 0) {
    await interaction.editReply({
      content: `No Clanker deployments found for \`${query}\`.`,
      embeds: [],
      components: [],
    });
    return;
  }

  const sortedTokens = sortClankerTokens(allTokens);
  const prioritizedTokens = prioritizeFirstAndLatest(sortedTokens);
  const totalPages = Math.ceil(prioritizedTokens.length / TOKENS_PER_PAGE);
  const hasManyClanks = allTokens.length > 100;

  const clankMessage = hasManyClanks
    ? `\n\n⚠️ **Note:** This user has deployed ${allTokens.length} Clanker tokens. Showing first and latest, then paginated results.`
    : "";

  const { embeds, components } = buildClankerPage(
    prioritizedTokens,
    page,
    totalPages,
    user,
    query,
    allTokens.length,
    hasManyClanks,
  );

  // Use embed description instead of content to avoid 2000 character limit
  // If query is very long, truncate it in the description
  const queryDisplay = query.length > 50 ? query.substring(0, 47) + "..." : query;
  const description = `Clanker results for \`${queryDisplay}\` (${allTokens.length} total)${clankMessage}`;
  
  // If description is too long, put it in the first embed instead
  if (description.length > 2000) {
    // Truncate description and put in first embed
    const truncatedDesc = description.substring(0, 4096); // Embed description limit is 4096
    if (embeds.length > 0) {
      embeds[0].setDescription(truncatedDesc);
    }
    await interaction.editReply({
      embeds,
      components,
    });
  } else {
    await interaction.editReply({
      content: description,
      embeds,
      components,
    });
  }
}

function prioritizeFirstAndLatest(tokens: ClankerToken[]): ClankerToken[] {
  if (tokens.length <= 2) {
    return tokens;
  }

  const first = tokens[0];
  const latest = tokens[tokens.length - 1];
  const middle = tokens.slice(1, -1);

  // If first and latest are the same, just return sorted
  if (first.contract_address === latest.contract_address) {
    return tokens;
  }

  return [first, latest, ...middle];
}

function buildClankerPage(
  tokens: ClankerToken[],
  page: number,
  totalPages: number,
  user: User | null,
  query: string,
  totalCount: number,
  hasManyClanks: boolean,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const startIdx = page * TOKENS_PER_PAGE;
  const endIdx = Math.min(startIdx + TOKENS_PER_PAGE, tokens.length);
  const pageTokens = tokens.slice(startIdx, endIdx);

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(user ? `Clanker Deployments: @${user.username}` : `Clanker Results: ${query}`)
    .setDescription(
      hasManyClanks
        ? `⚠️ This user has deployed **${totalCount}** Clanker tokens. Showing first and latest first, then paginated results.`
        : `Showing ${totalCount} Clanker deployment${totalCount !== 1 ? "s" : ""}.`,
    );

  if (user) {
    embed.setThumbnail(user.pfp_url ?? null);
    embed.addFields({
      name: "Farcaster Profile",
      value: `[@${user.username}](${buildFarcasterProfileUrl(user.username)}) • FID ${user.fid}\nFollowers: ${user.follower_count.toLocaleString()}`,
      inline: false,
    });
  }

  const tokenFields: string[] = [];
  pageTokens.forEach((token, idx) => {
    const globalIdx = startIdx + idx;
    let label = "";
    
    if (globalIdx === 0 && tokens.length > 1) {
      label = "**First Clanker:** ";
    } else if (globalIdx === 1 && tokens.length > 1 && tokens[0].contract_address !== tokens[tokens.length - 1]?.contract_address) {
      label = "**Latest Clanker:** ";
    } else {
      label = `**#${globalIdx + 1}:** `;
    }

    tokenFields.push(label + formatClankerTokenDetails(token));
  });

  if (tokenFields.length > 0) {
    const fieldValue = tokenFields.join("\n");
    // Discord has a 1024 character limit for embed field values
    // Split into multiple fields if needed
    const maxLength = 1000; // Leave some buffer
    let remainingValue = fieldValue;
    let fieldIndex = 0;
    
    while (remainingValue.length > 0) {
      let fieldName = fieldIndex === 0 
        ? `Deployments (Page ${page + 1}/${totalPages})`
        : `\u200B`; // Zero-width space for continuation
      
      let fieldValueChunk = remainingValue;
      if (remainingValue.length > maxLength) {
        // Try to split at a token boundary
        const lastNewline = remainingValue.lastIndexOf("\n", maxLength);
        if (lastNewline > maxLength * 0.7) {
          // Split at a reasonable point
          fieldValueChunk = remainingValue.slice(0, lastNewline);
          remainingValue = remainingValue.slice(lastNewline + 1);
        } else {
          // Force split
          fieldValueChunk = remainingValue.slice(0, maxLength - 20) + "\n...";
          remainingValue = "";
        }
      } else {
        remainingValue = "";
      }
      
      embed.addFields({
        name: fieldName,
        value: fieldValueChunk,
        inline: false,
      });
      
      fieldIndex++;
    }
  }

  // Apply branding to embed
  applyBranding(embed, "clanker");

  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  if (totalPages > 1) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    
    const encodedQuery = Buffer.from(query).toString("base64url");
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`clanker_page_${page - 1}|${encodedQuery}`)
        .setLabel("◀ Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`clanker_page_${page + 1}|${encodedQuery}`)
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
    );

    components.push(row);
  }

  return { embeds: [embed], components };
}

function buildClankerTokenEmbed(
  token: ClankerToken,
  user?: User,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(token.name ?? token.symbol ?? "Clanker Token")
    .setURL(`https://www.clanker.world/token/${token.contract_address}`)
    .setDescription(
      token.description ??
        token.metadata?.description ??
        "_No description provided._",
    );

  embed.addFields(
      { name: "Symbol", value: token.symbol ?? "N/A", inline: true },
      {
        name: "Contract",
        value: token.contract_address
          ? `\`${token.contract_address}\``
          : "N/A",
        inline: true,
      },
      {
        name: "Deployer",
        value: token.msg_sender ? `\`${token.msg_sender}\`` : "Unknown",
        inline: true,
      },
    );

  if (token.img_url) {
    embed.setThumbnail(token.img_url);
  }

  const deployedAt = token.deployed_at ?? token.created_at;
  if (deployedAt) {
    embed.addFields({
      name: "Deployed",
      value: new Date(deployedAt).toLocaleString(),
      inline: true,
    });
  }

  if (token.type || token.pair || token.chain_id) {
    embed.addFields({
      name: "Clanker Info",
      value: [
        token.type ? `Type: ${token.type}` : null,
        token.pair ? `Pair: ${token.pair}` : null,
        token.chain_id ? `Chain ID: ${token.chain_id}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
      inline: false,
    });
  }

  if (user) {
    embed.addFields({
      name: "Farcaster Creator",
      value: `@${user.username} (FID ${user.fid})`,
      inline: false,
    });
  }

  // Apply branding
  applyBranding(embed, "clanker");

  return embed;
}

function isWalletAddress(value: string): boolean {
  return WALLET_ADDRESS_REGEX.test(value);
}

