import TelegramBot from "node-telegram-bot-api";
import {
  generateSIWFChallenge,
  generateSIWFUrl,
  getSIWFSession,
  clearSIWFSession,
  storePendingVerificationInBackend,
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
import { validatePrivateKey, testSigner, encryptSigner } from "../../../utils/signerEncryption";

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
  const existingSession = await getSIWFSession(userId, "telegram", env.backendUrl);
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

  // SECURITY: Direct username connection is disabled for security
  // Users must use SIWF flow to prove ownership of their Farcaster account
  if (usernameOrWallet) {
    await bot.sendMessage(
      chatId,
      `🔒 <b>Security Notice</b>\n\n` +
        `For security, you must verify ownership of your Farcaster account.\n\n` +
        `Direct username connection is disabled to prevent account hijacking.\n\n` +
        `Please use the SIWF flow:\n` +
        `1. Click the link below to open Warpcast\n` +
        `2. Sign in to your Farcaster account\n` +
        `3. Approve the connection\n` +
        `4. Your account will be securely linked!\n\n` +
        `This ensures only you can connect your own Farcaster account.`,
      { parse_mode: "HTML" },
    );
    // Continue to show SIWF link below
  }

  // Generate SIWF URL with proper callback
  const challenge = generateSIWFChallenge(userId, "telegram");
  const siwfUrl = generateSIWFUrl(
    challenge.challenge,
    userId,
    "telegram",
    env.backendUrl,
    env.farcasterReferralCode,
  );

  // Store pending verification in backend
  await storePendingVerificationInBackend(challenge.challenge, userId, "telegram", env.backendUrl);

  await bot.sendMessage(
    chatId,
    `🔗 <b>Connect Farcaster</b>\n\n` +
      `To securely connect your Farcaster account:\n\n` +
      `<b>Step 1:</b> Click the link below to open Warpcast\n` +
      `<b>Step 2:</b> Sign in to your Farcaster account (or sign up if new - referral: <code>${env.farcasterReferralCode}</code>)\n` +
      `<b>Step 3:</b> Approve the connection request\n` +
      `<b>Step 4:</b> You'll be redirected back and your account will be securely linked!\n\n` +
      `🔒 <b>Security:</b> This method verifies you own the Farcaster account by requiring you to sign in.\n\n` +
      `<a href="${siwfUrl}">🔐 Connect with Farcaster</a>\n\n` +
      `💡 <i>New to Farcaster? Sign up using the link (referral: ${env.farcasterReferralCode})</i>`,
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

  const session = await getSIWFSession(userId, "telegram", env.backendUrl);
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

  const session = await getSIWFSession(userId, "telegram", env.backendUrl);
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

  const session = await getSIWFSession(userId, "telegram", env.backendUrl);
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

  // Check if user has a signer for trading
  let signerInfo: { address: string; hasSigner: boolean } | null = null;
  try {
    const signerResponse = await fetch(`${env.backendUrl}/api/siwf/signer?userId=${userId}&platform=telegram`);
    if (signerResponse.ok) {
      const signerData = await signerResponse.json();
      signerInfo = {
        address: signerData.signerAddress || "",
        hasSigner: !!signerData.signerAddress,
      };
    }
  } catch (error) {
    console.error("[Telegram Trade] Failed to check signer:", error);
  }

  if (!signerInfo?.hasSigner) {
    await bot.sendMessage(
      chatId,
      `❌ <b>No Trading Signer</b>\n\n` +
        `You need to connect a trading signer to execute trades!\n\n` +
        `Step 1: Connect your Farcaster account: /connect ✅\n` +
        `Step 2: Add a trading signer: /connect-signer &lt;private_key&gt;\n\n` +
        `The signer allows the bot to execute trades on your behalf.\n` +
        `Your private key will be encrypted and stored securely.`,
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

    // Execute transaction using signer
    let txHash: string | null = null;
    try {
      const executeResponse = await fetch(`${env.backendUrl}/api/trading/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          platform: "telegram",
          transaction: {
            to: swapTx.tx.to,
            data: swapTx.tx.data,
            value: swapTx.tx.value || "0",
            gasLimit: swapTx.tx.gas || "300000",
            gasPrice: swapTx.tx.gasPrice || undefined,
          },
          chainId: chain,
        }),
      });

      if (executeResponse.ok) {
        const result = await executeResponse.json();
        txHash = result.txHash;
      } else {
        const error = await executeResponse.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || "Transaction execution failed");
      }
    } catch (error: any) {
      console.error("[Telegram Trade] Failed to execute transaction:", error);
      // Fall through to show quote only
    }

    const toAmountFormatted = formatTokenAmount(quote.toAmount, toTokenInfo.decimals);
    const fromAmountFormatted = formatTokenAmount(quote.fromAmount, fromTokenInfo.decimals);
    const chainName = getChainName(chain);

    const chainExplorerMap: Record<number, string> = {
      1: "https://etherscan.io/tx/",
      56: "https://bscscan.com/tx/",
      137: "https://polygonscan.com/tx/",
      8453: "https://basescan.org/tx/",
      42161: "https://arbiscan.io/tx/",
      10: "https://optimistic.etherscan.io/tx/",
      43114: "https://snowtrace.io/tx/",
      250: "https://ftmscan.com/tx/",
    };

    const explorerUrl = chainExplorerMap[chain] || "https://etherscan.io/tx/";

    if (txHash) {
      // Transaction executed successfully
      await bot.sendMessage(
        chatId,
        `✅ <b>Transaction Executed!</b>\n\n` +
          `From: <b>${fromAmountFormatted} ${fromTokenInfo.symbol}</b>\n` +
          `To: <b>~${toAmountFormatted} ${toTokenInfo.symbol}</b>\n` +
          `Transaction Hash: <a href="${explorerUrl}${txHash}">${txHash.slice(0, 10)}...${txHash.slice(-8)}</a>\n\n` +
          `✅ Your trade has been submitted to the blockchain!\n` +
          `Click the transaction hash to view it on the explorer.`,
        { parse_mode: "HTML" },
      );
    } else {
      // Show quote only (execution failed)
      await bot.sendMessage(
        chatId,
        `💱 <b>Swap Quote</b>\n\n` +
          `From: <b>${fromAmountFormatted} ${fromTokenInfo.symbol}</b>\n` +
          `To: <b>~${toAmountFormatted} ${toTokenInfo.symbol}</b>\n` +
          `Estimated Gas: ${formatTokenAmount(quote.estimatedGas, 18)} ETH\n` +
          `Slippage: 1%\n` +
          `Chain: ${chainName}\n\n` +
          `⚠️ <b>Transaction execution failed.</b>\n` +
          `Please try again or contact support if the issue persists.\n\n` +
          `Signer Address: <code>${signerInfo.address}</code>`,
        { parse_mode: "HTML" },
      );
    }
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

