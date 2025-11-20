/**
 * Build trading links as markdown text for embedding in token cards
 * Returns a formatted string with clickable links
 */
export function buildTradingLinks(contractAddress: string): string {
  const normalizedAddress = contractAddress.toLowerCase();
  
  // GMGN.ai link with referral
  const gmgnUrl = `https://gmgn.ai/token/base/${normalizedAddress}?ref=r_infobot`;
  
  // Telegram bot link with referral (uses BaseBot)
  const telegramUrl = `https://t.me/based_eth_bot?start=r_infobot_${normalizedAddress}`;
  
  // Farcaster Wallet - opens wallet with pre-filled swap transaction
  // Format: https://wallet.action/?chain=base&action=swap&tokenIn=0x...&tokenOut=0x...
  // For buying, we'll use ETH (0x0000000000000000000000000000000000000000) as tokenIn and the contract as tokenOut
  const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";
  const fcwUrl = `https://wallet.action/?chain=base&action=swap&tokenIn=${ETH_ADDRESS}&tokenOut=${normalizedAddress}&ref=2ORGMS`;

  // Return as clickable markdown links (GMGN, Telegram/BB, FCW)
  return `[📊 GMGN](${gmgnUrl}) • [🔄 BB](${telegramUrl}) • [💼 FCW](${fcwUrl})`;
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

