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
    // Alternative: If getPostBySlug fails, try to get publication first, then post
    const { getPostBySlug, getCoinById, getPublicationBySlug, getPostById } = await import("../services/paragraph");
    
    logger.debug(`[Paragraph] Getting post via API: publicationSlug=${publicationSlug}, postSlug=${slug}`, {}, true);
    
    // Step 1: Try to get post by publication slug + post slug
    logger.debug(`[Paragraph] Calling getPostBySlug with publicationSlug=${publicationSlug}, slug=${slug}`, {}, true);
    let post = await getPostBySlug(publicationSlug, slug, false);
    
    // If that fails, try alternative approach: get publication first, then post
    if (!post) {
      logger.debug(`[Paragraph] getPostBySlug returned null, trying alternative approach via publication`, {}, true);
      // Try to get publication first
      const publication = await getPublicationBySlug(publicationSlug);
      if (publication) {
        logger.debug(`[Paragraph] Found publication: ${publication.slug}, trying getPostBySlug again`, {}, true);
        // Try again with the publication slug from the API
        post = await getPostBySlug(publication.slug, slug, false);
      }
    }
    
    // If API endpoint returns 404, the endpoint might not exist or require different structure
    // Try fallback: fetch HTML and extract contract address, then use contract lookup
    if (!post) {
      logger.warn(`[Paragraph] Post not found via API endpoint for ${publicationSlug}/${slug} - trying HTML fallback`, {
        url: postUrl,
        apiBase: "https://public.api.paragraph.com/api",
      });
      
      try {
        // Fallback: Fetch the HTML page and extract contract address
        logger.debug(`[Paragraph] Fetching HTML from ${postUrl} to extract contract address`, {}, true);
        const htmlResponse = await fetch(postUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        
        if (htmlResponse.ok) {
          const html = await htmlResponse.text();
          // Look for contract address in the HTML (common patterns)
          const contractMatch = html.match(/0x[a-fA-F0-9]{40}/);
          if (contractMatch) {
            const extractedAddress = contractMatch[0];
            logger.debug(`[Paragraph] ✅ Extracted contract address from HTML: ${extractedAddress}`, {}, true);
            
            // Now use the contract address to look up the coin
            const coin = await getCoinByContract(extractedAddress);
            if (coin) {
              // We found the coin! Now build the token embed
              logger.debug(`[Paragraph] ✅ Found Paragraph coin via contract address`, {}, true);
              
              // Get token data and build embed
              const [baseTokenData, factory, contractCreation, creationTx] = await Promise.all([
                fetchBaseTokenData(extractedAddress),
                detectTokenFactory(extractedAddress),
                getContractCreation(extractedAddress).catch(() => null),
                getContractCreationTx(extractedAddress, "base", env.basescanApiKey).catch(() => null),
              ]);
              
              // Get author info
              let paragraphPostAuthor = null;
              if (contractCreation?.contractCreator) {
                paragraphPostAuthor = await getUserByWallet(contractCreation.contractCreator).catch(() => null);
              }
              
              const tokenName = baseTokenData?.tokenName ?? null;
              const tokenSymbol = baseTokenData?.tokenSymbol ?? coin.symbol ?? null;
              
              const { embed, components } = await buildBaseTokenEmbed(
                extractedAddress,
                tokenName,
                tokenSymbol,
                baseTokenData,
                factory,
                contractCreation?.contractCreator ?? null,
                contractCreation?.createdAt ?? null,
                creationTx?.hash ?? null,
                coin,
                paragraphPostAuthor ?? undefined,
                postUrl, // Use the original URL
              );
              
              await message.reply({ embeds: [embed], components });
              logger.debug(`[Paragraph] ✅ Sent token embed via HTML fallback`, {}, true);
              return true;
            }
          }
        }
      } catch (error) {
        logger.warn(`[Paragraph] HTML fallback failed`, { error: error instanceof Error ? error.message : String(error) });
      }
      
      // If all methods fail, return false
      logger.warn(`[Paragraph] All methods failed to get post/coin for ${publicationSlug}/${slug}`);
      return false;
    }
    
    logger.debug(`[Paragraph] ✅ Got post via API`, {
      postId: post.id,
      title: post.title,
      coinId: post.coinId,
      slug: post.slug,
      hasCoinId: !!post.coinId,
    }, true);
    
    // If post doesn't have coinId, it's not tokenized - we can't show token info
    if (!post.coinId) {
      logger.warn(`[Paragraph] Post does not have a coinId (not tokenized) - postId: ${post.id}, title: ${post.title}`);
      return false;
    }
    
    logger.debug(`[Paragraph] Post has coinId: ${post.coinId}, proceeding to fetch coin`, {}, true);
    
    // Step 2: Get coin by coinId to get contract address
    logger.debug(`[Paragraph] Getting coin by coinId: ${post.coinId}`, {}, true);
    const coinById = await getCoinById(post.coinId);
    
    if (!coinById) {
      logger.warn(`[Paragraph] Coin not found for coinId: ${post.coinId}`);
      return false;
    }
    
    const contractAddress = coinById.contractAddress;
    if (!contractAddress) {
      logger.warn(`[Paragraph] Coin ${post.coinId} does not have a contract address`);
      return false;
    }
    
    logger.debug(`[Paragraph] ✅ Got contract address: ${contractAddress} from coin ${post.coinId}`, {}, true);

    // Step 3: Verify the coin by contract address (we already have it, but this ensures consistency)
    logger.debug(`[Paragraph] Verifying coin by contract address: ${contractAddress}`, {}, true);
    const coin = await getCoinByContract(contractAddress);
    
    if (!coin) {
      logger.warn(`[Paragraph] Coin not found by contract address, but we have it from coinId - this is unexpected`);
      // Even if not a Paragraph coin, still show as Base token if it exists
      const [baseTokenData, factory] = await Promise.all([
        fetchBaseTokenData(contractAddress),
        detectTokenFactory(contractAddress),
      ]);

      if (baseTokenData) {
        logger.debug(`[Paragraph] Found as Base token, building embed`, {}, true);
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
        logger.debug(`[Paragraph] ✅ Sent Base token embed response`, {}, true);
        return true;
      }
      
      logger.warn(`[Paragraph] No Base token data found for ${contractAddress}`);
      return false;
    }
    
    logger.debug(`[Paragraph] ✅ Verified coin by contract address`, {}, true);

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
      
      // Step 2: Construct the proper post URL
      // Priority 1: Use publicationSlug directly from post API response (most reliable)
      if (post.publicationSlug && post.slug) {
        finalPostUrl = `https://paragraph.com/@${post.publicationSlug}/${post.slug}`;
        logger.debug(`[Paragraph] ✅ Constructed proper post URL from post API: ${finalPostUrl}`, {}, true);
      } else if (paragraphPostAuthor?.publicationId && post.slug) {
        // Priority 2: Use author's publicationId
        finalPostUrl = `https://paragraph.com/@${paragraphPostAuthor.publicationId}/${post.slug}`;
        logger.debug(`[Paragraph] ✅ Constructed proper post URL from author: ${finalPostUrl}`, {}, true);
      } else if (post.slug) {
        // Priority 3: Use the publication slug from the original URL (fallback)
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

    logger.debug(`[Paragraph] Building and sending token embed response`, {}, true);
    await message.reply({ embeds: [embed], components });
    logger.debug(`[Paragraph] ✅ Successfully sent Paragraph token embed response`, {}, true);
    return true;
  } catch (error) {
    logger.error(`[Paragraph] Error handling Paragraph post:`, error, {
      messageContent: message.content?.substring(0, 200),
      publicationSlug,
      slug,
    });
    return false;
  }
}

