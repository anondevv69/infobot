import TelegramBot from "node-telegram-bot-api";
import { isEthAddress, isSolAddress } from "../../../utils/address";
import { findBestZoraSummary } from "../../../services/zora";
import { fetchTokensByQuery, fetchTokensByAddress } from "../../../services/clanker";
import { findUserByUsername, findUserByWallet } from "../../../services/neynar";
import { buildZoraProfileEmbed, appendZoraSummaryFields } from "../../../utils/zoraEmbeds";
import { buildZoraWalletProfileResponse } from "../../../utils/walletEmbed";
import { isSummaryAssociatedWithAddress, isSummaryAssociatedWithUser } from "../../../utils/zoraAssociation";
import { sendClankerTokenPages } from "./clankerHandler";
import { buildFarcasterPresentation } from "../../../utils/farcasterPresentation";
import { buildWalletProfileResponse } from "../../../utils/walletEmbed";
import { sendPaginatedTelegramMessage } from "../utils/sendPaginated";
import { extractFirstAddress, extractZoraContractReference } from "../../../utils/address";
import { collectZoraIdentifiers } from "../../../utils/zoraPresentation";
import { safeFetchTokensByFid, safeFetchMostRecentCast } from "../../../utils/farcasterHelpers";
import { buildZoraCoinResponse } from "../../../handlers/zoraAddress";
import { fetchZoraCoin } from "../../../services/zora";
import { findUserByXHandle } from "../../../services/neynar";
import {
  fetchRelayTransaction,
  extractTransactionHash,
  detectChainFromLink,
} from "../../../services/relay";

export async function handleTelegramCommand(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  command: string,
  query?: string,
): Promise<void> {
  const chatId = msg.chat.id;

  try {
    switch (command) {
      case "start":
      case "help": {
        const helpText = `<b>📚 InfoBot Commands & Features</b>

<b>Commands:</b>
• <code>/search &lt;query&gt;</code> — Universal search (wallets, contracts, profiles, transactions)
• <code>/info &lt;query&gt;</code> — Alias for <code>/search</code>
• <code>/wallet &lt;address&gt;</code> — Search wallet across all EVM chains (Ethereum, Base, Monad)
• <code>/w &lt;address&gt;</code> — Wallet lookup (Ethereum or Solana)
• <code>/zora &lt;query&gt;</code> — Zora accounts, contracts, or creator coins
• <code>/z &lt;query&gt;</code> — Alias for <code>/zora</code>
• <code>/clanker &lt;query&gt;</code> — Clanker token deployments
• <code>/casts &lt;keyword&gt;</code> — Search Farcaster casts by keyword
• <code>/cast &lt;keyword&gt;</code> — Alias for <code>/casts</code>
• <code>/far &lt;query&gt;</code> — Search Farcaster users (username or wallet)
• <code>/x &lt;query&gt;</code> — Farcaster profile by X/Twitter handle or URL
• <code>/relay &lt;tx&gt;</code> — Cross-chain transaction details
• <code>/help</code> — Show this help message

<b>Auto-Detection:</b>
Paste in chat:
• Addresses (0x... or SOL) — Auto-detects Zora/Clanker/Base tokens
• <code>@username</code> — Farcaster profile lookup
• <code>zora.co/...</code> — Zora profile/coin
• <code>clanker.world</code> — Clanker token
• <code>x.com/...</code> or <code>twitter.com/...</code> — Farcaster profile (if linked)
• <code>farcaster.xyz/...</code> — Farcaster cast/profile
• <code>base.org/...</code> or <code>base.app/...</code> — Base post
• <code>cast &lt;keyword&gt;</code> — Cast search
• <code>far &lt;keyword&gt;</code> — Farcaster user search
• <code>zora &lt;query&gt;</code> — Zora search
• <code>wallet 0x...</code> — Wallet lookup
• <code>info &lt;query&gt;</code> — Universal search (no slash needed)

<b>Features:</b>
• Multi-page cards with pagination
• Zora coins, profiles, creator detection
• Farcaster profiles, casts, wallet links
• Clanker tokens with deployer info
• Base token factory detection
• Multi-chain token support (Ethereum, Base, Monad, Solana)
• Cross-chain transaction tracking

Fast blockchain discovery—drop any address, profile, or link.`;
        await bot.sendMessage(chatId, helpText, { parse_mode: "HTML" });
        break;
      }

      case "search": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a search query.\n\nUsage: <code>/search &lt;query&gt;</code>\nExample: <code>/search 0x1234...</code> or <code>/search @username</code>", { parse_mode: "HTML" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
        await handleSearchQuery(bot, chatId, query, msg.from?.id);
        break;
      }

      case "zora": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a Zora query.\n\nUsage: <code>/zora &lt;query&gt;</code>\nExample: <code>/zora @username</code> or <code>/zora 0x1234...</code>", { parse_mode: "HTML" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
        await handleZoraQuery(bot, chatId, query, msg.from?.id);
        break;
      }

      case "clanker": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a Clanker query.\n\nUsage: <code>/clanker &lt;query&gt;</code>\nExample: <code>/clanker tokenname</code> or <code>/clanker 0x1234...</code>", { parse_mode: "HTML" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
        await handleClankerQuery(bot, chatId, query, msg.from?.id);
        break;
      }

      case "relay": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a full transaction link from a block explorer.\n\nUsage: <code>/relay &lt;transaction_link&gt;</code>\n\n<b>Example:</b>\n<code>/relay https://basescan.org/tx/0x281d831decc5fd1832f5a84155a88da8918a16f68c57c512b7ca7d6a687d8e70</code>\n\nOr provide a transaction hash:\n<code>/relay 0x281d831decc5fd1832f5a84155a88da8918a16f68c57c512b7ca7d6a687d8e70</code>", { parse_mode: "HTML" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
        try {
          // First, check if input is a wallet address (Ethereum or Solana)
          // This must be checked BEFORE trying to extract transaction hash
          // because wallet addresses might match transaction hash patterns
          const trimmedQuery = query.trim();
          const isWalletAddress = isEthAddress(trimmedQuery) || isSolAddress(trimmedQuery);
          
          if (isWalletAddress) {
            // Query by wallet address to get the most recent transaction
            const { fetchRelayTransactionByWallet } = await import("../../../services/relay");
            const transaction = await fetchRelayTransactionByWallet(trimmedQuery);
            
            if (!transaction) {
              await bot.sendMessage(chatId, `❌ No Relay transactions found for wallet <code>${trimmedQuery}</code>.\n\n<b>Possible reasons:</b>\n• This wallet has not made any Relay cross-chain transactions\n• The wallet address format is incorrect`, { parse_mode: "HTML" });
              return;
            }
            
            // Build message with transaction details
            let message = `<b>🌉 Relay Cross-Chain Transaction</b>\n\n`;
            message += `<b>📤 Source:</b>\n`;
            message += `Chain: ${transaction.sourceChain.chainName}\n`;
            message += `Wallet: <code>${transaction.sourceChain.wallet}</code>\n\n`;
            message += `<b>📥 Destination:</b>\n`;
            message += `Chain: ${transaction.destinationChain.chainName}\n`;
            message += `Wallet: <code>${transaction.destinationChain.wallet}</code>\n\n`;

            if (transaction.amount) {
              message += `<b>💰 Amount:</b> `;
              if (transaction.token) {
                message += `${transaction.amount} ${transaction.token.symbol}\n`;
              } else {
                message += `${transaction.amount}\n`;
              }
            }

            if (transaction.token) {
              message += `\n<b>🪙 Token:</b> ${transaction.token.symbol}\n`;
              message += `<code>${transaction.token.address}</code>\n`;
            }

            if (transaction.status) {
              message += `\n<b>📊 Status:</b> ${transaction.status}\n`;
            }

            message += `\n<b>Transaction Hash:</b>\n<code>${transaction.txHash}</code>`;

            await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
            return;
          }

          // Extract transaction hash from input
          const txHash = extractTransactionHash(query);
          if (!txHash) {
            // Check if it's an Ethereum address (42 chars) vs transaction hash (66 chars)
            const trimmedQuery = query.trim();
            const isEthAddress = /^0x[a-fA-F0-9]{40}$/i.test(trimmedQuery);
            // Solana addresses are typically 32-48 chars, transaction signatures are 43-88 chars
            const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,42}$/.test(trimmedQuery);
            const isEvmLikeButWrongLength = /^0x[a-fA-F0-9]+$/i.test(trimmedQuery) && !isEthAddress;
            
            let errorMessage = "❌ Could not extract a valid transaction hash from the provided input.\n\n";
            
            if (isEthAddress) {
              errorMessage += `<b>Invalid Length:</b> You provided <code>${trimmedQuery}</code> (${trimmedQuery.length} characters).\n\n`;
              errorMessage += "<b>This is an Ethereum address, not a transaction hash.</b>\n\n";
              errorMessage += "<b>Transaction Hash Requirements:</b>\n";
              errorMessage += "• Must start with <code>0x</code>\n";
              errorMessage += "• Must be <b>66 characters total</b> (0x + 64 hex characters)\n";
              errorMessage += "• Must contain exactly 64 hex characters after the <code>0x</code>\n\n";
              errorMessage += "<b>Examples:</b>\n";
              errorMessage += "❌ Invalid (42 chars = address): <code>0x9c212798d6353ef790a68f3803fc3279d286a0e9</code>\n";
              errorMessage += "✅ Valid (66 chars = tx hash): <code>0x9c212798d6353ef790a68f3803fc3279d286a0e91234567890abcdef1234567890abcdef</code>\n\n";
              errorMessage += "<b>Solution:</b>\n";
              errorMessage += "• Use a full transaction hash from a block explorer\n";
              errorMessage += "• Or use this address directly to find the most recent transaction\n";
              errorMessage += "• Or provide a transaction link from a block explorer";
            } else if (isEvmLikeButWrongLength) {
              const hexLength = trimmedQuery.length - 2; // Subtract "0x"
              errorMessage += `<b>Invalid Length:</b> You provided <code>${trimmedQuery}</code> (${trimmedQuery.length} characters, ${hexLength} hex chars).\n\n`;
              errorMessage += "<b>Transaction Hash Requirements:</b>\n";
              errorMessage += "• Must start with <code>0x</code>\n";
              errorMessage += "• Must be <b>66 characters total</b> (0x + 64 hex characters)\n";
              errorMessage += "• Must contain exactly <b>64 hex characters</b> after the <code>0x</code>\n\n";
              errorMessage += "<b>Your input:</b>\n";
              errorMessage += `• Length: ${trimmedQuery.length} characters (need 66)\n`;
              errorMessage += `• Hex chars: ${hexLength} (need 64)\n\n`;
              errorMessage += "<b>Examples:</b>\n";
              errorMessage += "❌ Invalid: <code>0x9c212798d6353ef790a68f3803fc3279d286a0e9</code> (42 chars)\n";
              errorMessage += "✅ Valid: <code>0x9c212798d6353ef790a68f3803fc3279d286a0e91234567890abcdef1234567890abcdef</code> (66 chars)\n\n";
              errorMessage += "<b>Solution:</b> Get the full transaction hash from a block explorer (Etherscan, Basescan, etc.)";
            } else if (isSolanaAddress) {
              errorMessage += `<b>Invalid Length:</b> You provided <code>${trimmedQuery}</code> (${trimmedQuery.length} characters).\n\n`;
              errorMessage += "<b>This looks like a Solana address, not a transaction signature.</b>\n\n";
              errorMessage += "<b>Solana Transaction Signature Requirements:</b>\n";
              errorMessage += "• Must be <b>43-88 characters long</b> (base58 encoded)\n";
              errorMessage += "• Must contain only base58 characters (1-9, A-H, J-N, P-Z, a-k, m-z)\n\n";
              errorMessage += "<b>Solution:</b>\n";
              errorMessage += "• Use a full transaction signature from Solscan\n";
              errorMessage += "• Or use this address directly to find the most recent transaction\n";
              errorMessage += "• <b>Note:</b> Relay only supports EVM transaction hashes, so for Solana→EVM relays, use the destination EVM hash";
            } else {
              errorMessage += "<b>Transaction Hash Requirements:</b>\n\n";
              errorMessage += "<b>EVM Transaction Hash:</b>\n";
              errorMessage += "• Must start with <code>0x</code>\n";
              errorMessage += "• Must be <b>66 characters total</b> (0x + 64 hex characters)\n";
              errorMessage += "• Must contain exactly 64 hex characters after the <code>0x</code>\n\n";
              errorMessage += "<b>Solana Transaction Signature:</b>\n";
              errorMessage += "• Must be <b>43-88 characters long</b> (base58 encoded)\n\n";
              errorMessage += "<b>Please provide:</b>\n";
              errorMessage += "• A full EVM transaction hash (66 characters: 0x + 64 hex)\n";
              errorMessage += "• A Solana transaction signature (43-88 base58 characters)\n";
              errorMessage += "• A transaction link from a block explorer\n";
              errorMessage += "• A wallet address to find the most recent transaction";
            }
            
            await bot.sendMessage(chatId, errorMessage, { parse_mode: "HTML" });
            return;
          }

          // Detect source chain from link if possible
          // Try advanced detection first (checks Relay API for all chains), fallback to basic
          let sourceChainId: number | null = null;
          try {
            const { detectChainFromLinkAdvanced } = await import("../../../services/relay");
            sourceChainId = await detectChainFromLinkAdvanced(query);
          } catch (error) {
            // Fallback to basic detection
            sourceChainId = detectChainFromLink(query);
          }

          // Fetch transaction data from Relay.link
          const transaction = await fetchRelayTransaction(txHash, sourceChainId || undefined);

          if (!transaction) {
            // Check if this is a Solana transaction (base58, 43-88 chars, not starting with 0x)
            const isSolanaTx = !txHash.startsWith("0x") && txHash.length >= 43 && txHash.length <= 88 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(txHash);
            // Check if this is a valid EVM transaction hash format
            const isEvmTxHash = txHash.startsWith("0x") && txHash.length === 66 && /^0x[a-fA-F0-9]{64}$/i.test(txHash);
            // Check if the input was from a relay.link URL (to provide specific guidance)
            const wasFromRelayLink = query.toLowerCase().includes("relay.link");
            
            let errorMessage = `❌ Transaction <code>${txHash}</code> not found on Relay.link API.\n\n<b>Possible reasons:</b>\n• The transaction may not be a Relay cross-chain transaction\n• The transaction may not be indexed yet\n• The transaction might be too old or not tracked by Relay`;
            
            if (isSolanaTx) {
              errorMessage += `\n\n<b>Note:</b> Solana transaction signatures are <b>not supported</b> by the Relay API. The API only supports EVM-compatible transaction hashes (0x...).\n\n<b>Solution:</b> If this is a Relay cross-chain transaction:\n1. Open the Relay transaction page using this Solana signature\n2. Find the <b>destination transaction hash</b> (the EVM chain transaction hash, not the Solana signature)\n3. Use that EVM transaction hash (0x...) with this command`;
            } else if (wasFromRelayLink && isEvmTxHash) {
              // If it came from a relay.link URL and looks like a transaction hash, it might be a Relay transaction ID
              errorMessage += `\n\n<b>Note:</b> If you extracted this from a <code>relay.link/transaction/</code> URL, Relay transaction IDs are <b>not supported</b> by the Relay API. The API only supports querying by actual blockchain transaction hashes.\n\n<b>Solution:</b> Open the Relay transaction page and look for the <b>source</b> or <b>destination</b> transaction hash (the actual blockchain transaction, not Relay's internal ID). Use that hash instead.`;
            } else if (isEvmTxHash) {
              errorMessage += `\n\n<b>Note:</b> If the transaction is very recent, it may take a few minutes to appear in Relay's system.\n\n<b>Troubleshooting:</b>\n• Verify this is a Relay cross-chain transaction\n• Try using the wallet address that initiated the transaction instead\n• Check if the transaction completed successfully on the source chain`;
            } else {
              errorMessage += `\n\n<b>Note:</b> If the transaction is very recent, it may take a few minutes to appear in Relay's system.`;
            }
            
            await bot.sendMessage(chatId, errorMessage, { parse_mode: "HTML" });
            return;
          }

          // Build message with transaction details
          let message = `<b>🌉 Relay Cross-Chain Transaction</b>\n\n`;
          message += `<b>📤 Source:</b>\n`;
          message += `Chain: ${transaction.sourceChain.chainName} (${transaction.sourceChain.chainId})\n`;
          message += `Wallet: <code>${transaction.sourceChain.wallet}</code>\n\n`;
          message += `<b>📥 Destination:</b>\n`;
          message += `Chain: ${transaction.destinationChain.chainName} (${transaction.destinationChain.chainId})\n`;
          message += `Wallet: <code>${transaction.destinationChain.wallet}</code>\n\n`;

          if (transaction.amount) {
            message += `<b>💰 Amount:</b> `;
            if (transaction.token) {
              message += `${transaction.amount} ${transaction.token.symbol}\n`;
            } else {
              message += `${transaction.amount}\n`;
            }
          }

          if (transaction.token) {
            message += `\n<b>🪙 Token:</b> ${transaction.token.symbol}\n`;
            message += `<code>${transaction.token.address}</code>\n`;
          }

          if (transaction.status) {
            message += `\n<b>📊 Status:</b> ${transaction.status}\n`;
          }

          message += `\n<b>Transaction Hash:</b>\n<code>${txHash}</code>`;

          await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
        } catch (error) {
          console.error("Error handling relay command:", error);
          await bot.sendMessage(chatId, `❌ Error fetching transaction data: ${error instanceof Error ? error.message : "Unknown error"}`, { parse_mode: "HTML" });
        }
        break;
      }

      case "casts": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a keyword to search for casts.\n\nUsage: <code>/casts &lt;keyword&gt;</code>\nExample: <code>/casts base</code>", { parse_mode: "HTML" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
        await handleCastsQuery(bot, chatId, query);
        break;
      }

      case "wallet": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a wallet address.\n\nUsage: <code>/wallet &lt;address&gt;</code>\nExample: <code>/wallet 0x1234...</code>", { parse_mode: "HTML" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
        // Use the same search handler as /search for addresses
        await handleSearchQuery(bot, chatId, query, msg.from?.id);
        break;
      }

      default:
        await bot.sendMessage(chatId, "Unknown command. Use /help to see available commands.");
    }
  } catch (error) {
    const { logger } = await import("../../../utils/logger");
    logger.error(`Error handling Telegram command: ${command}`, error, {
      command,
      chatId: msg.chat.id.toString(),
      userId: msg.from?.id.toString(),
      platform: "telegram",
    });
    await bot.sendMessage(chatId, "An error occurred while processing your command. Please try again later.");
  }
}

async function handleSearchQuery(bot: TelegramBot, chatId: number, query: string, userId?: number): Promise<void> {
  const { logger } = await import("../../../utils/logger");
  const { trackSearch, trackResponseTime } = await import("../../../utils/botStats");
  
  // Track search
  trackSearch();
  
  // Track response time
  const startTime = Date.now();
  
  // Don't log initial search - only log if it fails or gets stuck
  
  try {
    // Try address first
    if (isEthAddress(query) || isSolAddress(query)) {
      const address = extractFirstAddress(query);
      if (address) {
        // Try Clanker (build all pages)
        const clankerSent = await sendClankerTokenPages(bot, chatId, address);
        if (clankerSent) {
          logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
            success: true,
            type: "wallet_clanker_token",
          });
          return;
        }

        // Check for Base tokens and multi-chain tokens BEFORE falling back to Zora profile
        // This ensures contracts are detected as tokens, not just Zora profiles
        if (isEthAddress(address)) {
          // Check for Paragraph coin first (tokenized posts)
          const { getCoinByContract } = await import("../../../services/paragraph");
          const paragraphCoin = await getCoinByContract(address).catch(() => null);
          
          // Check for Base tokens (Rainbow, ApeStore, Fey, Paragraph, etc.)
          const { fetchBaseTokenData, fetchMultiChainTokenData } = await import("../../../services/dexscreener");
          const { detectTokenFactory } = await import("../../../services/baseFactories");
          const { getContractCreation } = await import("../../../services/contractCreation");
          const { buildBaseTokenEmbed } = await import("../../../utils/baseTokenEmbeds");
          const { buildMultiChainTokenEmbed } = await import("../../../utils/multiChainTokenEmbeds");
          const { embedsToTelegram } = await import("../../telegram/adapters/telegramAdapter");
          
          const [baseTokenData, factory] = await Promise.all([
            fetchBaseTokenData(address),
            detectTokenFactory(address),
          ]);

          if (baseTokenData) {
            // Fetch creator address for Base tokens
            const contractCreation = await getContractCreation(address, "base").catch(() => null);
            
            // If this is a Paragraph token, fetch post details and author
            let paragraphPostAuthor: { name?: string | null; bio?: string | null; farcaster?: { username: string } | null; publicationId?: string | null; walletAddress?: string } | null = null;
            let paragraphPostUrl: string | null = null;
            
            if (paragraphCoin) {
              try {
                const { getPostById } = await import("../../../services/paragraph");
                const post = await getPostById(paragraphCoin.postId, {
                  includeAuthor: true,
                  includePublication: true,
                  includeContent: false,
                });
                
                if (post) {
                  // Build post URL from publication slug and post slug
                  if (post.publicationSlug && post.slug) {
                    paragraphPostUrl = `https://paragraph.com/@${post.publicationSlug}/${post.slug}`;
                  } else if (post.publicationSlug) {
                    paragraphPostUrl = `https://paragraph.com/@${post.publicationSlug}`;
                  }
                  
                  // Extract author information
                  if (post.author || post.authorId) {
                    const author = post.author;
                    const authorWallet = author?.walletAddress ?? author?.wallet ?? undefined;
                    paragraphPostAuthor = {
                      name: author?.name ?? null,
                      bio: null,
                      farcaster: null,
                      publicationId: author?.publicationId ?? post.publicationId ?? null,
                      walletAddress: authorWallet,
                    };
                    
                    // If we have a wallet address, try to get full user info including Farcaster
                    if (authorWallet) {
                      try {
                        const { getUserByWallet } = await import("../../../services/paragraph");
                        const fullUser = await getUserByWallet(authorWallet);
                        if (fullUser && paragraphPostAuthor) {
                          paragraphPostAuthor.farcaster = fullUser.farcaster ? {
                            username: fullUser.farcaster.username,
                          } : null;
                          paragraphPostAuthor.name = paragraphPostAuthor.name ?? fullUser.name ?? null;
                          paragraphPostAuthor.publicationId = paragraphPostAuthor.publicationId ?? fullUser.publicationId ?? null;
                        }
                      } catch (error) {
                        // Ignore errors fetching full user info
                      }
                    }
                  }
                }
              } catch (error) {
                // Ignore errors fetching post details
                console.warn(`[Telegram Search] Failed to fetch Paragraph post details:`, error);
              }
            }
            
            const { embed, components } = await buildBaseTokenEmbed(
              address,
              null, // tokenName
              null, // tokenSymbol
              baseTokenData,
              factory,
              contractCreation?.contractCreator ?? null,
              contractCreation?.createdAt ?? null,
              contractCreation?.txHash ?? null,
              paragraphCoin ?? null,
              paragraphPostAuthor ?? undefined,
              paragraphPostUrl ?? undefined,
            );

            const telegramMessages = embedsToTelegram([embed]);
            const telegramText = Array.isArray(telegramMessages) ? telegramMessages.join("\n\n") : telegramMessages;
            
            await bot.sendMessage(chatId, telegramText, {
              parse_mode: "HTML",
              disable_web_page_preview: true,
            });
            
            logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
              success: true,
              type: "wallet_base_token",
            });
            return;
          }

          // Check for multi-chain tokens (Mantle, BSC, Monad, etc.)
          let multiChainTokenData;
          try {
            multiChainTokenData = await fetchMultiChainTokenData(address);
          } catch (err) {
            console.error(`[Telegram Search] Multi-chain fetch failed for ${address}:`, err);
          }

          if (multiChainTokenData) {
            const chainIdLower = multiChainTokenData.chainId.toLowerCase();
            // Check if it's a Monad token from DexScreener (with market data)
            const isMonadTokenFromDexScreener = (
              multiChainTokenData.chainId === "5001" || 
              chainIdLower === "monad"
            );
            
            if (isMonadTokenFromDexScreener) {
              // Monad token found on DexScreener - use it with market data
              logger.debug(`[Telegram Search] ✅ Found Monad token on DexScreener for ${address}`, { address }, true);
              const { buildMultiChainTokenEmbed } = await import("../../../utils/multiChainTokenEmbeds");
              const { embedsToTelegram } = await import("../../telegram/adapters/telegramAdapter");
              const { getContractCreation } = await import("../../../services/contractCreation");
              const { getTokenFactoryName } = await import("../../../services/baseFactories");
              
              // Get contract creation info for factory detection
              const contractCreation = await getContractCreation(address, "monad").catch(() => null);
              let factoryName: string | null = null;
              if (contractCreation?.contractCreator) {
                factoryName = getTokenFactoryName(contractCreation.contractCreator);
              }
              
              // Merge DexScreener data with contract creation info
              const monadTokenData: import("../../../services/dexscreener").MultiChainTokenData = {
                ...multiChainTokenData,
                creatorAddress: contractCreation?.contractCreator ?? multiChainTokenData.creatorAddress ?? null,
                factoryName: factoryName ?? multiChainTokenData.factoryName ?? null,
                createdAt: contractCreation?.createdAt ?? multiChainTokenData.createdAt ?? null,
                creationTxHash: contractCreation?.txHash ?? multiChainTokenData.creationTxHash ?? null,
              };
              
              const { embed, components } = await buildMultiChainTokenEmbed(address, monadTokenData);
              const telegramMessages = embedsToTelegram([embed]);
              const telegramText = Array.isArray(telegramMessages) ? telegramMessages.join("\n\n") : telegramMessages;
              
              await bot.sendMessage(chatId, telegramText, {
                parse_mode: "HTML",
                disable_web_page_preview: true,
              });
              
              logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
                success: true,
                type: "wallet_monad_token",
              });
              return;
            }
            
            // Only show other multi-chain tokens if it's NOT Base (Base tokens handled above)
            if (chainIdLower !== "base" && multiChainTokenData.chainId !== "8453") {
              const { embed, components } = await buildMultiChainTokenEmbed(address, multiChainTokenData);
              const telegramMessages = embedsToTelegram([embed]);
              const telegramText = Array.isArray(telegramMessages) ? telegramMessages.join("\n\n") : telegramMessages;
              
              await bot.sendMessage(chatId, telegramText, {
                parse_mode: "HTML",
                disable_web_page_preview: true,
              });
              
              logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
                success: true,
                type: "wallet_multi_chain_token",
              });
              return;
            }
          }

        }

        // Try Zora profile lookup (Zora-only wallet, no Farcaster user)
        // Only show if the summary is actually associated with the address
        // AND only if no tokens were found above
        // AND only if it meets our criteria (has posts or X/Farcaster links)
        const zoraSummary = await findBestZoraSummary([address.toLowerCase()]);
        if (zoraSummary && isSummaryAssociatedWithAddress(zoraSummary, address)) {
          const { shouldShowZoraFallback } = await import("../../../utils/zoraAssociation");
          
          // Only show if there are posts/coins OR X/Farcaster links
          if (shouldShowZoraFallback(zoraSummary)) {
            // If Zora profile has a Farcaster handle, fetch and display the Farcaster profile
            // This provides complete profile context that users rely on (same as Discord)
            const { findUserByUsername } = await import("../../../services/neynar");
            const { buildFarcasterPresentation } = await import("../../../utils/farcasterPresentation");
            const { safeFetchTokensByFid, safeFetchMostRecentCast } = await import("../../../utils/farcasterHelpers");
            const { embedsToTelegram } = await import("../../telegram/adapters/telegramAdapter");
            const { sendPaginatedTelegramMessage } = await import("../utils/sendPaginated");
            
            let farcasterEmbeds: Awaited<ReturnType<typeof buildFarcasterPresentation>> | null = null;
            const farcasterHandle = zoraSummary.profile.farcasterHandle;
            
            if (farcasterHandle) {
              try {
                const farcasterUser = await findUserByUsername(farcasterHandle.replace(/^@/, ""));
                if (farcasterUser) {
                  // Fetch tokens and latest cast for complete Farcaster profile
                  const [tokens, latestCast] = await Promise.all([
                    safeFetchTokensByFid(farcasterUser.fid),
                    safeFetchMostRecentCast(farcasterUser.fid),
                  ]);
                  
                  farcasterEmbeds = await buildFarcasterPresentation(farcasterUser, {
                    tokens,
                    latestCast,
                    zoraSummary: zoraSummary, // Include Zora data in Farcaster presentation
                    titleSuffix: "Farcaster Profile",
                  });
                }
              } catch (error) {
                console.warn("Failed to fetch Farcaster profile for Zora fallback:", error);
              }
            }

            // If we have Farcaster embeds, use those (they include Zora data and have better presentation)
            // Otherwise, fall back to Zora-only profile
            if (farcasterEmbeds) {
              const telegramMessages = embedsToTelegram(farcasterEmbeds.embeds);
              const telegramText = Array.isArray(telegramMessages) ? telegramMessages.join("\n\n") : telegramMessages;
              
              await bot.sendMessage(chatId, telegramText, {
                parse_mode: "HTML",
                disable_web_page_preview: true,
              });
              
              logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
                success: true,
                type: "wallet_farcaster_via_zora",
              });
            } else {
              // Use buildZoraWalletProfileResponse for wallet lookups (same as Discord)
              const zoraResponse = buildZoraWalletProfileResponse({
                wallet: address,
                summary: zoraSummary,
                returnAllPages: true, // Get all pages for Telegram
              });
              
              const identifier = `zora_wallet_${address.toLowerCase()}`;
              await sendPaginatedTelegramMessage(bot, chatId, zoraResponse.embeds, identifier);
              
              logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
                success: true,
                type: "wallet_zora_profile",
              });
            }
            return;
          }
        }

        // Final fallback: Try to get basic address information across chains (same as Discord)
        const { lookupAddress } = await import("../../../services/addressLookup");
        const { embedsToTelegram } = await import("../../telegram/adapters/telegramAdapter");
        const { applyBranding } = await import("../../../utils/branding");
        const { EmbedBuilder } = await import("discord.js");
        
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

          // Apply branding first (this sets the footer with branding)
          applyBranding(embed, "address lookup");
          
          // Append address to footer (preserving branding)
          const currentFooter = embed.data.footer;
          if (currentFooter) {
            embed.setFooter({
              text: `${currentFooter.text} • Address: ${address.slice(0, 10)}...${address.slice(-8)}`,
              iconURL: currentFooter.icon_url ?? undefined,
            });
          }
          
          // Convert Discord embed to Telegram message
          const telegramMessages = await embedsToTelegram([embed]);
          const telegramText = Array.isArray(telegramMessages) ? telegramMessages.join("\n\n") : telegramMessages;
          
          await bot.sendMessage(
            chatId,
            `No Farcaster profile, Clanker deployments, or Zora coins found for \`${address}\`, but found activity on the following chain(s):\n\n${telegramText}`,
            {
              parse_mode: "HTML",
              disable_web_page_preview: true,
            }
          );
          
          logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
            success: true,
            type: "wallet_address_lookup",
          });
          return;
        }

        // Try wallet (need to find user first)
        try {
          const user = await findUserByWallet(address);
          if (user) {
            const [tokens, latestCast, zoraSummary, paragraphUser] = await Promise.all([
              safeFetchTokensByFid(user.fid),
              safeFetchMostRecentCast(user.fid),
              findBestZoraSummary(collectZoraIdentifiers(user)),
              import("../../../services/paragraph").then(m => m.getUserByWallet(address)).catch(() => null),
            ]);
            const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;
            
            const walletResponse = await buildWalletProfileResponse({
              wallet: address,
              user,
              zoraSummary: associatedSummary,
              clankerTokens: tokens,
              latestCast,
              paragraphUser: paragraphUser ?? undefined,
              returnAllPages: true, // Get all pages for Telegram
            });
            if (walletResponse && walletResponse.embeds.length > 0) {
              const identifier = `wallet_${address.toLowerCase()}`;
              const pageLabels = walletResponse.embeds.length > 1 
                ? ["Profile", "Clankers & Zora"] 
                : undefined;
              await sendPaginatedTelegramMessage(bot, chatId, walletResponse.embeds, identifier, pageLabels);
              
              logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
                success: true,
                type: "wallet_farcaster",
              });
              return;
            }
          }
        } catch (error) {
          // User not found, continue
        }
      }
    }

    // Try X/Twitter account link
    const xLinkRegex = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>()]+/gi;
    if (xLinkRegex.test(query)) {
      const handles = extractXHandles(query);
      for (const handle of handles) {
        if (!handle) continue;

        // Use Neynar API to search X account directly - it searches against Farcaster profiles
        const byXHandle = await findUserByXHandle(handle);
        
        // If the experimental endpoint works, use it directly
        // Only fallback to username lookup if the endpoint fails (402 Payment Required)
        let byUsername = null;
        if (!byXHandle) {
          // Fallback: try username lookup and check if it has matching X account
          // This is only needed if the experimental endpoint requires Enterprise tier
          try {
            byUsername = await findUserByUsername(handle);
            // Only use if it has matching X account
            if (byUsername && !userHasMatchingXAccount(byUsername, handle)) {
              byUsername = null;
            }
          } catch (error) {
            // User not found, continue
          }
        }

        // Trust the X handle lookup result (it searches X accounts directly)
        // Only use username fallback if X handle lookup failed
        const farcasterUser = byXHandle ?? byUsername;
        
        // Search for Zora profile by X handle independently
        // This finds Zora profiles that have the X handle linked, even if not linked to Farcaster
        const { findZoraByXHandle } = await import("../../../services/zora");
        const zoraByXHandle = await findZoraByXHandle(handle);
        
        // If we found a Farcaster user, also try to get their Zora profile
        let zoraFromFarcaster: Awaited<ReturnType<typeof findBestZoraSummary>> = null;
        if (farcasterUser) {
          zoraFromFarcaster = await findBestZoraSummary(collectZoraIdentifiers(farcasterUser));
        }
        
        // Prefer Zora profile found by X handle, but also include Farcaster-linked Zora if different
        const zoraSummary = zoraByXHandle ?? zoraFromFarcaster;
        
        if (farcasterUser) {
          const [tokens, latestCast] = await Promise.all([
            safeFetchTokensByFid(farcasterUser.fid),
            safeFetchMostRecentCast(farcasterUser.fid),
          ]);

          const result = await buildFarcasterPresentation(farcasterUser, {
            tokens,
            zoraSummary: zoraSummary, // Show Zora if found by X handle, even if not linked to Farcaster
            latestCast,
            returnAllPages: true, // Get all pages for Telegram
          });
          const identifier = `farcaster_x_${handle}`;
          const pageLabels = result.embeds.length > 1
            ? ["Profile", "Clankers & Zora"]
            : undefined;
          await sendPaginatedTelegramMessage(bot, chatId, result.embeds, identifier, pageLabels);
          
          logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
            success: true,
            type: "x_twitter",
          });
          return;
        }
        
        // If no Farcaster user but we found a Zora profile by X handle, show that
        if (zoraSummary) {
          const { buildZoraProfileEmbed, appendZoraSummaryFields } = await import("../../../utils/zoraEmbeds");
          const { embedsToTelegram } = await import("../../telegram/adapters/telegramAdapter");
          const zoraEmbed = buildZoraProfileEmbed(zoraSummary);
          await appendZoraSummaryFields(zoraEmbed, zoraSummary);
          const telegramMessages = embedsToTelegram([zoraEmbed]);
          const telegramText = Array.isArray(telegramMessages) ? telegramMessages.join("\n\n") : telegramMessages;
          await bot.sendMessage(chatId, telegramText, {
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });
          
          logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
            success: true,
            type: "x_twitter_zora",
          });
          return;
        }

        // If no Farcaster profile found
        await bot.sendMessage(chatId, `No Farcaster profile linked to X handle @${handle}.`);
        
        logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
          success: false,
          type: "farcaster_not_found",
        });
        return;
      }
    }

    // Try Farcaster username
    const normalizedUsername = query.replace(/^@/, "").toLowerCase();
    try {
      const user = await findUserByUsername(normalizedUsername);
      if (user) {
        const [tokens, latestCast, zoraSummary] = await Promise.all([
          safeFetchTokensByFid(user.fid),
          safeFetchMostRecentCast(user.fid),
          findBestZoraSummary(collectZoraIdentifiers(user)),
        ]);
        const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;
        
        const result = await buildFarcasterPresentation(user, {
          tokens,
          zoraSummary: associatedSummary,
          latestCast,
          returnAllPages: true, // Get all pages for Telegram
        });
        const identifier = `farcaster_${user.fid}`;
        const pageLabels = result.embeds.length > 1
          ? ["Profile", "Clankers & Zora"]
          : undefined;
        await sendPaginatedTelegramMessage(bot, chatId, result.embeds, identifier, pageLabels);
        
        logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
          success: true,
          type: "farcaster",
        });
        return;
      }
    } catch (error) {
      // User not found, continue
    }

    // Try Farcaster username lookup first
    try {
      const user = await findUserByUsername(normalizedUsername);
      if (user) {
        const [tokens, latestCast, zoraSummary] = await Promise.all([
          safeFetchTokensByFid(user.fid),
          safeFetchMostRecentCast(user.fid),
          findBestZoraSummary(collectZoraIdentifiers(user)),
        ]);
        const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;

        const result = await buildFarcasterPresentation(user, {
          tokens,
          zoraSummary: associatedSummary,
          latestCast,
          returnAllPages: true, // Get all pages for Telegram
        });
        const identifier = `farcaster_username_${normalizedUsername}`;
        const pageLabels = result.embeds.length > 1
          ? ["Profile", "Clankers & Zora"]
          : undefined;
        await sendPaginatedTelegramMessage(bot, chatId, result.embeds, identifier, pageLabels);
        
        logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
          success: true,
          type: "farcaster",
        });
        return;
      }
    } catch (error) {
      // User not found, continue to Zora lookup
    }

    // Fallback to Zora profile if Farcaster not found
    const zoraSummary = await findBestZoraSummary([normalizedUsername, `@${normalizedUsername}`, `${normalizedUsername}.eth`]);
    if (zoraSummary) {
      const embed = buildZoraProfileEmbed(zoraSummary);
      await appendZoraSummaryFields(embed, zoraSummary);
      // Split into pages if needed (same as Discord)
      const { splitEmbedIntoPages } = await import("../../../utils/pagination");
      const embeds = splitEmbedIntoPages(embed, 15);
      const identifier = `zora_profile_${normalizedUsername}`;
      await sendPaginatedTelegramMessage(bot, chatId, embeds, identifier);
      
      logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
        success: true,
        type: "zora",
      });
      return;
    }

    await bot.sendMessage(chatId, `No results found for: ${query}`);
    
    logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
      success: false,
      type: "not_found",
    });
  } catch (error) {
    logger.error(`Error in handleSearchQuery: ${query}`, error, {
      query,
      chatId: chatId.toString(),
      userId: userId?.toString(),
      platform: "telegram",
    });
    await bot.sendMessage(chatId, "An error occurred while searching. Please try again.");
  } finally {
    // Track response time for this command
    const responseTime = Date.now() - startTime;
    trackResponseTime(responseTime);
  }
}

/**
 * Extract X/Twitter handles from text
 */
function extractXHandles(content: string): string[] {
  const handles = new Set<string>();
  const xLinkRegex = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^\s<>()]+/gi;
  const matches = content.matchAll(xLinkRegex);
  for (const match of matches) {
    const url = match[0];
    const handle = parseHandleFromUrl(url);
    if (handle) {
      handles.add(handle.toLowerCase());
    }
  }
  return Array.from(handles);
}

/**
 * Parse handle from X/Twitter URL
 */
function parseHandleFromUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    let candidate: string | null = null;
    if (segments.length > 0 && segments[0].toLowerCase() !== "i") {
      candidate = segments[0];
    }
    if (!candidate) {
      const screenName = url.searchParams.get("screen_name");
      if (screenName) {
        candidate = screenName;
      }
    }
    if (!candidate) {
      return null;
    }
    const normalized = candidate.replace(/^@/, "").trim();
    if (!normalized || !/^[a-zA-Z0-9_]{1,15}$/.test(normalized)) {
      return null;
    }
    return normalized.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check if user has matching X account
 */
function userHasMatchingXAccount(user: any, handle: string): boolean {
  if (!user?.verified_accounts) {
    return false;
  }
  const normalized = handle.toLowerCase();
  return user.verified_accounts.some((account: any) => {
    if (account.platform !== "x" || !account.username) {
      return false;
    }
    return account.username.replace(/^@/, "").toLowerCase() === normalized;
  });
}

async function handleZoraQuery(bot: TelegramBot, chatId: number, query: string, userId?: number): Promise<void> {
  const { logger } = await import("../../../utils/logger");
  
  logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
    success: true,
    type: "zora_pending",
  });
  
  try {
    // Try as Zora contract reference first
    const reference = extractZoraContractReference(query);
    if (reference) {
      const coin = await fetchZoraCoin(reference.address, reference.chainId);
      if (coin) {
        const summary = await findBestZoraSummary([reference.address.toLowerCase()]);
        const response = await buildZoraCoinResponse(coin, summary, { returnAllPages: true }); // Get all pages for Telegram
        const identifier = `zora_coin_${reference.address.toLowerCase()}`;
        const pageLabels = response.embeds.length > 1
          ? ["Coin Details", "Creator Coin & Farcaster"]
          : undefined;
        await sendPaginatedTelegramMessage(bot, chatId, response.embeds, identifier, pageLabels);
        
        logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
          success: true,
          type: "zora_coin",
        });
        return;
      }
    }

    // Try as profile lookup
    const normalizedQuery = query.replace(/^@/, "").toLowerCase();
    const zoraSummary = await findBestZoraSummary([normalizedQuery, `@${normalizedQuery}`, `${normalizedQuery}.eth`]);
    if (zoraSummary) {
      const embed = buildZoraProfileEmbed(zoraSummary);
      await appendZoraSummaryFields(embed, zoraSummary);
      // Split into pages if needed (same as Discord)
      const { splitEmbedIntoPages } = await import("../../../utils/pagination");
      const embeds = splitEmbedIntoPages(embed, 15);
      const identifier = `zora_profile_${normalizedQuery}`;
      await sendPaginatedTelegramMessage(bot, chatId, embeds, identifier);
      
      logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
        success: true,
        type: "zora",
      });
      return;
    }
    
    await bot.sendMessage(chatId, `No Zora results found for: ${query}`);
    
    logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
      success: false,
      type: "zora_not_found",
    });
  } catch (error) {
    logger.error(`Error in handleZoraQuery: ${query}`, error, {
      query,
      chatId: chatId.toString(),
      userId: userId?.toString(),
      platform: "telegram",
    });
    await bot.sendMessage(chatId, "An error occurred while searching Zora. Please try again.");
  }
}

async function handleClankerQuery(bot: TelegramBot, chatId: number, query: string, userId?: number): Promise<void> {
  const { logger } = await import("../../../utils/logger");
  
  logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
    success: true,
    type: "clanker_pending",
  });
  
  try {
    // Try as address first
    if (isEthAddress(query)) {
      const address = extractFirstAddress(query);
      if (address) {
        const sent = await sendClankerTokenPages(bot, chatId, address);
        if (sent) {
          logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
            success: true,
            type: "clanker",
          });
          return;
        }
      }
    }

    // Try as token name/symbol search
    const tokens = await fetchTokensByQuery(query);
    if (tokens && tokens.length > 0) {
      const address = tokens[0].contract_address;
      if (address) {
        const sent = await sendClankerTokenPages(bot, chatId, address);
        if (sent) {
          logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
            success: true,
            type: "clanker",
          });
          return;
        }
      }
    }

    await bot.sendMessage(chatId, `No Clanker results found for: ${query}`);
    
    logger.search(query, "telegram", userId?.toString(), chatId.toString(), chatId.toString(), {
      success: false,
      type: "clanker_not_found",
    });
  } catch (error) {
    const { logger } = await import("../../../utils/logger");
    logger.error(`Error in handleClankerQuery: ${query}`, error, {
      query,
      chatId: chatId.toString(),
      userId: userId?.toString(),
      platform: "telegram",
    });
    await bot.sendMessage(chatId, "An error occurred while searching Clanker. Please try again.");
  }
}

async function handleCastsQuery(bot: TelegramBot, chatId: number, keyword: string): Promise<void> {
  try {
    const { searchCastsByKeyword } = await import("../../../services/neynar");
    const { firstMatch, recent } = await searchCastsByKeyword(keyword, 2);
    
    const castsToShow = [];
    if (firstMatch) castsToShow.push(firstMatch);
    castsToShow.push(...recent.slice(0, 2));
    
    if (castsToShow.length > 0) {
      const { buildCastEmbed } = await import("../../../handlers/castLink");
      const { buildCastUrl } = await import("../../../utils/farcasterLinks");
      const embeds = castsToShow.map((cast: any, index: number) => {
        if (index === 0 && firstMatch && cast.hash === firstMatch.hash) {
          return buildCastEmbed(cast, buildCastUrl(cast.author.username, cast.hash), {
            title: `🔹 Earliest cast mentioning "${keyword}"`,
            color: 0xfbbf24,
            variant: "full",
          });
        }
        const recentIndex = index - (firstMatch ? 1 : 0);
        return buildCastEmbed(cast, buildCastUrl(cast.author.username, cast.hash), {
          title: `Recent cast #${recentIndex + 1} mentioning "${keyword}"`,
          color: 0x4338ca,
          footer: `Matched keyword: ${keyword}`,
          variant: "compact",
        });
      });
      const identifier = `cast_search_${keyword}`;
      await sendPaginatedTelegramMessage(bot, chatId, embeds, identifier);
    } else {
      await bot.sendMessage(chatId, `No casts found matching \`${keyword}\`.`);
    }
  } catch (error) {
    console.error("Error in handleCastsQuery:", error);
    await bot.sendMessage(chatId, "An error occurred while searching casts. Please try again.");
  }
}
