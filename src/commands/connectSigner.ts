import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { getSIWFSession } from "../services/siwf";
import { env } from "../config";
import { validatePrivateKey, testSigner, encryptSigner } from "../utils/signerEncryption";

export async function handleConnectSignerCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const privateKey = interaction.options.getString("private_key");

  if (!privateKey) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Missing Private Key")
          .setDescription(
            `You must provide a private key to enable trading.\n\n` +
            `**Usage:** \`/connect-signer <private_key>\`\n\n` +
            `**Security Note:** This key will be encrypted and stored securely. ` +
            `It will be used to sign trading transactions on your behalf.\n\n` +
            `⚠️ **Only provide a key you trust this bot with!**`
          )
          .setColor(0xff0000),
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Step 1: Check if user is connected via SIWF
    const session = await getSIWFSession(userId, "discord", env.backendUrl);
    if (!session) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Not Connected")
            .setDescription(
              `You must connect your Farcaster account first!\n\n` +
              `**Step 1:** Run \`/connect\` to connect your Farcaster account\n` +
              `**Step 2:** Then run \`/connect-signer\` to add a trading signer\n\n` +
              `This ensures your signer is linked to your Farcaster identity.`
            )
            .setColor(0xff9900),
        ],
      });
      return;
    }

    // Step 2: Validate private key format
    if (!validatePrivateKey(privateKey)) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Invalid Private Key")
            .setDescription(
              `The private key you provided is invalid.\n\n` +
              `**Valid format:** 64 hex characters (with or without 0x prefix)\n` +
              `**Example:** \`0x1234567890abcdef...\` (64 hex chars)\n\n` +
              `Please check your private key and try again.`
            )
            .setColor(0xff0000),
        ],
      });
      return;
    }

    // Step 3: Test the signer (validate it works)
    let signerAddress: string;
    let signerPublicKey: string;
    try {
      const testResult = await testSigner(privateKey);
      signerAddress = testResult.address;
      signerPublicKey = testResult.publicKey;
    } catch (error: any) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Signer Validation Failed")
            .setDescription(
              `The private key you provided could not be validated.\n\n` +
              `**Error:** ${error.message || "Unknown error"}\n\n` +
              `Please check your private key and try again.`
            )
            .setColor(0xff0000),
        ],
      });
      return;
    }

    // Step 4: Encrypt the signer
    let encryptedKey: string;
    try {
      encryptedKey = encryptSigner(privateKey);
    } catch (error: any) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Encryption Failed")
            .setDescription(
              `Failed to encrypt your signer. Please try again.\n\n` +
              `**Error:** ${error.message || "Unknown error"}`
            )
            .setColor(0xff0000),
        ],
      });
      return;
    }

    // Step 5: Store the signer in backend
    try {
      const response = await fetch(`${env.backendUrl}/api/siwf/signer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          platform: "discord",
          encryptedSigner: encryptedKey,
          signerAddress,
          signerPublicKey,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || "Failed to store signer");
      }
    } catch (error: any) {
      console.error("[ConnectSigner] Failed to store signer:", error);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Storage Failed")
            .setDescription(
              `Failed to store your signer. Please try again.\n\n` +
              `**Error:** ${error.message || "Unknown error"}`
            )
            .setColor(0xff0000),
        ],
      });
      return;
    }

    // Step 6: Success!
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ Signer Connected!")
          .setDescription(
            `Your trading signer has been successfully connected!\n\n` +
            `**Farcaster Account:** @${session.username || "N/A"} (FID: ${session.fid})\n` +
            `**Signer Address:** \`${signerAddress}\`\n` +
            `**Custody Address:** \`${session.custodyAddress}\`\n\n` +
            `🔒 **Security:** Your signer private key is encrypted and stored securely.\n\n` +
            `✅ **You can now use trading commands:**\n` +
            `• \`/buy\` - Buy tokens\n` +
            `• \`/sell\` - Sell tokens\n` +
            `• \`/swap\` - Swap tokens\n\n` +
            `Use \`/disconnect-signer\` to remove your signer.`
          )
          .setColor(0x00ff00),
      ],
    });
  } catch (error: any) {
    console.error("[ConnectSigner] Error:", error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription(`An unexpected error occurred: ${error.message || "Unknown error"}`)
          .setColor(0xff0000),
      ],
    });
  }
}

