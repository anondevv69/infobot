import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { getSIWFSession } from "../services/siwf";
import { env } from "../config";
import {
  getSwapQuote,
  getSwapTransaction,
  formatTokenAmount,
  parseTokenAmount,
  getTokenBalance,
  getTokenInfo,
} from "../services/dex";
import { findUserByWallet } from "../services/neynar";

interface TradeParams {
  fromToken: string;
  toToken: string;
  amount: string;
  chainId: number;
}

export async function handleBuyCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const tokenAddress = interaction.options.getString("token", true);
  const amount = interaction.options.getString("amount", true);
  const chainId = interaction.options.getInteger("chain") || 8453; // Default to Base

  await handleTrade(interaction, {
    fromToken: "native", // Buy with ETH/native token
    toToken: tokenAddress,
    amount: amount,
    chainId: chainId,
  });
}

export async function handleSellCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const tokenAddress = interaction.options.getString("token", true);
  const amount = interaction.options.getString("amount", true);
  const chainId = interaction.options.getInteger("chain") || 8453; // Default to Base

  await handleTrade(interaction, {
    fromToken: tokenAddress,
    toToken: "native", // Sell for ETH/native token
    amount: amount,
    chainId: chainId,
  });
}

export async function handleSwapCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const fromToken = interaction.options.getString("from", true);
  const toToken = interaction.options.getString("to", true);
  const amount = interaction.options.getString("amount", true);
  const chainId = interaction.options.getInteger("chain") || 8453; // Default to Base

  await handleTrade(interaction, {
    fromToken: fromToken,
    toToken: toToken,
    amount: amount,
    chainId: chainId,
  });
}

async function handleTrade(
  interaction: ChatInputCommandInteraction,
  params: TradeParams,
): Promise<void> {
  const userId = interaction.user.id;

  // Check if user is connected
  const session = await getSIWFSession(userId, "discord", env.backendUrl);
  if (!session) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Not Connected")
      .setDescription(
        `You need to connect your Farcaster account first!\n\n` +
        `Use \`/connect\` to connect your Farcaster wallet.`
      )
      .setColor(0xff0000);

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Check if user has a signer for trading
  let signerInfo: { address: string; hasSigner: boolean } | null = null;
  try {
    const signerResponse = await fetch(`${env.backendUrl}/api/siwf/signer?userId=${userId}&platform=discord`);
    if (signerResponse.ok) {
      const signerData = await signerResponse.json();
      signerInfo = {
        address: signerData.signerAddress || "",
        hasSigner: !!signerData.signerAddress,
      };
    }
  } catch (error) {
    console.error("[Trade] Failed to check signer:", error);
  }

  if (!signerInfo?.hasSigner) {
    const embed = new EmbedBuilder()
      .setTitle("❌ No Trading Signer")
      .setDescription(
        `Trading functionality is currently unavailable.\n\n` +
        `Please check back later for trading features.`
      )
      .setColor(0xff9900);

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Get token info
    const fromTokenInfo = params.fromToken === "native"
      ? { address: "native", symbol: "ETH", name: "Ethereum", decimals: 18, chainId: params.chainId }
      : await getTokenInfo(params.fromToken, params.chainId);
    
    const toTokenInfo = params.toToken === "native"
      ? { address: "native", symbol: "ETH", name: "Ethereum", decimals: 18, chainId: params.chainId }
      : await getTokenInfo(params.toToken, params.chainId);

    if (!fromTokenInfo || !toTokenInfo) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Invalid Token")
            .setDescription("Could not fetch token information. Please check the token address.")
            .setColor(0xff0000),
        ],
      });
      return;
    }

    // Parse amount
    const amountWei = params.fromToken === "native"
      ? parseTokenAmount(params.amount, 18)
      : parseTokenAmount(params.amount, fromTokenInfo.decimals);

    // Check balance
    const balance = await getTokenBalance(
      params.fromToken === "native" ? "native" : fromTokenInfo.address,
      session.custodyAddress,
      params.chainId,
    );

    if (!balance || BigInt(balance) < BigInt(amountWei)) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Insufficient Balance")
            .setDescription(
              `You don't have enough ${fromTokenInfo.symbol} to complete this trade.\n\n` +
              `**Required:** ${params.amount} ${fromTokenInfo.symbol}\n` +
              `**Your Balance:** ${balance ? formatTokenAmount(balance, fromTokenInfo.decimals) : "0"} ${fromTokenInfo.symbol}`
            )
            .setColor(0xff0000),
        ],
      });
      return;
    }

    // Get swap quote
    const quote = await getSwapQuote({
      fromTokenAddress: params.fromToken,
      toTokenAddress: params.toToken,
      amount: amountWei,
      fromAddress: session.custodyAddress,
      chainId: params.chainId,
      slippage: 1, // 1% slippage
    });

    if (!quote) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Swap Failed")
            .setDescription("Could not get a swap quote. Please try again later.")
            .setColor(0xff0000),
        ],
      });
      return;
    }

    // Get swap transaction
    const swapTx = await getSwapTransaction({
      fromTokenAddress: params.fromToken,
      toTokenAddress: params.toToken,
      amount: amountWei,
      fromAddress: session.custodyAddress,
      chainId: params.chainId,
      slippage: 1,
    });

    if (!swapTx) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Transaction Failed")
            .setDescription("Could not prepare the swap transaction. Please try again later.")
            .setColor(0xff0000),
        ],
      });
      return;
    }

    // Execute transaction using signer
    let txHash: string | null = null;
    try {
      const executeResponse = await fetch(`${env.backendUrl}/api/trading/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          platform: "discord",
          transaction: {
            to: swapTx.tx.to,
            data: swapTx.tx.data,
            value: swapTx.tx.value || "0",
            gasLimit: swapTx.tx.gas || "300000",
            gasPrice: swapTx.tx.gasPrice || undefined,
          },
          chainId: params.chainId,
        }),
      });

      if (executeResponse.ok) {
        const result = await executeResponse.json();
        txHash = result.txHash;
      } else {
        const error = await executeResponse.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || "Transaction execution failed");
      }
    } catch (error: any) {
      console.error("[Trade] Failed to execute transaction:", error);
      // Fall through to show quote only
    }

    // Display quote and transaction result
    const toAmountFormatted = formatTokenAmount(quote.toAmount, toTokenInfo.decimals);
    const fromAmountFormatted = formatTokenAmount(quote.fromAmount, fromTokenInfo.decimals);

    const chainExplorerMap: Record<number, string> = {
      1: "https://etherscan.io/tx/",
      56: "https://bscscan.com/tx/",
      137: "https://polygonscan.com/tx/",
      8453: "https://basescan.org/tx/",
      42161: "https://arbiscan.io/tx/",
      10: "https://optimistic.etherscan.io/tx/",
      43114: "https://snowtrace.io/tx/",
      250: "https://ftmscan.com/tx/",
    };

    const explorerUrl = chainExplorerMap[params.chainId] || "https://etherscan.io/tx/";

    if (txHash) {
      // Transaction executed successfully
      const embed = new EmbedBuilder()
        .setTitle("✅ Transaction Executed!")
        .setDescription(
          `**From:** ${fromAmountFormatted} ${fromTokenInfo.symbol}\n` +
          `**To:** ~${toAmountFormatted} ${toTokenInfo.symbol}\n` +
          `**Transaction Hash:** [\`${txHash.slice(0, 10)}...${txHash.slice(-8)}\`](${explorerUrl}${txHash})\n\n` +
          `✅ Your trade has been submitted to the blockchain!\n` +
          `Click the transaction hash to view it on the explorer.`
        )
        .setColor(0x00ff00)
        .setFooter({ text: "Transaction is being processed on-chain" });

      await interaction.editReply({ embeds: [embed] });
    } else {
      // Show quote only (execution failed or not attempted)
      const embed = new EmbedBuilder()
        .setTitle("💱 Swap Quote")
        .setDescription(
          `**From:** ${fromAmountFormatted} ${fromTokenInfo.symbol}\n` +
          `**To:** ~${toAmountFormatted} ${toTokenInfo.symbol}\n` +
          `**Estimated Gas:** ${formatTokenAmount(quote.estimatedGas, 18)} ETH\n` +
          `**Slippage:** 1%\n\n` +
          `⚠️ **Transaction execution failed or was not attempted.**\n` +
          `Please try again or contact support if the issue persists.`
        )
        .addFields(
          {
            name: "Transaction Data",
            value: `\`\`\`\nTo: ${swapTx.tx.to}\nData: ${swapTx.tx.data.slice(0, 66)}...\nValue: ${swapTx.tx.value}\`\`\``,
            inline: false,
          },
          {
            name: "Signer Address",
            value: `\`${signerInfo.address}\``,
            inline: false,
          }
        )
        .setColor(0xff9900)
        .setFooter({ text: "Transaction could not be executed automatically" });

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error: any) {
    console.error("[Trade] Error:", error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription(`An error occurred: ${error.message || "Unknown error"}`)
          .setColor(0xff0000),
      ],
    });
  }
}

