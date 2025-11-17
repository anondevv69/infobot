import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import {
  fetchRelayTransaction,
  extractTransactionHash,
  detectChainFromLink,
  type RelayTransaction,
} from "../services/relay";

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
    // Extract transaction hash from input
    const txHash = extractTransactionHash(input);
    if (!txHash) {
      await interaction.editReply({
        content: "❌ Could not extract a valid transaction hash from the provided input. Please provide a transaction hash (0x...) or a transaction link from a block explorer.",
      });
      return;
    }

    // Detect source chain from link if possible
    const sourceChainId = detectChainFromLink(input);

    // Fetch transaction data from Relay.link
    const transaction = await fetchRelayTransaction(txHash, sourceChainId || undefined);

    if (!transaction) {
      await interaction.editReply({
        content: `❌ Transaction \`${txHash}\` not found on Relay.link API.\n\n**Possible reasons:**\n• The transaction may not be a Relay cross-chain transaction\n• The transaction may not be indexed yet\n• The transaction might be too old or not tracked by Relay\n\n**Note:** If the transaction is very recent, it may take a few minutes to appear in Relay's system.`,
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
        value: `**Chain:** ${transaction.sourceChain.chainName} (${transaction.sourceChain.chainId})\n**Wallet:** \`${transaction.sourceChain.wallet}\``,
        inline: false,
      },
      {
        name: "📥 Destination",
        value: `**Chain:** ${transaction.destinationChain.chainName} (${transaction.destinationChain.chainId})\n**Wallet:** \`${transaction.destinationChain.wallet}\``,
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

