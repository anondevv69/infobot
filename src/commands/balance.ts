import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getSIWFSession } from "../services/siwf";
import { getTokenBalance, formatTokenAmount, getTokenInfo } from "../services/dex";

export async function handleBalanceCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const tokenAddress = interaction.options.getString("token") || "native";
  const chainId = interaction.options.getInteger("chain") || 8453; // Default to Base

  // Check if user is connected
  const session = getSIWFSession(userId, "discord");
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

  await interaction.deferReply({ ephemeral: true });

  try {
    // Get token info
    const tokenInfo = tokenAddress === "native"
      ? { address: "native", symbol: "ETH", name: "Ethereum", decimals: 18, chainId }
      : await getTokenInfo(tokenAddress, chainId);

    if (!tokenInfo) {
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

    // Get balance
    const balance = await getTokenBalance(
      tokenAddress === "native" ? "native" : tokenInfo.address,
      session.custodyAddress,
      chainId,
    );

    if (balance === null) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Error")
            .setDescription("Could not fetch balance. Please try again later.")
            .setColor(0xff0000),
        ],
      });
      return;
    }

    const balanceFormatted = formatTokenAmount(balance, tokenInfo.decimals);

    const embed = new EmbedBuilder()
      .setTitle("💰 Balance")
      .setDescription(
        `**Token:** ${tokenInfo.name} (${tokenInfo.symbol})\n` +
        `**Balance:** ${balanceFormatted} ${tokenInfo.symbol}\n` +
        `**Wallet:** \`${session.custodyAddress}\`\n` +
        `**Chain:** ${getChainName(chainId)}`
      )
      .setColor(0x8a63d2);

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    console.error("[Balance] Error:", error);
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

function getChainName(chainId: number): string {
  const chainMap: Record<number, string> = {
    1: "Ethereum",
    56: "BSC",
    137: "Polygon",
    8453: "Base",
    42161: "Arbitrum",
    10: "Optimism",
    43114: "Avalanche",
    250: "Fantom",
  };

  return chainMap[chainId] || `Chain ${chainId}`;
}

