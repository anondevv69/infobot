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
    // Check if user has a signer
    let hasSigner = false;
    let signerAddress = "";
    try {
      const signerResponse = await fetch(`${env.backendUrl}/api/siwf/signer?userId=${userId}&platform=discord`);
      if (signerResponse.ok) {
        const signerData = await signerResponse.json();
        hasSigner = !!signerData.signerAddress;
        signerAddress = signerData.signerAddress || "";
      }
    } catch (error) {
      console.error("[Connect] Failed to check signer:", error);
    }

    const embed = new EmbedBuilder()
      .setTitle("✅ Already Connected")
      .setDescription(
        `You're already connected with Farcaster!\n\n` +
        `**Farcaster ID:** ${existingSession.fid}\n` +
        `**Username:** ${existingSession.username || "N/A"}\n` +
        `**Custody Wallet:** \`${existingSession.custodyAddress}\`\n\n` +
        (hasSigner
          ? `✅ **Trading Signer:** Connected (\`${signerAddress.slice(0, 10)}...${signerAddress.slice(-8)}\`)\n\n`
          : `⚠️ **Trading Signer:** Not connected\n\n` +
            `To enable trading, run \`/connect-signer <private_key>\`\n\n`) +
        `Use \`/disconnect\` to disconnect your account.`
      )
      .setColor(hasSigner ? 0x00ff00 : 0xff9900);

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

  // DEFAULT: Use server-side SIWF flow (no CORS issues, reliable)
  // OPTIONAL: Mini App available for better UX (if configured)
  const challenge = generateSIWFChallenge(userId, "discord");
  const siwfUrl = generateSIWFUrl(
    challenge.challenge,
    userId,
    "discord",
    env.backendUrl,
    env.farcasterReferralCode,
  );
  await storePendingVerificationInBackend(challenge.challenge, userId, "discord", env.backendUrl);
  
  let connectUrl: string;
  let connectLabel: string;
  let description: string;
  let buttons: ButtonBuilder[] = [];

  // Primary button: Server-side SIWF flow (default, reliable)
  const siwfButton = new ButtonBuilder()
    .setLabel("🔐 Connect with Farcaster (Recommended)")
    .setURL(siwfUrl)
    .setStyle(ButtonStyle.Link);
  buttons.push(siwfButton);

  description =
    `**Default Method (Recommended):**\n\n` +
    `**Step 1:** Click "Connect with Farcaster" below\n` +
    `**Step 2:** Sign in to your Farcaster account in Warpcast\n` +
    `**Step 3:** Approve the connection\n` +
    `**Step 4:** Return to Discord and run \`/connect\` again to verify\n\n` +
    `✅ **Reliable** - No CORS issues\n` +
    `🔒 **Secure** - Server-side verification\n` +
    `⚡ **Fast** - Direct connection\n\n`;

  // Optional: Mini App button (if configured)
  if (env.miniappUrl && !env.miniappUrl.includes("your-miniapp-domain.com")) {
    let miniappUrl: string;
    if (env.miniappUrl.includes("farcaster.xyz/miniapps")) {
      const url = new URL(env.miniappUrl);
      url.searchParams.set("userId", userId);
      url.searchParams.set("platform", "discord");
      url.searchParams.set("backendUrl", env.backendUrl);
      miniappUrl = url.toString();
    } else {
      const url = new URL(env.miniappUrl);
      url.searchParams.set("userId", userId);
      url.searchParams.set("platform", "discord");
      url.searchParams.set("backendUrl", env.backendUrl);
      miniappUrl = url.toString();
    }
    
    const miniappButton = new ButtonBuilder()
      .setLabel("🌐 Use Mini App (Better UX)")
      .setURL(miniappUrl)
      .setStyle(ButtonStyle.Link);
    buttons.push(miniappButton);

    description +=
      `**Optional: Mini App (Better UX)**\n\n` +
      `Want a smoother experience with Discord OAuth?\n` +
      `Click "Use Mini App" for an in-browser connection flow.\n\n` +
      `💡 **Features:** QR code login, Discord OAuth, native Farcaster experience\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle("🔗 Connect Farcaster")
    .setDescription(description)
    .setColor(0x8a63d2)
    .setFooter({ text: `Referral code: ${env.farcasterReferralCode} - Secure account linking` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

