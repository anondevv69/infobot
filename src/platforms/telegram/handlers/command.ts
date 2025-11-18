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
import {
  handleTelegramConnect,
  handleTelegramDisconnect,
  handleTelegramBalance,
  handleTelegramTrade,
  handleTelegramConnectSigner,
  handleTelegramDisconnectSigner,
} from "./trading";

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
        const helpText = `<b>InfoBot Commands</b>

<b>Search Commands:</b>
<code>/search &lt;query&gt;</code> - Search wallets, contracts, Farcaster profiles, or Zora accounts
<code>/zora &lt;query&gt;</code> - Search Zora accounts, contracts, or creator coins
<code>/clanker &lt;query&gt;</code> - Search Clanker deployments
<code>/casts &lt;keyword&gt;</code> - Search Farcaster casts by keyword
<code>/relay &lt;transaction&gt;</code> - Get cross-chain transaction details from Relay.link

<b>Trading Commands:</b>
<code>/connect</code> - Connect your Farcaster account for trading
<code>/disconnect</code> - Disconnect your Farcaster account
<code>/balance [token] [chain]</code> - Check your wallet balance
<code>/buy &lt;token&gt; &lt;amount&gt; [chain]</code> - Buy tokens with ETH
<code>/sell &lt;token&gt; &lt;amount&gt; [chain]</code> - Sell tokens for ETH
<code>/swap &lt;from&gt; &lt;to&gt; &lt;amount&gt; [chain]</code> - Swap between tokens

<b>Auto-Detection:</b>
Just send:
• Ethereum address (0x...) - Auto-detects Clanker, Zora, or wallet
• Farcaster username (@username) - Looks up profile
• Zora URL - Looks up Zora profile/coin

<b>Examples:</b>
<code>/search 0x1234...</code>
<code>/zora @username</code>
<code>/clanker tokenname</code>

<i>Built by rayblanco.eth</i>`;
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
        
        await handleSearchQuery(bot, chatId, query);
        break;
      }

      case "zora": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a Zora query.\n\nUsage: <code>/zora &lt;query&gt;</code>\nExample: <code>/zora @username</code> or <code>/zora 0x1234...</code>", { parse_mode: "HTML" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
        await handleZoraQuery(bot, chatId, query);
        break;
      }

      case "clanker": {
        if (!query) {
          await bot.sendMessage(chatId, "Please provide a Clanker query.\n\nUsage: <code>/clanker &lt;query&gt;</code>\nExample: <code>/clanker tokenname</code> or <code>/clanker 0x1234...</code>", { parse_mode: "HTML" });
          return;
        }
        
        // Send typing indicator
        await bot.sendChatAction(chatId, "typing");
        
        await handleClankerQuery(bot, chatId, query);
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

      case "connect": {
        // Parse optional username/wallet: /connect [@username|0xwallet]
        const usernameOrWallet = query || undefined;
        await handleTelegramConnect(bot, msg, usernameOrWallet);
        break;
      }

      case "disconnect": {
        await handleTelegramDisconnect(bot, msg);
        break;
      }

      case "balance": {
        // Parse optional parameters: /balance [token] [chain]
        const parts = query?.split(/\s+/) || [];
        const tokenAddress = parts[0] || undefined;
        const chainId = parts[1] ? parseInt(parts[1], 10) : undefined;
        await handleTelegramBalance(bot, msg, tokenAddress, chainId);
        break;
      }

      case "buy": {
        // Format: /buy <token> <amount> [chain]
        if (!query) {
          await bot.sendMessage(chatId, "Usage: <code>/buy &lt;token&gt; &lt;amount&gt; [chain]</code>\nExample: <code>/buy 0x1234... 0.1 8453</code>", { parse_mode: "HTML" });
          return;
        }
        const parts = query.split(/\s+/);
        if (parts.length < 2) {
          await bot.sendMessage(chatId, "Usage: <code>/buy &lt;token&gt; &lt;amount&gt; [chain]</code>\nExample: <code>/buy 0x1234... 0.1 8453</code>", { parse_mode: "HTML" });
          return;
        }
        const tokenAddress = parts[0];
        const amount = parts[1];
        const chainId = parts[2] ? parseInt(parts[2], 10) : undefined;
        await handleTelegramTrade(bot, msg, "native", tokenAddress, amount, chainId);
        break;
      }

      case "sell": {
        // Format: /sell <token> <amount> [chain]
        if (!query) {
          await bot.sendMessage(chatId, "Usage: <code>/sell &lt;token&gt; &lt;amount&gt; [chain]</code>\nExample: <code>/sell 0x1234... 100 8453</code>", { parse_mode: "HTML" });
          return;
        }
        const parts = query.split(/\s+/);
        if (parts.length < 2) {
          await bot.sendMessage(chatId, "Usage: <code>/sell &lt;token&gt; &lt;amount&gt; [chain]</code>\nExample: <code>/sell 0x1234... 100 8453</code>", { parse_mode: "HTML" });
          return;
        }
        const tokenAddress = parts[0];
        const amount = parts[1];
        const chainId = parts[2] ? parseInt(parts[2], 10) : undefined;
        await handleTelegramTrade(bot, msg, tokenAddress, "native", amount, chainId);
        break;
      }

      case "swap": {
        // Format: /swap <from> <to> <amount> [chain]
        if (!query) {
          await bot.sendMessage(chatId, "Usage: <code>/swap &lt;from&gt; &lt;to&gt; &lt;amount&gt; [chain]</code>\nExample: <code>/swap 0x1234... 0x5678... 0.1 8453</code>", { parse_mode: "HTML" });
          return;
        }
        const parts = query.split(/\s+/);
        if (parts.length < 3) {
          await bot.sendMessage(chatId, "Usage: <code>/swap &lt;from&gt; &lt;to&gt; &lt;amount&gt; [chain]</code>\nExample: <code>/swap 0x1234... 0x5678... 0.1 8453</code>", { parse_mode: "HTML" });
          return;
        }
        const fromToken = parts[0];
        const toToken = parts[1];
        const amount = parts[2];
        const chainId = parts[3] ? parseInt(parts[3], 10) : undefined;
        await handleTelegramTrade(bot, msg, fromToken, toToken, amount, chainId);
        break;
      }

      case "connect-signer": {
        await handleTelegramConnectSigner(bot, msg, query || undefined);
        break;
      }

      case "disconnect-signer": {
        await handleTelegramDisconnectSigner(bot, msg);
        break;
      }

      default:
        await bot.sendMessage(chatId, "Unknown command. Use /help to see available commands.");
    }
  } catch (error) {
    console.error(`Error handling Telegram command ${command}:`, error);
    await bot.sendMessage(chatId, "An error occurred while processing your command. Please try again later.");
  }
}

async function handleSearchQuery(bot: TelegramBot, chatId: number, query: string): Promise<void> {
  try {
    // Try address first
    if (isEthAddress(query) || isSolAddress(query)) {
      const address = extractFirstAddress(query);
      if (address) {
        // Try Clanker (build all pages)
        const clankerSent = await sendClankerTokenPages(bot, chatId, address);
        if (clankerSent) {
          return;
        }

        // Try Zora profile lookup (Zora-only wallet, no Farcaster user)
        const zoraSummary = await findBestZoraSummary([address.toLowerCase()]);
        if (zoraSummary) {
          // Use buildZoraWalletProfileResponse for wallet lookups (same as Discord)
          const associated = isSummaryAssociatedWithAddress(zoraSummary, address)
            ? zoraSummary
            : null;
          
          const zoraResponse = buildZoraWalletProfileResponse({
            wallet: address,
            summary: associated ?? zoraSummary,
            returnAllPages: true, // Get all pages for Telegram
          });
          
          const identifier = `zora_wallet_${address.toLowerCase()}`;
          await sendPaginatedTelegramMessage(bot, chatId, zoraResponse.embeds, identifier);
          return;
        }

        // Try wallet (need to find user first)
        try {
          const user = await findUserByWallet(address);
          if (user) {
            const [tokens, latestCast, zoraSummary] = await Promise.all([
              safeFetchTokensByFid(user.fid),
              safeFetchMostRecentCast(user.fid),
              findBestZoraSummary(collectZoraIdentifiers(user)),
            ]);
            const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(user, zoraSummary) ? zoraSummary : null;
            
            const walletResponse = await buildWalletProfileResponse({
              wallet: address,
              user,
              zoraSummary: associatedSummary,
              clankerTokens: tokens,
              latestCast,
              returnAllPages: true, // Get all pages for Telegram
            });
            if (walletResponse && walletResponse.embeds.length > 0) {
              const identifier = `wallet_${address.toLowerCase()}`;
              const pageLabels = walletResponse.embeds.length > 1 
                ? ["Profile", "Clankers & Zora"] 
                : undefined;
              await sendPaginatedTelegramMessage(bot, chatId, walletResponse.embeds, identifier, pageLabels);
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
        if (farcasterUser) {
          const [tokens, latestCast, zoraSummary] = await Promise.all([
            safeFetchTokensByFid(farcasterUser.fid),
            safeFetchMostRecentCast(farcasterUser.fid),
            findBestZoraSummary(collectZoraIdentifiers(farcasterUser)),
          ]);
          const associatedSummary = zoraSummary && isSummaryAssociatedWithUser(farcasterUser, zoraSummary) ? zoraSummary : null;

          const result = await buildFarcasterPresentation(farcasterUser, {
            tokens,
            zoraSummary: associatedSummary,
            latestCast,
            returnAllPages: true, // Get all pages for Telegram
          });
          const identifier = `farcaster_x_${handle}`;
          const pageLabels = result.embeds.length > 1
            ? ["Profile", "Clankers & Zora"]
            : undefined;
          await sendPaginatedTelegramMessage(bot, chatId, result.embeds, identifier, pageLabels);
          return;
        }

        // If no Farcaster profile found
        await bot.sendMessage(chatId, `No Farcaster profile linked to X handle @${handle}.`);
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
      return;
    }

    await bot.sendMessage(chatId, `No results found for: ${query}`);
  } catch (error) {
    console.error("Error in handleSearchQuery:", error);
    await bot.sendMessage(chatId, "An error occurred while searching. Please try again.");
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

async function handleZoraQuery(bot: TelegramBot, chatId: number, query: string): Promise<void> {
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
      return;
    }
    
    await bot.sendMessage(chatId, `No Zora results found for: ${query}`);
  } catch (error) {
    console.error("Error in handleZoraQuery:", error);
    await bot.sendMessage(chatId, "An error occurred while searching Zora. Please try again.");
  }
}

async function handleClankerQuery(bot: TelegramBot, chatId: number, query: string): Promise<void> {
  try {
    // Try as address first
    if (isEthAddress(query)) {
      const address = extractFirstAddress(query);
      if (address) {
        const sent = await sendClankerTokenPages(bot, chatId, address);
        if (sent) {
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
          return;
        }
      }
    }

    await bot.sendMessage(chatId, `No Clanker results found for: ${query}`);
  } catch (error) {
    console.error("Error in handleClankerQuery:", error);
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
