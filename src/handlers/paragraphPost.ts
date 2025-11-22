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
  let publicationSlug: string; // The publication slug from the URL (e.g., "blog")
  let slug: string; // The post slug from the URL (e.g., "writer-coins")
  
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
        publicationSlug = manualMatch[1];
        slug = manualMatch[2];
        
        // Continue with processing using manually extracted values
        logger.debug(`[Paragraph] ✅ Using manually extracted URL: ${postUrl}, publication: ${publicationSlug}, slug: ${slug}`, {}, true);
      } else {
        return false;
      }
    } else {
      return false;
    }
  } else {
    postUrl = urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
    publicationSlug = urlMatch[1]; // e.g., "blog"
    slug = urlMatch[2]; // e.g., "writer-coins"
    
    logger.debug(`[Paragraph] ✅ Matched URL: ${postUrl}, publication: ${publicationSlug}, slug: ${slug}`, {}, true);
  }

  try {
    // Use the Paragraph API directly instead of scraping HTML
    // Flow: publicationSlug + postSlug -> getPostBySlug -> get coinId -> getCoinById -> get contractAddress
    const { getPostBySlug, getCoinById } = await import("../services/paragraph");
    
    logger.debug(`[Paragraph] Getting post via API: publicationSlug=${publicationSlug}, postSlug=${slug}`, {}, true);
    
    // Step 1: Get post by publication slug + post slug
    const post = await getPostBySlug(publicationSlug, slug, false);
    
    if (!post) {
      logger.warn(`[Paragraph] Post not found for ${publicationSlug}/${slug}`);
      return false;
    }
    
    logger.debug(`[Paragraph] ✅ Got post via API`, {
      postId: post.id,
      title: post.title,
      coinId: post.coinId,
      slug: post.slug
    }, true);
    
    // Step 2: Get coin by coinId to get contract address
    let contractAddress: string | null = null;
    
    if (post.coinId) {
      logger.debug(`[Paragraph] Getting coin by coinId: ${post.coinId}`, {}, true);
      const coin = await getCoinById(post.coinId);
      if (coin) {
        contractAddress = coin.contractAddress;
        logger.debug(`[Paragraph] ✅ Got contract address from coin: ${contractAddress}`, {}, true);
      } else {
        logger.warn(`[Paragraph] Coin not found for coinId: ${post.coinId}`);
      }
    } else {
      logger.warn(`[Paragraph] Post does not have a coinId (not tokenized)`);
      // Post exists but isn't tokenized - we could still show post info, but no token data
      return false;
    }
    
    if (!contractAddress) {
      logger.warn(`[Paragraph] Unable to get contract address for post ${post.id}`);
      return false;
    }
    
    logger.debug(`[Paragraph] ✅ Got contract address: ${contractAddress} from post ${post.id}`, {}, true);

    // Step 3: Verify the coin by contract address (we already have it, but this ensures consistency)
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

    // Found a Paragraph coin - get the post author and show full token embed
    const [baseTokenData, factory, contractCreation, creationTx] = await Promise.all([
      fetchBaseTokenData(contractAddress),
      detectTokenFactory(contractAddress),
      getContractCreation(contractAddress).catch(() => null),
      getContractCreationTx(contractAddress, "base", env.basescanApiKey).catch(() => null),
    ]);

    // Always show the full token embed, even if baseTokenData is null
    // We'll use the coin symbol and post title as fallbacks

    // Get post author information using the API
    // We already have the post from getPostBySlug above, so use that
    let paragraphPostAuthor: { name?: string | null; bio?: string | null; farcaster?: { username: string } | null; publicationId?: string | null } | null = null;
    let finalPostUrl = postUrl; // Default to the URL we extracted from the message
    
    try {
      // We already have the post from getPostBySlug above, so use it
      // Step 1: Get author from post owner to get publicationId
      if (post.ownerWalletAddress) {
        const author = await getUserByWallet(post.ownerWalletAddress);
        if (author) {
          paragraphPostAuthor = author;
          logger.debug(`[Paragraph] Found author from ownerWalletAddress: ${author.name}, publicationId: ${author.publicationId}`, {}, true);
        }
      } else if (post.ownerUserId && post.ownerUserId.startsWith("0x")) {
        const author = await getUserByWallet(post.ownerUserId);
        if (author) {
          paragraphPostAuthor = author;
          logger.debug(`[Paragraph] Found author from ownerUserId: ${author.name}, publicationId: ${author.publicationId}`, {}, true);
        }
      }
      
      // Step 2: Construct the proper post URL using publicationId and slug from the API
      if (paragraphPostAuthor?.publicationId && post.slug) {
        finalPostUrl = `https://paragraph.com/@${paragraphPostAuthor.publicationId}/${post.slug}`;
        logger.debug(`[Paragraph] ✅ Constructed proper post URL: ${finalPostUrl}`, {}, true);
      } else if (post.slug) {
        // If we have slug but no publicationId, use the publication slug from the original URL
        // This is the most reliable fallback when we have the URL
        finalPostUrl = `https://paragraph.com/@${publicationSlug}/${post.slug}`;
        logger.debug(`[Paragraph] Using publication slug from URL with post slug: ${finalPostUrl}`, {}, true);
      }
    } catch (error) {
      logger.warn(`[Paragraph] Failed to get post author for ${post.id}`, { error: error instanceof Error ? error.message : String(error) });
    }

    // Build full token embed with Paragraph coin info
    // Use post title and coin symbol as fallbacks if baseTokenData is not available
    const tokenName = baseTokenData?.tokenName ?? post.title ?? null;
    const tokenSymbol = baseTokenData?.tokenSymbol ?? coin.symbol ?? null;
    
    const { embed, components } = await buildBaseTokenEmbed(
      contractAddress,
      tokenName,
      tokenSymbol,
      baseTokenData, // May be null, but we have fallbacks above
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

