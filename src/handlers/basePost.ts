import { Message } from "discord.js";
import {
  fetchZoraCoin,
  fetchZoraSummary,
  findBestZoraSummary,
  type ZoraLookupResult,
} from "../services/zora";
import { buildZoraCoinEmbed } from "../utils/zoraEmbeds";
import { buildZoraPresentation } from "../utils/zoraPresentation";

const BASE_POST_REGEX = /https:\/\/base\.app\/post\/[^\s)]+/i;
const BASE_CONTRACT_REGEX = /base:(0x[a-fA-F0-9]{40})/i;
const CONTRACT_JSON_REGEX = /"contractAddress"\s*:\s*"(0x[a-fA-F0-9]{40})"/i;
const CONTRACT_ESCAPED_REGEX = /contractAddress\\":\\"(0x[a-fA-F0-9]{40})/i;
const NEXT_DATA_REGEX = /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s;
const ADDRESS_REGEX = /0x[a-fA-F0-9]{40}/g;
const BASE_CHAIN_ID = 8453;

type AddressCandidate = { address: string; priority: number };

export async function handleBasePostMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const linkMatch = message.content.match(BASE_POST_REGEX);
  if (!linkMatch) {
    return false;
  }

  const postUrl = linkMatch[0];
  let html: string;
  try {
    const response = await fetch(postUrl, {
      headers: {
        "User-Agent": "discord-bot/1.0",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) {
      console.warn(`Failed to fetch Base post ${postUrl}: ${response.status} ${response.statusText}`);
      return false;
    }
    html = await response.text();
  } catch (error) {
    console.warn("Error fetching Base post", error);
    return false;
  }

  const contractAddress = extractContractAddress(html);
  if (!contractAddress) {
    console.warn(`Unable to extract contract address from Base post ${postUrl}`);
    return false;
  }

  let coin = await fetchZoraCoin(contractAddress, BASE_CHAIN_ID);
  let summary: ZoraLookupResult | null = null;

  if (!coin) {
    summary = await findBestZoraSummary([contractAddress]);
    coin = summary?.latestCoin?.coin ?? null;
  }

  if (!coin) {
    return false;
  }

  if (!summary && coin.creatorProfile?.handle) {
    summary = await fetchZoraSummary(coin.creatorProfile.handle);
  }
  if (!summary && coin.creatorAddress) {
    summary = await fetchZoraSummary(coin.creatorAddress);
  }

  const embed = buildZoraCoinEmbed(
    {
      coin,
      isCreatorCoin:
        summary?.profile?.creatorCoinAddress?.toLowerCase() === coin.address.toLowerCase(),
      source: "direct",
    },
    {
      title: "Base Post Coin",
      profile: summary?.profile ?? null,
    },
  );
  // Merge creator coin into embed if available
  if (summary?.profile?.creatorCoinAddress && summary.profile.creatorCoinAddress.toLowerCase() !== coin.address.toLowerCase()) {
    const { buildCreatorCoinField } = await import("../utils/zoraEmbeds");
    const creatorCoinField = buildCreatorCoinField(summary.profile, false, null);
    if (creatorCoinField) {
      embed.addFields(creatorCoinField);
    }
  }

  // Split into pages if needed
  const { splitEmbedIntoPages, buildPaginationButtons } = await import("../utils/pagination");
  const { storeEmbedForPagination } = await import("./pagination");
  const embeds = splitEmbedIntoPages(embed, 15);
  const totalPages = embeds.length;
  const identifier = `base_post_${contractAddress}`;

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

  const { ActionRowBuilder, ButtonBuilder } = await import("discord.js");
  const components: typeof buildPaginationButtons extends (...args: any[]) => infer R ? R : never = [];
  if (totalPages > 1) {
    components.push(...buildPaginationButtons(0, totalPages, identifier));
  }

  await message.reply({
    content: `Base post detected. Token extracted from ${postUrl}.`,
    embeds: [embeds[0]],
    components,
  });

  return true;
}

function extractContractAddress(html: string): string | null {
  const prefixMatch = BASE_CONTRACT_REGEX.exec(html);
  if (prefixMatch) {
    return prefixMatch[1].toLowerCase();
  }

  const jsonMatch = CONTRACT_JSON_REGEX.exec(html);
  if (jsonMatch) {
    return jsonMatch[1].toLowerCase();
  }

  const escapedMatch = CONTRACT_ESCAPED_REGEX.exec(html);
  if (escapedMatch) {
    return escapedMatch[1].toLowerCase();
  }

  const nextDataMatch = NEXT_DATA_REGEX.exec(html);
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      const candidates = collectAddressCandidates(json);
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.priority - a.priority);
        return candidates[0].address.toLowerCase();
      }
    } catch (error) {
      console.warn("Failed to parse __NEXT_DATA__ JSON", error);
    }
  }

  const fallbackMatch = ADDRESS_REGEX.exec(html);
  if (fallbackMatch) {
    ADDRESS_REGEX.lastIndex = 0;
    return fallbackMatch[0].toLowerCase();
  }
  ADDRESS_REGEX.lastIndex = 0;

  return null;
}

function collectAddressCandidates(value: unknown, keyHint?: string): AddressCandidate[] {
  const results: AddressCandidate[] = [];

  if (typeof value === "string") {
    ADDRESS_REGEX.lastIndex = 0;
    const match = ADDRESS_REGEX.exec(value);
    ADDRESS_REGEX.lastIndex = 0;
    if (match) {
      const address = match[0];
      results.push({ address, priority: computePriority(keyHint) });
    }
    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      results.push(...collectAddressCandidates(item, keyHint));
    }
    return results;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      results.push(...collectAddressCandidates(child, key));
    }
  }

  return results;
}

function computePriority(keyHint?: string): number {
  if (!keyHint) {
    return 0;
  }
  const key = keyHint.toLowerCase();
  if (key.includes("contract") && key.includes("token")) {
    return 5;
  }
  if (key.includes("contract")) {
    return 4;
  }
  if (key.includes("token")) {
    return 3;
  }
  if (key.includes("coin")) {
    return 2;
  }
  if (key.includes("address")) {
    return 1;
  }
  return 0;
}
