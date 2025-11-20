import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import {
  fetchRelayTransaction,
  extractTransactionHash,
  detectChainFromLink,
  type RelayTransaction,
} from "../services/relay";
import { isEthAddress, isSolAddress } from "../utils/address";
import { applyBranding } from "../utils/branding";

export async function handleRelayCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const input = interaction.options.getString("transaction", true).trim();

  if (!input) {
    await interaction.reply({
      content: "Please provide a full transaction link from a block explorer.\n\n**Example:**\n`/relay https://basescan.org/tx/0x281d831decc5fd1832f5a84155a88da8918a16f68c57c512b7ca7d6a687d8e70`\n\nOr provide a transaction hash:\n`/relay 0x281d831decc5fd1832f5a84155a88da8918a16f68c57c512b7ca7d6a687d8e70`",
      ephemeral: true,
    });
    return;
  }

  // Show eye emoji immediately
  await interaction.reply("👁️ Processing...");

  try {
    // First, check if input is a wallet address (Ethereum or Solana)
    // This must be checked BEFORE trying to extract transaction hash
    // because wallet addresses might match transaction hash patterns
    const trimmedInput = input.trim();
    const isWalletAddress = isEthAddress(trimmedInput) || isSolAddress(trimmedInput);
    
    if (isWalletAddress) {
      // Query by wallet address to get the most recent transaction
      const { fetchRelayTransactionByWallet } = await import("../services/relay");
      const transaction = await fetchRelayTransactionByWallet(trimmedInput);
      
      if (!transaction) {
        await interaction.editReply({
          content: `❌ No Relay transactions found for wallet \`${trimmedInput}\`.\n\n**Possible reasons:**\n• This wallet has not made any Relay cross-chain transactions\n• The wallet address format is incorrect`,
        });
        return;
      }
      
      const embed = await buildRelayTransactionEmbed(transaction);
      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    // Extract transaction hash from input
    const txHash = extractTransactionHash(input);
    if (!txHash) {
      // Check if it's an Ethereum address (42 chars) vs transaction hash (66 chars)
      const trimmedInput = input.trim();
      const isEthAddress = /^0x[a-fA-F0-9]{40}$/i.test(trimmedInput);
      // Solana addresses are typically 32-48 chars, transaction signatures are 43-88 chars
      const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,42}$/.test(trimmedInput);
      const isEvmLikeButWrongLength = /^0x[a-fA-F0-9]+$/i.test(trimmedInput) && !isEthAddress;
      
      let errorMessage = "❌ Could not extract a valid transaction hash from the provided input.\n\n";
      
      if (isEthAddress) {
        errorMessage += `**Invalid Length:** You provided \`${trimmedInput}\` (${trimmedInput.length} characters).\n\n`;
        errorMessage += "**This is an Ethereum address, not a transaction hash.**\n\n";
        errorMessage += "**Transaction Hash Requirements:**\n";
        errorMessage += "• Must start with `0x`\n";
        errorMessage += "• Must be **66 characters total** (0x + 64 hex characters)\n";
        errorMessage += "• Must contain exactly 64 hex characters after the `0x`\n\n";
        errorMessage += "**Examples:**\n";
        errorMessage += "❌ Invalid (42 chars = address): `0x9c212798d6353ef790a68f3803fc3279d286a0e9`\n";
        errorMessage += "✅ Valid (66 chars = tx hash): `0x9c212798d6353ef790a68f3803fc3279d286a0e91234567890abcdef1234567890abcdef`\n\n";
        errorMessage += "**Solution:**\n";
        errorMessage += "• Use a full transaction hash from a block explorer\n";
        errorMessage += "• Or use this address directly to find the most recent transaction\n";
        errorMessage += "• Or provide a transaction link from a block explorer";
      } else if (isEvmLikeButWrongLength) {
        const hexLength = trimmedInput.length - 2; // Subtract "0x"
        errorMessage += `**Invalid Length:** You provided \`${trimmedInput}\` (${trimmedInput.length} characters, ${hexLength} hex chars).\n\n`;
        errorMessage += "**Transaction Hash Requirements:**\n";
        errorMessage += "• Must start with `0x`\n";
        errorMessage += "• Must be **66 characters total** (0x + 64 hex characters)\n";
        errorMessage += "• Must contain exactly **64 hex characters** after the `0x`\n\n";
        errorMessage += "**Your input:**\n";
        errorMessage += `• Length: ${trimmedInput.length} characters (need 66)\n`;
        errorMessage += `• Hex chars: ${hexLength} (need 64)\n\n`;
        errorMessage += "**Examples:**\n";
        errorMessage += "❌ Invalid: `0x9c212798d6353ef790a68f3803fc3279d286a0e9` (42 chars)\n";
        errorMessage += "✅ Valid: `0x9c212798d6353ef790a68f3803fc3279d286a0e91234567890abcdef1234567890abcdef` (66 chars)\n\n";
        errorMessage += "**Solution:** Get the full transaction hash from a block explorer (Etherscan, Basescan, etc.)";
      } else if (isSolanaAddress) {
        errorMessage += `**Invalid Length:** You provided \`${trimmedInput}\` (${trimmedInput.length} characters).\n\n`;
        errorMessage += "**This looks like a Solana address, not a transaction signature.**\n\n";
        errorMessage += "**Solana Transaction Signature Requirements:**\n";
        errorMessage += "• Must be **43-88 characters long** (base58 encoded)\n";
        errorMessage += "• Must contain only base58 characters (1-9, A-H, J-N, P-Z, a-k, m-z)\n\n";
        errorMessage += "**Solution:**\n";
        errorMessage += "• Use a full transaction signature from Solscan\n";
        errorMessage += "• Or use this address directly to find the most recent transaction\n";
        errorMessage += "• **Note:** Relay only supports EVM transaction hashes, so for Solana→EVM relays, use the destination EVM hash";
      } else {
        errorMessage += "**Transaction Hash Requirements:**\n\n";
        errorMessage += "**EVM Transaction Hash:**\n";
        errorMessage += "• Must start with `0x`\n";
        errorMessage += "• Must be **66 characters total** (0x + 64 hex characters)\n";
        errorMessage += "• Must contain exactly 64 hex characters after the `0x`\n\n";
        errorMessage += "**Solana Transaction Signature:**\n";
        errorMessage += "• Must be **43-88 characters long** (base58 encoded)\n\n";
        errorMessage += "**Please provide:**\n";
        errorMessage += "• A full EVM transaction hash (66 characters: 0x + 64 hex)\n";
        errorMessage += "• A Solana transaction signature (43-88 base58 characters)\n";
        errorMessage += "• A transaction link from a block explorer\n";
        errorMessage += "• A wallet address to find the most recent transaction";
      }
      
      // Truncate error message if it exceeds Discord's 2000 character limit
      const truncatedMessage = errorMessage.length > 2000 
        ? errorMessage.substring(0, 1997) + "..." 
        : errorMessage;
      
      await interaction.editReply({
        content: truncatedMessage,
      });
      return;
    }

    // Detect source chain from link if possible
    // Try advanced detection first (checks Relay API for all chains), fallback to basic
    const { detectChainFromLinkAdvanced } = await import("../services/relay");
    let sourceChainId: number | null = null;
    try {
      sourceChainId = await detectChainFromLinkAdvanced(input);
    } catch (error) {
      // Fallback to basic detection
      const { detectChainFromLink } = await import("../services/relay");
      sourceChainId = detectChainFromLink(input);
    }

    // Fetch transaction data from Relay.link
    const transaction = await fetchRelayTransaction(txHash, sourceChainId || undefined);

    if (!transaction) {
      // Check if this is a Solana transaction (base58, 43-88 chars, not starting with 0x)
      const isSolanaTx = !txHash.startsWith("0x") && txHash.length >= 43 && txHash.length <= 88 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(txHash);
      // Check if this is a valid EVM transaction hash format
      const isEvmTxHash = txHash.startsWith("0x") && txHash.length === 66 && /^0x[a-fA-F0-9]{64}$/i.test(txHash);
      // Check if the input was from a relay.link URL (to provide specific guidance)
      const wasFromRelayLink = input.toLowerCase().includes("relay.link");
      
      let errorMessage = `❌ Transaction \`${txHash}\` not found on Relay.link API.\n\n**Possible reasons:**\n• The transaction may not be a Relay cross-chain transaction\n• The transaction may not be indexed yet\n• The transaction might be too old or not tracked by Relay`;
      
      if (isSolanaTx) {
        errorMessage += `\n\n**Note:** Solana transaction signatures are **not supported** by the Relay API. The API only supports EVM-compatible transaction hashes (0x...).\n\n**Solution:** If this is a Relay cross-chain transaction:\n1. Open the Relay transaction page using this Solana signature\n2. Find the **destination transaction hash** (the EVM chain transaction hash, not the Solana signature)\n3. Use that EVM transaction hash (0x...) with this command`;
      } else if (wasFromRelayLink && isEvmTxHash) {
        // If it came from a relay.link URL and looks like a transaction hash, it might be a Relay transaction ID
        errorMessage += `\n\n**Note:** If you extracted this from a \`relay.link/transaction/\` URL, Relay transaction IDs are **not supported** by the Relay API. The API only supports querying by actual blockchain transaction hashes.\n\n**Solution:** Open the Relay transaction page and look for the **source** or **destination** transaction hash (the actual blockchain transaction, not Relay's internal ID). Use that hash instead.`;
      } else if (isEvmTxHash) {
        errorMessage += `\n\n**Note:** If the transaction is very recent, it may take a few minutes to appear in Relay's system.\n\n**Troubleshooting:**\n• Verify this is a Relay cross-chain transaction\n• Try using the wallet address that initiated the transaction instead\n• Check if the transaction completed successfully on the source chain`;
      } else {
        errorMessage += `\n\n**Note:** If the transaction is very recent, it may take a few minutes to appear in Relay's system.`;
      }
      
      // Truncate error message if it exceeds Discord's 2000 character limit
      const truncatedMessage = errorMessage.length > 2000 
        ? errorMessage.substring(0, 1997) + "..." 
        : errorMessage;
      
      await interaction.editReply({
        content: truncatedMessage,
      });
      return;
    }

    // Build embed with transaction details
    const embed = await buildRelayTransactionEmbed(transaction);

    await interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    console.error("Error handling relay command:", error);
    const errorMsg = `❌ Error fetching transaction data: ${error instanceof Error ? error.message : "Unknown error"}`;
    const truncatedMsg = errorMsg.length > 2000 
      ? errorMsg.substring(0, 1997) + "..." 
      : errorMsg;
    await interaction.editReply({
      content: truncatedMsg,
    });
  }
}

function buildRelayTransactionEmbed(transaction: RelayTransaction): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🌉 Relay Cross-Chain Transaction")
    .setColor(0x00d4ff)
    .setDescription(`Transaction details from Relay.link`)
    .addFields(
      {
        name: "📤 Source",
        value: `**Chain:** ${transaction.sourceChain.chainName}\n**Wallet:** \`${transaction.sourceChain.wallet}\``,
        inline: false,
      },
      {
        name: "📥 Destination",
        value: `**Chain:** ${transaction.destinationChain.chainName}\n**Wallet:** \`${transaction.destinationChain.wallet}\``,
        inline: false,
      },
    )
    .setTimestamp(transaction.timestamp ? new Date(transaction.timestamp * 1000) : undefined);

  if (transaction.amount) {
    embed.addFields({
      name: "💰 Amount",
      value: transaction.token
        ? `${transaction.amount} ${transaction.token.symbol}`
        : transaction.amount,
      inline: true,
    });
  }

  if (transaction.token) {
    embed.addFields({
      name: "🪙 Token",
      value: `${transaction.token.symbol}\n\`${transaction.token.address}\``,
      inline: true,
    });
  }

  if (transaction.status) {
    embed.addFields({
      name: "📊 Status",
      value: transaction.status,
      inline: true,
    });
  }

  // Add explorer links
  const sourceExplorer = getExplorerUrl(transaction.sourceChain.chainId, transaction.txHash);
  const destExplorer = getExplorerUrl(transaction.destinationChain.chainId, transaction.txHash);

  if (sourceExplorer || destExplorer) {
    const links: string[] = [];
    if (sourceExplorer) {
      links.push(`[Source Chain Explorer](${sourceExplorer})`);
    }
    if (destExplorer && destExplorer !== sourceExplorer) {
      links.push(`[Destination Chain Explorer](${destExplorer})`);
    }
    if (links.length > 0) {
      embed.addFields({
        name: "🔗 Links",
        value: links.join(" • "),
        inline: false,
      });
    }
  }

  // Apply InfoBot branding (version, rayblanco.eth, icon)
  applyBranding(embed, "relay transaction");
  
  // Append transaction hash to footer
  const currentFooter = embed.data.footer;
  if (currentFooter) {
    embed.setFooter({
      text: `${currentFooter.text} • TX: ${transaction.txHash.slice(0, 10)}...${transaction.txHash.slice(-8)}`,
      iconURL: currentFooter.icon_url ?? undefined,
    });
  }

  return embed;
}

function getExplorerUrl(chainId: number, txHash: string): string | null {
  const explorers: Record<number, string> = {
    1: `https://etherscan.io/tx/${txHash}`,
    8453: `https://basescan.org/tx/${txHash}`,
    42161: `https://arbiscan.io/tx/${txHash}`,
    10: `https://optimistic.etherscan.io/tx/${txHash}`,
    137: `https://polygonscan.com/tx/${txHash}`,
    43114: `https://snowtrace.io/tx/${txHash}`,
    56: `https://bscscan.com/tx/${txHash}`,
    250: `https://ftmscan.com/tx/${txHash}`,
  };

  return explorers[chainId] || null;
}

