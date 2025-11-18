import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { generateSIWFChallenge, generateSIWFUrl, getSIWFSession, verifyUserByUsernameOrWallet, storeSIWFSession } from "../services/siwf";
import { findUserByWallet, findUserByUsername } from "../services/neynar";
import { env } from "../config";

export async function handleConnectCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const usernameOrWallet = interaction.options.getString("username_or_wallet");
  
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

  // If username/wallet provided, try to connect directly
  if (usernameOrWallet) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const verification = await verifyUserByUsernameOrWallet(usernameOrWallet);
      
      if (!verification) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("❌ Not Found")
              .setDescription(
                `Could not find Farcaster account for: \`${usernameOrWallet}\`\n\n` +
                `Make sure:\n` +
                `• The username is correct (e.g., @username)\n` +
                `• The wallet address is correct (0x...)\n` +
                `• The account exists on Farcaster\n\n` +
                `If you don't have Farcaster yet, click the button below to sign up!`
              )
              .setColor(0xff0000),
          ],
        });
        return;
      }

      // Store the session
      storeSIWFSession(userId, "discord", verification);

      const embed = new EmbedBuilder()
        .setTitle("✅ Connected Successfully!")
        .setDescription(
          `Your Farcaster account is now connected!\n\n` +
          `**Farcaster ID:** ${verification.fid}\n` +
          `**Username:** @${verification.username || "N/A"}\n` +
          `**Custody Wallet:** \`${verification.custodyAddress}\`\n\n` +
          `You can now use trading commands like \`/buy\`, \`/sell\`, and \`/swap\`!`
        )
        .setColor(0x00ff00);

      await interaction.editReply({ embeds: [embed] });
      return;
    } catch (error: any) {
      console.error("[Connect] Error:", error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Error")
            .setDescription(`Failed to connect: ${error.message || "Unknown error"}`)
            .setColor(0xff0000),
        ],
      });
      return;
    }
  }

  // Generate SIWF challenge
  const challenge = generateSIWFChallenge(userId, "discord");
  const siwfUrl = generateSIWFUrl(challenge.challenge, undefined, env.farcasterReferralCode);

  const embed = new EmbedBuilder()
    .setTitle("🔗 Connect Farcaster")
    .setDescription(
      `To connect your Farcaster account:\n\n` +
      `**Option 1: If you have Farcaster**\n` +
      `1. Click the button below to open Warpcast\n` +
      `2. Sign in and approve the connection\n` +
      `3. Then run \`/connect @yourusername\` to verify\n\n` +
      `**Option 2: If you don't have Farcaster**\n` +
      `1. Click the button below to sign up (referral: ${env.farcasterReferralCode})\n` +
      `2. Create your account\n` +
      `3. Then run \`/connect @yourusername\` to verify\n\n` +
      `**Or provide your Farcaster username now:**\n` +
      `Run \`/connect @username\` or \`/connect 0xwallet\``
    )
    .setColor(0x8a63d2)
    .setFooter({ text: `Referral code: ${env.farcasterReferralCode} - Sign up to get started!` });

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

