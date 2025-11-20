import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

/**
 * Build trading buttons for a token contract
 * Includes links to GMGN, Telegram bot, Farcaster, BaseBot, and Farcaster Wallet
 */
export function buildTradingButtons(contractAddress: string): ActionRowBuilder<ButtonBuilder>[] {
  const normalizedAddress = contractAddress.toLowerCase();
  
  // GMGN.ai link with referral
  const gmgnUrl = `https://gmgn.ai/token/base/${normalizedAddress}?ref=r_infobot`;
  
  // Telegram bot link with referral
  const telegramUrl = `https://t.me/based_eth_bot?start=r_infobot_${normalizedAddress}`;
  
  // BaseBot trading link (Base chain DEX aggregator)
  const basebotUrl = `https://basebot.xyz/trade/${normalizedAddress}`;
  
  // Farcaster Wallet - opens wallet with contract pre-filled for instant trading
  // Using Farcaster Wallet deep link format
  const fcwUrl = `https://farcaster.xyz/trade/${normalizedAddress}?ref=2ORGMS`;

  // All buttons in one row (Discord allows up to 5 buttons per row)
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setLabel("📊 GMGN")
        .setURL(gmgnUrl)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel("💬 Telegram")
        .setURL(telegramUrl)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel("🔄 BB")
        .setURL(basebotUrl)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel("💼 FCW")
        .setURL(fcwUrl)
        .setStyle(ButtonStyle.Link),
    );

  return [row];
}

/**
 * Build trading buttons for Telegram (inline keyboard)
 */
export function buildTelegramTradingButtons(contractAddress: string): Array<Array<{ text: string; url: string }>> {
  const normalizedAddress = contractAddress.toLowerCase();
  
  const gmgnUrl = `https://gmgn.ai/token/base/${normalizedAddress}?ref=r_infobot`;
  const telegramUrl = `https://t.me/based_eth_bot?start=r_infobot_${normalizedAddress}`;
  const basebotUrl = `https://basebot.xyz/trade/${normalizedAddress}`;
  const fcwUrl = `https://farcaster.xyz/trade/${normalizedAddress}?ref=2ORGMS`;

  // All buttons in one row
  return [
    [
      { text: "📊 GMGN", url: gmgnUrl },
      { text: "💬 Telegram", url: telegramUrl },
      { text: "🔄 BB", url: basebotUrl },
      { text: "💼 FCW", url: fcwUrl },
    ],
  ];
}

