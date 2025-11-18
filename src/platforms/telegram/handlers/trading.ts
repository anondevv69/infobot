import TelegramBot from "node-telegram-bot-api";
import {
  generateSIWFChallenge,
  generateSIWFUrl,
  getSIWFSession,
  clearSIWFSession,
  verifyUserByUsernameOrWallet,
  storeSIWFSession,
} from "../../../services/siwf";
import { env } from "../../../config";
import {
  getTokenBalance,
  formatTokenAmount,
  getTokenInfo,
  getSwapQuote,
  getSwapTransaction,
  parseTokenAmount,
} from "../../../services/dex";

export async function handleTelegramConnect(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  usernameOrWallet?: string,
): Promise<void> {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || "";

  if (!userId) {
    await bot.sendMessage(chatId, "❌ Could not identify user.");
    return;
  }

  // Check if already connected
  const existingSession = getSIWFSession(userId, "telegram");
  if (existingSession) {
    await bot.sendMessage(
      chatId,
      `✅ <b>Already Connected</b>\n\n` +
        `Farcaster ID: ${existingSession.fid}\n` +
        `Username: ${existingSession.username || "N/A"}\n` +
        `Custody Wallet: <code>${existingSession.custodyAddress}</code>\n\n` +
        `Use /disconnect to disconnect.`,
      { parse_mode: "HTML" },
    );
    return;
  }

  // If username/wallet provided, try to connect directly
  if (usernameOrWallet) {
    try {
      const verification = await verifyUserByUsernameOrWallet(usernameOrWallet);
      
      if (!verification) {
        await bot.sendMessage(
          chatId,
          `❌ <b>Not Found</b>\n\n` +
            `Could not find Farcaster account for: <code>${usernameOrWallet}</code>\n\n` +
            `Make sure:\n` +
            `• The username is correct (e.g., @username)\n` +
            `• The wallet address is correct (0x...)\n` +
            `• The account exists on Farcaster\n\n` +
            `If you don't have Farcaster yet, use /connect to sign up!`,
          { parse_mode: "HTML" },
        );
        return;
      }

      // Store the session
      storeSIWFSession(userId, "telegram", verification);

      await bot.sendMessage(
        chatId,
        `✅ <b>Connected Successfully!</b>\n\n` +
          `Your Farcaster account is now connected!\n\n` +
          `Farcaster ID: ${verification.fid}\n` +
          `Username: @${verification.username || "N/A"}\n` +
          `Custody Wallet: <code>${verification.custodyAddress}</code>\n\n` +
          `You can now use trading commands like /buy, /sell, and /swap!`,
        { parse_mode: "HTML" },
      );
      return;
    } catch (error: any) {
      console.error("[Telegram Connect] Error:", error);
      await bot.sendMessage(chatId, `❌ Error: ${error.message || "Unknown error"}`);
      return;
    }
  }

  // Generate SIWF challenge with referral code
  const challenge = generateSIWFChallenge(userId, "telegram");
  const siwfUrl = generateSIWFUrl(challenge.challenge, undefined, env.farcasterReferralCode);

  await bot.sendMessage(
    chatId,
    `🔗 <b>Connect Farcaster</b>\n\n` +
      `To connect your Farcaster account:\n\n` +
      `<b>Option 1: Direct Connection</b>\n` +
      `Run: <code>/connect @yourusername</code> or <code>/connect 0xwallet</code>\n\n` +
      `<b>Option 2: Sign Up/In</b>\n` +
      `1. Click the link below to open Warpcast\n` +
      `2. If you don't have Farcaster, sign up (referral: <code>${env.farcasterReferralCode}</code>)\n` +
      `3. If you have Farcaster, sign in\n` +
      `4. Then run: <code>/connect @yourusername</code>\n\n` +
      `<a href="${siwfUrl}">🔐 Open Warpcast</a>\n\n` +
      `💡 <i>Tip: You can connect directly by providing your Farcaster username or wallet!</i>`,
    {
      parse_mode: "HTML",
      disable_web_page_preview: false,
    },
  );
}

export async function handleTelegramDisconnect(
  bot: TelegramBot,
  msg: TelegramBot.Message,
): Promise<void> {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || "";

  if (!userId) {
    await bot.sendMessage(chatId, "❌ Could not identify user.");
    return;
  }

  const session = getSIWFSession(userId, "telegram");
  if (!session) {
    await bot.sendMessage(chatId, "❌ You're not connected to Farcaster.");
    return;
  }

  clearSIWFSession(userId, "telegram");
  await bot.sendMessage(chatId, "✅ Your Farcaster account has been disconnected.");
}

export async function handleTelegramBalance(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  tokenAddress?: string,
  chainId?: number,
): Promise<void> {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || "";

  if (!userId) {
    await bot.sendMessage(chatId, "❌ Could not identify user.");
    return;
  }

  const session = getSIWFSession(userId, "telegram");
  if (!session) {
    await bot.sendMessage(
      chatId,
      `❌ <b>Not Connected</b>\n\n` +
        `You need to connect your Farcaster account first!\n\n` +
        `Use /connect to connect your Farcaster wallet.`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const token = tokenAddress || "native";
  const chain = chainId || 8453; // Default to Base

  try {
    const tokenInfo =
      token === "native"
        ? { address: "native", symbol: "ETH", name: "Ethereum", decimals: 18, chainId: chain }
        : await getTokenInfo(token, chain);

    if (!tokenInfo) {
      await bot.sendMessage(
        chatId,
        "❌ Could not fetch token information. Please check the token address.",
      );
      return;
    }

    const balance = await getTokenBalance(
      token === "native" ? "native" : tokenInfo.address,
      session.custodyAddress,
      chain,
    );

    if (balance === null) {
      await bot.sendMessage(chatId, "❌ Could not fetch balance. Please try again later.");
      return;
    }

    const balanceFormatted = formatTokenAmount(balance, tokenInfo.decimals);
    const chainName = getChainName(chain);

    await bot.sendMessage(
      chatId,
      `💰 <b>Balance</b>\n\n` +
        `Token: ${tokenInfo.name} (${tokenInfo.symbol})\n` +
        `Balance: <b>${balanceFormatted} ${tokenInfo.symbol}</b>\n` +
        `Wallet: <code>${session.custodyAddress}</code>\n` +
        `Chain: ${chainName}`,
      { parse_mode: "HTML" },
    );
  } catch (error: any) {
    console.error("[Telegram Balance] Error:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message || "Unknown error"}`);
  }
}

export async function handleTelegramTrade(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  fromToken: string,
  toToken: string,
  amount: string,
  chainId?: number,
): Promise<void> {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || "";

  if (!userId) {
    await bot.sendMessage(chatId, "❌ Could not identify user.");
    return;
  }

  const session = getSIWFSession(userId, "telegram");
  if (!session) {
    await bot.sendMessage(
      chatId,
      `❌ <b>Not Connected</b>\n\n` +
        `You need to connect your Farcaster account first!\n\n` +
        `Use /connect to connect your Farcaster wallet.`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const chain = chainId || 8453; // Default to Base

  try {
    // Get token info
    const fromTokenInfo =
      fromToken === "native"
        ? { address: "native", symbol: "ETH", name: "Ethereum", decimals: 18, chainId: chain }
        : await getTokenInfo(fromToken, chain);

    const toTokenInfo =
      toToken === "native"
        ? { address: "native", symbol: "ETH", name: "Ethereum", decimals: 18, chainId: chain }
        : await getTokenInfo(toToken, chain);

    if (!fromTokenInfo || !toTokenInfo) {
      await bot.sendMessage(
        chatId,
        "❌ Could not fetch token information. Please check the token addresses.",
      );
      return;
    }

    // Parse amount
    const amountWei =
      fromToken === "native"
        ? parseTokenAmount(amount, 18)
        : parseTokenAmount(amount, fromTokenInfo.decimals);

    // Check balance
    const balance = await getTokenBalance(
      fromToken === "native" ? "native" : fromTokenInfo.address,
      session.custodyAddress,
      chain,
    );

    if (!balance || BigInt(balance) < BigInt(amountWei)) {
      const balanceFormatted = balance
        ? formatTokenAmount(balance, fromTokenInfo.decimals)
        : "0";
      await bot.sendMessage(
        chatId,
        `❌ <b>Insufficient Balance</b>\n\n` +
          `You don't have enough ${fromTokenInfo.symbol} to complete this trade.\n\n` +
          `Required: <b>${amount} ${fromTokenInfo.symbol}</b>\n` +
          `Your Balance: <b>${balanceFormatted} ${fromTokenInfo.symbol}</b>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    // Get swap quote
    const quote = await getSwapQuote({
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      amount: amountWei,
      fromAddress: session.custodyAddress,
      chainId: chain,
      slippage: 1,
    });

    if (!quote) {
      await bot.sendMessage(chatId, "❌ Could not get a swap quote. Please try again later.");
      return;
    }

    // Get swap transaction
    const swapTx = await getSwapTransaction({
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      amount: amountWei,
      fromAddress: session.custodyAddress,
      chainId: chain,
      slippage: 1,
    });

    if (!swapTx) {
      await bot.sendMessage(
        chatId,
        "❌ Could not prepare the swap transaction. Please try again later.",
      );
      return;
    }

    const toAmountFormatted = formatTokenAmount(quote.toAmount, toTokenInfo.decimals);
    const fromAmountFormatted = formatTokenAmount(quote.fromAmount, fromTokenInfo.decimals);
    const chainName = getChainName(chain);

    await bot.sendMessage(
      chatId,
      `💱 <b>Swap Quote</b>\n\n` +
        `From: <b>${fromAmountFormatted} ${fromTokenInfo.symbol}</b>\n` +
        `To: <b>~${toAmountFormatted} ${toTokenInfo.symbol}</b>\n` +
        `Estimated Gas: ${formatTokenAmount(quote.estimatedGas, 18)} ETH\n` +
        `Slippage: 1%\n` +
        `Chain: ${chainName}\n\n` +
        `⚠️ <b>Important:</b> You must sign this transaction with your wallet.\n` +
        `The bot provides the transaction data, but you need to execute it using a wallet interface.\n\n` +
        `Transaction Data:\n` +
        `<code>To: ${swapTx.tx.to}\n` +
        `Data: ${swapTx.tx.data.slice(0, 66)}...\n` +
        `Value: ${swapTx.tx.value}</code>\n\n` +
        `Your Wallet: <code>${session.custodyAddress}</code>`,
      { parse_mode: "HTML" },
    );
  } catch (error: any) {
    console.error("[Telegram Trade] Error:", error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message || "Unknown error"}`);
  }
}

function getChainName(chainId: number): string {
  const chainMap: Record<number, string> = {
    1: "Ethereum",
    56: "BSC",
    137: "Polygon",
    8453: "Base",
    42161: "Arbitrum",
    10: "Optimism",
    43114: "Avalanche",
    250: "Fantom",
  };

  return chainMap[chainId] || `Chain ${chainId}`;
}

