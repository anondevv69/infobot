import { EmbedBuilder, Message } from "discord.js";
import { getCoinByContract, getUserByWallet, type ParagraphCoin } from "../services/paragraph";
import { buildBaseTokenEmbed } from "../utils/baseTokenEmbeds";
import { fetchBaseTokenData } from "../services/dexscreener";
import { detectTokenFactory } from "../services/baseFactories";
import { getContractCreation } from "../services/basescan";
import { getContractCreationTx } from "../services/contractCreation";
import { env } from "../config";
import { applyBranding } from "../utils/branding";

const PARAGRAPH_URL_REGEX = /https?:\/\/(?:www\.)?paragraph\.(?:com|xyz)\/@([^\/]+)\/([^\s)]+)/i;

export async function handleParagraphPostMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  const urlMatch = message.content.match(PARAGRAPH_URL_REGEX);
  if (!urlMatch) {
    return false;
  }

  const postUrl = urlMatch[0];
  const publication = urlMatch[1]; // e.g., "blog"
  const slug = urlMatch[2]; // e.g., "writer-coins"

  try {
    // Fetch the Paragraph post page to extract contract address
    const response = await fetch(postUrl, {
      headers: {
        "User-Agent": "discord-bot/1.0",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch Paragraph post ${postUrl}: ${response.status} ${response.statusText}`);
      return false;
    }

    const html = await response.text();
    
    // Try to extract contract address from the page
    // Paragraph posts might have the contract in various formats
    const CONTRACT_PATTERNS = [
      /0x[a-fA-F0-9]{40}/g, // Direct address
      /"contractAddress"\s*:\s*"(0x[a-fA-F0-9]{40})"/i, // JSON format
      /contractAddress["']?\s*[:=]\s*["']?(0x[a-fA-F0-9]{40})/i, // Various formats
    ];

    let contractAddress: string | null = null;
    for (const pattern of CONTRACT_PATTERNS) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        // Take the first match that looks like a valid address
        contractAddress = matches[0].replace(/["':=]/g, "").trim();
        if (contractAddress.startsWith("0x") && contractAddress.length === 42) {
          break;
        }
      }
    }

    if (!contractAddress) {
      console.warn(`Unable to extract contract address from Paragraph post ${postUrl}`);
      // Still try to look up by coin if we can get the post ID somehow
      return false;
    }

    // Now look up the coin by contract address
    const coin = await getCoinByContract(contractAddress);
    
    if (!coin) {
      // Even if not a Paragraph coin, still show as Base token if it exists
      const [baseTokenData, factory] = await Promise.all([
        fetchBaseTokenData(contractAddress),
        detectTokenFactory(contractAddress),
      ]);

      if (baseTokenData) {
        const [contractCreation, creationTx] = await Promise.all([
          getContractCreation(contractAddress).catch(() => null),
          getContractCreationTx(contractAddress, "base", env.basescanApiKey).catch(() => null),
        ]);

        const { embed, components } = await buildBaseTokenEmbed(
          contractAddress,
          null,
          null,
          baseTokenData,
          factory,
          contractCreation?.contractCreator ?? null,
          contractCreation?.createdAt ?? null,
          creationTx?.hash ?? null,
          null, // No Paragraph coin
        );

        await message.reply({ embeds: [embed], components });
        return true;
      }
      
      return false;
    }

    // Found a Paragraph coin - get the post author and show enhanced embed
    const [baseTokenData, factory, contractCreation, creationTx] = await Promise.all([
      fetchBaseTokenData(contractAddress),
      detectTokenFactory(contractAddress),
      getContractCreation(contractAddress).catch(() => null),
      getContractCreationTx(contractAddress, "base", env.basescanApiKey).catch(() => null),
    ]);

    if (!baseTokenData) {
      // Create a simple embed for Paragraph coin without token data
      const embed = new EmbedBuilder()
        .setColor(0x0052ff)
        .setTitle(`📝 Paragraph Post Token`)
        .setURL(postUrl)
        .addFields({
          name: "Post Information",
          value: `**Publication:** @${publication}\n**Post:** ${slug}\n**Contract:** \`${contractAddress}\`\n**Symbol:** ${coin.symbol}`,
          inline: false,
        });

      applyBranding(embed, "paragraph post");
      await message.reply({ embeds: [embed] });
      return true;
    }

    // Build full token embed with Paragraph coin info
    const { embed, components } = await buildBaseTokenEmbed(
      contractAddress,
      null,
      null,
      baseTokenData,
      factory,
      contractCreation?.contractCreator ?? null,
      contractCreation?.createdAt ?? null,
      creationTx?.hash ?? null,
      coin, // Include Paragraph coin info
    );

    // Get post author information if we have the creator address
    if (contractCreation?.contractCreator) {
      const author = await getUserByWallet(contractCreation.contractCreator);
      if (author) {
        const authorInfo: string[] = [];
        authorInfo.push(`**Author:** ${author.name || "Unknown"}`);
        if (author.bio) {
          authorInfo.push(`**Bio:** ${author.bio.substring(0, 200)}${author.bio.length > 200 ? "..." : ""}`);
        }
        if (author.farcaster) {
          authorInfo.push(`**Farcaster:** [@${author.farcaster.username}](https://farcaster.xyz/${author.farcaster.username})`);
        }
        const paragraphProfileUrl = `https://paragraph.xyz/@${author.publicationId}`;
        authorInfo.push(`**Paragraph:** [View Profile](${paragraphProfileUrl})`);

        embed.addFields({
          name: "📝 Post Author",
          value: authorInfo.join("\n"),
          inline: false,
        });
      }
    }

    await message.reply({ embeds: [embed], components });
    return true;
  } catch (error) {
    console.error("Error handling Paragraph post:", error);
    return false;
  }
}

