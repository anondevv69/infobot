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

  // Check if message contains paragraph.com or paragraph.xyz
  const hasParagraphUrl = /paragraph\.(?:com|xyz)/i.test(message.content);
  console.log(`[Paragraph] Checking message: hasParagraphUrl=${hasParagraphUrl}, content="${message.content.substring(0, 100)}..."`);
  
  const urlMatch = message.content.match(PARAGRAPH_URL_REGEX);
  if (!urlMatch) {
    console.log(`[Paragraph] URL regex did not match. Content: "${message.content}"`);
    // Try a more lenient pattern to see what's in the message
    const anyUrlMatch = message.content.match(/paragraph\.(?:com|xyz)\/[^\s)]+/i);
    if (anyUrlMatch) {
      console.log(`[Paragraph] Found paragraph URL but regex didn't match: "${anyUrlMatch[0]}"`);
    }
    return false;
  }

  const postUrl = urlMatch[0];
  const publication = urlMatch[1]; // e.g., "blog"
  const slug = urlMatch[2]; // e.g., "writer-coins"
  
  console.log(`[Paragraph] ✅ Matched URL: ${postUrl}, publication: ${publication}, slug: ${slug}`);

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
    console.log(`[Paragraph] Fetched HTML for ${postUrl}, length: ${html.length}`);
    
    // Try to extract contract address from the page
    // Paragraph posts might have the contract in various formats
    const CONTRACT_PATTERNS = [
      /"contractAddress"\s*:\s*"(0x[a-fA-F0-9]{40})"/i, // JSON format (most reliable)
      /contractAddress["']?\s*[:=]\s*["']?(0x[a-fA-F0-9]{40})/i, // Various formats
      /0x[a-fA-F0-9]{40}/g, // Direct address (fallback - might match multiple)
    ];

    let contractAddress: string | null = null;
    for (const pattern of CONTRACT_PATTERNS) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        // For patterns with capture groups, use the captured group
        // For patterns without, use the full match
        const matched = pattern.source.includes("(") && matches[1] ? matches[1] : matches[0];
        contractAddress = matched.replace(/["':=]/g, "").trim();
        if (contractAddress.startsWith("0x") && contractAddress.length === 42) {
          console.log(`[Paragraph] ✅ Extracted contract address: ${contractAddress}`);
          break;
        }
      }
    }

    if (!contractAddress) {
      console.warn(`[Paragraph] Unable to extract contract address from Paragraph post ${postUrl}`);
      console.log(`[Paragraph] HTML snippet (first 2000 chars): ${html.substring(0, 2000)}`);
      // Still try to look up by coin if we can get the post ID somehow
      return false;
    }
    
    console.log(`[Paragraph] ✅ Extracted contract: ${contractAddress} from ${postUrl}`);

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

    // Get post author information if we have the creator address
    let paragraphPostAuthor: { name?: string | null; bio?: string | null; farcaster?: { username: string } | null; publicationId?: string | null } | null = null;
    try {
      const { getPostById } = await import("../services/paragraph");
      const post = await getPostById(coin.postId);
      
      if (post?.ownerWalletAddress) {
        const author = await getUserByWallet(post.ownerWalletAddress);
        if (author) {
          paragraphPostAuthor = author;
        }
      } else if (post?.ownerUserId && post.ownerUserId.startsWith("0x")) {
        const author = await getUserByWallet(post.ownerUserId);
        if (author) {
          paragraphPostAuthor = author;
        }
      }
    } catch (error) {
      console.warn(`[Paragraph] Failed to get post author for ${coin.postId}:`, error);
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
      paragraphPostAuthor ?? undefined, // Paragraph post author if available
      postUrl, // Pass the original post URL
    );

    await message.reply({ embeds: [embed], components });
    return true;
  } catch (error) {
    console.error("Error handling Paragraph post:", error);
    return false;
  }
}

