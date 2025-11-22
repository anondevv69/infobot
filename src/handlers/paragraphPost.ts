import { EmbedBuilder, Message } from "discord.js";
import { getCoinByContract, getUserByWallet, type ParagraphCoin } from "../services/paragraph";
import { buildBaseTokenEmbed } from "../utils/baseTokenEmbeds";
import { fetchBaseTokenData } from "../services/dexscreener";
import { detectTokenFactory } from "../services/baseFactories";
import { getContractCreation } from "../services/basescan";
import { getContractCreationTx } from "../services/contractCreation";
import { env } from "../config";
import { applyBranding } from "../utils/branding";
import { logger } from "../utils/logger";

// More lenient regex to catch various URL formats
const PARAGRAPH_URL_REGEX = /https?:\/\/(?:www\.)?paragraph\.(?:com|xyz)\/@([^\/\s\)]+)\/([^\s\)]+)/i;

export async function handleParagraphPostMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.content) {
    return false;
  }

  // Check if message contains paragraph.com or paragraph.xyz
  const hasParagraphUrl = /paragraph\.(?:com|xyz)/i.test(message.content);
  logger.debug(`[Paragraph] Checking message: hasParagraphUrl=${hasParagraphUrl}, content="${message.content.substring(0, 200)}..."`, {}, true);
  
  // Discord might wrap URLs in angle brackets or markdown, so try to extract clean URL first
  let cleanContent = message.content;
  // Remove markdown links: [text](url) -> url
  cleanContent = cleanContent.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
  // Remove angle brackets: <url> -> url
  cleanContent = cleanContent.replace(/<([^>]+)>/g, '$1');
  
  // Try matching on cleaned content first
  let urlMatch = cleanContent.match(PARAGRAPH_URL_REGEX);
  
  // If that fails, try the original content (in case our cleaning broke something)
  if (!urlMatch) {
    urlMatch = message.content.match(PARAGRAPH_URL_REGEX);
  }
  
  let postUrl: string;
  let publication: string;
  let slug: string;
  
  if (!urlMatch) {
    logger.debug(`[Paragraph] URL regex did not match. Original: "${message.content.substring(0, 200)}", Cleaned: "${cleanContent.substring(0, 200)}"`, {}, true);
    // Try a more lenient pattern to see what's in the message
    const anyUrlMatch = cleanContent.match(/paragraph\.(?:com|xyz)\/[^\s)]+/i) || message.content.match(/paragraph\.(?:com|xyz)\/[^\s)]+/i);
    if (anyUrlMatch) {
      logger.debug(`[Paragraph] Found paragraph URL but regex didn't match: "${anyUrlMatch[0]}"`, { regex: PARAGRAPH_URL_REGEX.toString() }, true);
      // Try to manually extract publication and slug
      const manualMatch = anyUrlMatch[0].match(/@([^\/]+)\/([^\s)]+)/);
      if (manualMatch) {
        logger.debug(`[Paragraph] Manual extraction: publication=${manualMatch[1]}, slug=${manualMatch[2]}`, {}, true);
        // Use the full URL from the match
        postUrl = anyUrlMatch[0].startsWith('http') ? anyUrlMatch[0] : `https://${anyUrlMatch[0]}`;
        publication = manualMatch[1];
        slug = manualMatch[2];
        
        // Continue with processing using manually extracted values
        logger.debug(`[Paragraph] ✅ Using manually extracted URL: ${postUrl}, publication: ${publication}, slug: ${slug}`, {}, true);
      } else {
        return false;
      }
    } else {
      return false;
    }
  } else {
    postUrl = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
    publication = urlMatch[1]; // e.g., "blog"
    slug = urlMatch[2]; // e.g., "writer-coins"
    
    logger.debug(`[Paragraph] ✅ Matched URL: ${postUrl}, publication: ${publication}, slug: ${slug}`, {}, true);
  }

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
    logger.debug(`[Paragraph] Fetched HTML for ${postUrl}, length: ${html.length}`, {}, true);
    
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
          logger.debug(`[Paragraph] ✅ Extracted contract address: ${contractAddress}`, {}, true);
          break;
        }
      }
    }

    if (!contractAddress) {
      logger.warn(`[Paragraph] Unable to extract contract address from Paragraph post ${postUrl}`, { htmlSnippet: html.substring(0, 500) });
      // Still try to look up by coin if we can get the post ID somehow
      return false;
    }
    
    logger.debug(`[Paragraph] ✅ Extracted contract: ${contractAddress} from ${postUrl}`, {}, true);

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

    // Get post details and author information
    let paragraphPostAuthor: { name?: string | null; bio?: string | null; farcaster?: { username: string } | null; publicationId?: string | null } | null = null;
    let finalPostUrl = postUrl; // Default to the URL we extracted from the message
    
    try {
      const { getPostById } = await import("../services/paragraph");
      const post = await getPostById(coin.postId);
      
      logger.debug(`[Paragraph] Got post by ID ${coin.postId}`, { 
        slug: post?.slug, 
        title: post?.title,
        hasOwnerWallet: !!post?.ownerWalletAddress,
        hasOwnerUserId: !!post?.ownerUserId 
      }, true);
      
      // Get author from post owner to get publicationId
      if (post?.ownerWalletAddress) {
        const author = await getUserByWallet(post.ownerWalletAddress);
        if (author) {
          paragraphPostAuthor = author;
          logger.debug(`[Paragraph] Found author from ownerWalletAddress: ${author.name}, publicationId: ${author.publicationId}`, {}, true);
        }
      } else if (post?.ownerUserId && post.ownerUserId.startsWith("0x")) {
        const author = await getUserByWallet(post.ownerUserId);
        if (author) {
          paragraphPostAuthor = author;
          logger.debug(`[Paragraph] Found author from ownerUserId: ${author.name}, publicationId: ${author.publicationId}`, {}, true);
        }
      }
      
      // Construct the proper post URL using publicationId and slug from the API
      if (paragraphPostAuthor?.publicationId && post?.slug) {
        finalPostUrl = `https://paragraph.com/@${paragraphPostAuthor.publicationId}/${post.slug}`;
        logger.debug(`[Paragraph] ✅ Constructed proper post URL: ${finalPostUrl}`, {}, true);
      } else if (post?.slug) {
        // If we have slug but no publicationId, try using the publication from the original URL
        finalPostUrl = `https://paragraph.com/@${publication}/${post.slug}`;
        logger.debug(`[Paragraph] Using publication from URL with post slug: ${finalPostUrl}`, {}, true);
      }
    } catch (error) {
      logger.warn(`[Paragraph] Failed to get post author for ${coin.postId}`, { error: error instanceof Error ? error.message : String(error) });
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
      finalPostUrl, // Use the properly constructed post URL
    );

    await message.reply({ embeds: [embed], components });
    return true;
  } catch (error) {
    console.error("Error handling Paragraph post:", error);
    return false;
  }
}

