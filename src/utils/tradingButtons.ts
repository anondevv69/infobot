/**
 * Build trading links as plain text for embedding in token cards
 * Returns a formatted string with plain text links (not markdown)
 */
export function buildTradingLinks(contractAddress: string): string {
  const normalizedAddress = contractAddress.toLowerCase();
  
  // GMGN.ai link with referral
  const gmgnUrl = `https://gmgn.ai/token/base/${normalizedAddress}?ref=r_infobot`;
  
  // Telegram bot link with referral (uses BaseBot)
  // Format: r_{referrer}_{action}_{address} where action 'b' = buy
  // This matches Rick Bot's format: r_Rick_b_{address} for direct buy flow
  const telegramUrl = `https://t.me/based_eth_bot?start=r_infobot_b_${normalizedAddress}`;
  
  // Farcaster Wallet - opens Farcaster wallet with contract pre-filled for trading
  const fcwUrl = `https://warpcast.com/~/wallet/swap?token=${normalizedAddress}&chain=base&ref=2ORGMS`;

  // Return as plain text links in one row with Trade label
  return `💱 Trade [GMGN](${gmgnUrl}) • [BB](${telegramUrl}) • [FCW](${fcwUrl})`;
}

/**
 * Build trading buttons for Telegram (inline keyboard)
 */
export function buildTelegramTradingButtons(contractAddress: string): Array<Array<{ text: string; url: string }>> {
  const normalizedAddress = contractAddress.toLowerCase();
  
  const gmgnUrl = `https://gmgn.ai/token/base/${normalizedAddress}?ref=r_infobot`;
  // Format: r_{referrer}_{action}_{address} where action 'b' = buy (matches Rick Bot format)
  const telegramUrl = `https://t.me/based_eth_bot?start=r_infobot_b_${normalizedAddress}`;
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

