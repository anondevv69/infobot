const GMGN_REFERRAL = "infobot";

/**
 * Build trading links as plain text for embedding in token cards
 * Returns a formatted string with plain text links (not markdown)
 */
export function buildTradingLinks(contractAddress: string, chainId?: string | number): string {
  const normalizedAddress = contractAddress.toLowerCase();
  const chainIdLower = String(chainId || "base").toLowerCase();
  const isMonad = chainIdLower === "5001" || chainIdLower === "monad";
  
  // GMGN: Telegram bot with referral for Base (ETH chain); gmgn.ai with ref for Monad
  const gmgnUrl = isMonad
    ? `https://gmgn.ai/token/monad/${normalizedAddress}?ref=r_${GMGN_REFERRAL}`
    : `https://t.me/GMGN_swap_bot?start=i_${GMGN_REFERRAL}_c_${normalizedAddress}`;
  
  // Telegram bot link with referral (uses BaseBot for Base, Nad.fun for Monad)
  // Format: r_{referrer}_{action}_{address} where action 'b' = buy
  // This matches Rick Bot's format: r_Rick_b_{address} for direct buy flow
  const telegramUrl = isMonad 
    ? `https://t.me/nad_fun_bot?start=r_infobot_b_${normalizedAddress}` // Nad.fun bot for Monad
    : `https://t.me/based_eth_bot?start=r_infobot_b_${normalizedAddress}`; // BaseBot for Base
  
  // Farcaster Wallet - opens Farcaster wallet with contract pre-filled for trading
  const fcwChain = isMonad ? "monad" : "base";
  const fcwUrl = `https://warpcast.com/~/wallet/swap?token=${normalizedAddress}&chain=${fcwChain}&ref=2ORGMS`;

  // Return as plain text links in one row with Trade label
  return `💱 Trade [GMGN](${gmgnUrl}) • [BB](${telegramUrl}) • [FCW](${fcwUrl})`;
}

/**
 * Build trading buttons for Telegram (inline keyboard)
 */
export function buildTelegramTradingButtons(contractAddress: string): Array<Array<{ text: string; url: string }>> {
  const normalizedAddress = contractAddress.toLowerCase();
  const gmgnUrl = `https://t.me/GMGN_swap_bot?start=i_${GMGN_REFERRAL}_c_${normalizedAddress}`;
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

