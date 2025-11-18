import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { generateSIWFChallenge, generateSIWFUrl, getSIWFSession } from "../services/siwf";
import { findUserByWallet } from "../services/neynar";

export async function handleConnectCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  
  // Check if user is already connected
  const existingSession = getSIWFSession(userId, "discord");
  if (existingSession) {
    const embed = new EmbedBuilder()
      .setTitle("✅ Already Connected")
      .setDescription(
        `You're already connected with Farcaster!\n\n` +
        `**Farcaster ID:** ${existingSession.fid}\n` +
        `**Username:** ${existingSession.username || "N/A"}\n` +
        `**Custody Wallet:** \`${existingSession.custodyAddress}\`\n\n` +
        `Use \`/disconnect\` to disconnect your account.`
      )
      .setColor(0x00ff00);

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Generate SIWF challenge
  const challenge = generateSIWFChallenge(userId, "discord");
  const siwfUrl = generateSIWFUrl(challenge.challenge);

  const embed = new EmbedBuilder()
    .setTitle("🔗 Connect Farcaster")
    .setDescription(
      `To connect your Farcaster account:\n\n` +
      `1. Click the button below or scan the QR code\n` +
      `2. Approve the connection in Warpcast\n` +
      `3. You'll be able to trade using your Farcaster wallet!\n\n` +
      `**Challenge:** \`${challenge.challenge.slice(0, 16)}...\`\n` +
      `**Expires in:** 5 minutes`
    )
    .setColor(0x8a63d2)
    .setFooter({ text: "This will allow the bot to access your Farcaster wallet for trading" });

  const button = new ButtonBuilder()
    .setLabel("Connect with Farcaster")
    .setURL(siwfUrl)
    .setStyle(ButtonStyle.Link);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

