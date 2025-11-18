import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import {
  fetchRelayTransaction,
  extractTransactionHash,
  detectChainFromLink,
  type RelayTransaction,
} from "../services/relay";
import { isEthAddress, isSolAddress } from "../utils/address";

export async function handleRelayCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const input = interaction.options.getString("transaction", true).trim();

  if (!input) {
    await interaction.reply({
      content: "Please provide a transaction hash or transaction link.",
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
      
      const embed = buildRelayTransactionEmbed(transaction);
      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    // Extract transaction hash from input
    const txHash = extractTransactionHash(input);
    if (!txHash) {
      await interaction.editReply({
        content: "❌ Could not extract a valid transaction hash from the provided input. Please provide:\n• An Ethereum-style transaction hash (0x...)\n• A Solana transaction signature\n• A transaction link from a block explorer (Ethereum, Base, Solana, etc.)\n• A wallet address (0x... or Solana address) to find the most recent transaction",
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
      // Check if this is a Solana transaction (base58, 87-88 chars, not starting with 0x)
      const isSolanaTx = !txHash.startsWith("0x") && txHash.length >= 87 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(txHash);
      // Check if this looks like a Relay transaction ID (from relay.link URLs)
      const isRelayTxId = txHash.startsWith("0x") && txHash.length === 66;
      
      let errorMessage = `❌ Transaction \`${txHash}\` not found on Relay.link API.\n\n**Possible reasons:**\n• The transaction may not be a Relay cross-chain transaction\n• The transaction may not be indexed yet\n• The transaction might be too old or not tracked by Relay`;
      
      if (isRelayTxId) {
        errorMessage += `\n\n**Note:** Relay transaction IDs from \`relay.link/transaction/\` URLs are **not supported** by the Relay API. The API only supports querying by actual blockchain transaction hashes.\n\n**Solution:** Open the Relay transaction page and look for the **source** or **destination** transaction hash (the actual blockchain transaction, not Relay's internal ID). Use that hash instead.`;
      } else if (isSolanaTx) {
        errorMessage += `\n\n**Note:** Solana transaction signatures are **not supported** by the Relay API. The API only supports EVM-compatible transaction hashes (0x...).\n\n**Solution:** If this is a Relay cross-chain transaction, open the Relay transaction page and use the **destination transaction hash** (the EVM chain transaction hash, not the Solana signature).`;
      } else {
        errorMessage += `\n\n**Note:** If the transaction is very recent, it may take a few minutes to appear in Relay's system.`;
      }
      
      await interaction.editReply({
        content: errorMessage,
      });
      return;
    }

    // Build embed with transaction details
    const embed = buildRelayTransactionEmbed(transaction);

    await interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    console.error("Error handling relay command:", error);
    await interaction.editReply({
      content: `❌ Error fetching transaction data: ${error instanceof Error ? error.message : "Unknown error"}`,
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
    .setFooter({
      text: `Transaction Hash: ${transaction.txHash.slice(0, 10)}...${transaction.txHash.slice(-8)}`,
    })
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

