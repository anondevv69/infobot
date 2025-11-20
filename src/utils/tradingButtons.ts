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
  
  // Farcaster Wallet - opens Farcaster wallet with contract pre-filled for trading
  // Using Warpcast/Farcaster wallet URL format
  // This should open the Farcaster wallet interface with the token contract pre-filled
  // Format: https://warpcast.com/~/wallet/swap or farcaster://wallet/swap
  // For maximum compatibility, using the web URL that should redirect to app if installed
  const fcwUrl = `https://warpcast.com/~/wallet/swap?token=${normalizedAddress}&chain=base&ref=2ORGMS`;
  
  // Alternative formats (commented for reference):
  // EIP-681 format: ethereum:0x...@8453/transfer?address=...
  // const fcwUrl = `ethereum:${normalizedAddress}@8453?ref=2ORGMS`;
  // Farcaster deep link: farcaster://wallet/swap?token=...
  // const fcwUrl = `farcaster://wallet/swap?token=${normalizedAddress}&chain=base&ref=2ORGMS`;

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

