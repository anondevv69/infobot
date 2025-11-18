import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { generateSIWFChallenge, generateSIWFUrl, getSIWFSession, storePendingVerificationInBackend } from "../services/siwf";
import { env } from "../config";

export async function handleConnectCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const usernameOrWallet = interaction.options.getString("username_or_wallet");
  
  // Check if user is already connected
  const existingSession = await getSIWFSession(userId, "discord", env.backendUrl);
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

  // SECURITY: Direct username connection is disabled for security
  // Users must use SIWF flow to prove ownership of their Farcaster account
  if (usernameOrWallet) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔒 Security Notice")
          .setDescription(
            `For security, you must verify ownership of your Farcaster account.\n\n` +
            `**Direct username connection is disabled** to prevent account hijacking.\n\n` +
            `**Please use the SIWF flow:**\n` +
            `1. Click the "Connect with Farcaster" button below\n` +
            `2. Sign in to your Farcaster account in Warpcast\n` +
            `3. Approve the connection\n` +
            `4. Your account will be securely linked!\n\n` +
            `This ensures only you can connect your own Farcaster account.`
          )
          .setColor(0xff9900),
      ],
      ephemeral: true,
    });
    // Don't return - continue to show the SIWF button below
  }

  // Generate SIWF URL with proper callback
  const challenge = generateSIWFChallenge(userId, "discord");
  const siwfUrl = generateSIWFUrl(
    challenge.challenge,
    userId,
    "discord",
    env.backendUrl,
    env.farcasterReferralCode,
  );

  // Store pending verification in backend
  await storePendingVerificationInBackend(challenge.challenge, userId, "discord", env.backendUrl);

  const embed = new EmbedBuilder()
    .setTitle("🔗 Connect Farcaster")
    .setDescription(
      `To securely connect your Farcaster account:\n\n` +
      `**Step 1:** Click the button below to open Warpcast\n` +
      `**Step 2:** Sign in to your Farcaster account (or sign up if new - referral: ${env.farcasterReferralCode})\n` +
      `**Step 3:** Approve the connection request\n` +
      `**Step 4:** You'll be redirected back and your account will be securely linked!\n\n` +
      `🔒 **Security:** This method verifies you own the Farcaster account by requiring you to sign in with your account.\n\n` +
      `💡 **New to Farcaster?** Sign up using the link below (referral: ${env.farcasterReferralCode})`
    )
    .setColor(0x8a63d2)
    .setFooter({ text: `Referral code: ${env.farcasterReferralCode} - Secure account linking via SIWF` });

  const connectButton = new ButtonBuilder()
    .setLabel("🔐 Connect with Farcaster")
    .setURL(siwfUrl)
    .setStyle(ButtonStyle.Link);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(connectButton);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

