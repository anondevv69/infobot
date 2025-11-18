import axios from "axios";

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
}

export interface SwapQuote {
  fromToken: TokenInfo;
  toToken: TokenInfo;
  fromAmount: string;
  toAmount: string;
  estimatedGas: string;
  tx: {
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
}

export interface SwapParams {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string; // in wei
  fromAddress: string; // user's wallet
  chainId: number;
  slippage?: number; // default 1%
}

// 1inch API integration
const ONEINCH_API_BASE = "https://api.1inch.dev/swap/v6.0";

// Get API key from environment or use public endpoint
function get1inchApiKey(): string | undefined {
  return process.env.ONEINCH_API_KEY;
}

// Get chain name for 1inch API
function getChainName(chainId: number): string {
  const chainMap: Record<number, string> = {
    1: "ethereum",
    56: "bsc",
    137: "polygon",
    8453: "base",
    42161: "arbitrum",
    10: "optimism",
    43114: "avalanche",
    250: "fantom",
  };

  return chainMap[chainId] || "ethereum";
}

// Get token info
export async function getTokenInfo(
  tokenAddress: string,
  chainId: number,
): Promise<TokenInfo | null> {
  try {
    const chainName = getChainName(chainId);
    const apiKey = get1inchApiKey();
    
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };
    
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await axios.get(
      `${ONEINCH_API_BASE}/${chainId}/tokens/${tokenAddress}`,
      { headers, timeout: 10000 },
    );

    if (response.data) {
      return {
        address: tokenAddress,
        symbol: response.data.symbol,
        name: response.data.name,
        decimals: response.data.decimals,
        chainId,
      };
    }

    return null;
  } catch (error) {
    console.error(`[DEX] Failed to get token info for ${tokenAddress}:`, error);
    return null;
  }
}

// Get swap quote from 1inch
export async function getSwapQuote(params: SwapParams): Promise<SwapQuote | null> {
  try {
    const { fromTokenAddress, toTokenAddress, amount, fromAddress, chainId, slippage = 1 } = params;
    const chainName = getChainName(chainId);
    const apiKey = get1inchApiKey();

    const headers: Record<string, string> = {
      "Accept": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // Use native token address for ETH
    const nativeToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeeE";
    const fromToken = fromTokenAddress.toLowerCase() === "eth" || fromTokenAddress.toLowerCase() === "native" 
      ? nativeToken 
      : fromTokenAddress;
    const toToken = toTokenAddress.toLowerCase() === "eth" || toTokenAddress.toLowerCase() === "native"
      ? nativeToken
      : toTokenAddress;

    const url = `${ONEINCH_API_BASE}/${chainId}/quote`;
    const queryParams = new URLSearchParams({
      src: fromToken,
      dst: toToken,
      amount: amount,
      from: fromAddress,
      slippage: slippage.toString(),
    });

    const response = await axios.get(`${url}?${queryParams.toString()}`, {
      headers,
      timeout: 15000,
    });

    if (response.data) {
      const data = response.data;
      
      // Get token info
      const [fromTokenInfo, toTokenInfo] = await Promise.all([
        getTokenInfo(fromToken, chainId),
        getTokenInfo(toToken, chainId),
      ]);

      if (!fromTokenInfo || !toTokenInfo) {
        return null;
      }

      return {
        fromToken: fromTokenInfo,
        toToken: toTokenInfo,
        fromAmount: amount,
        toAmount: data.toAmount || "0",
        estimatedGas: data.estimatedGas || "0",
        tx: {
          to: data.tx?.to || "",
          data: data.tx?.data || "",
          value: data.tx?.value || "0",
          gas: data.estimatedGas || "21000",
          gasPrice: data.tx?.gasPrice || "0",
        },
      };
    }

    return null;
  } catch (error: any) {
    console.error("[DEX] Failed to get swap quote:", error.response?.data || error.message);
    return null;
  }
}

// Get swap transaction data
export async function getSwapTransaction(params: SwapParams): Promise<any | null> {
  try {
    const { fromTokenAddress, toTokenAddress, amount, fromAddress, chainId, slippage = 1 } = params;
    const chainName = getChainName(chainId);
    const apiKey = get1inchApiKey();

    const headers: Record<string, string> = {
      "Accept": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const nativeToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeeE";
    const fromToken = fromTokenAddress.toLowerCase() === "eth" || fromTokenAddress.toLowerCase() === "native"
      ? nativeToken
      : fromTokenAddress;
    const toToken = toTokenAddress.toLowerCase() === "eth" || toTokenAddress.toLowerCase() === "native"
      ? nativeToken
      : toTokenAddress;

    const url = `${ONEINCH_API_BASE}/${chainId}/swap`;
    const queryParams = new URLSearchParams({
      src: fromToken,
      dst: toToken,
      amount: amount,
      from: fromAddress,
      slippage: slippage.toString(),
    });

    const response = await axios.get(`${url}?${queryParams.toString()}`, {
      headers,
      timeout: 15000,
    });

    return response.data || null;
  } catch (error: any) {
    console.error("[DEX] Failed to get swap transaction:", error.response?.data || error.message);
    return null;
  }
}

// Get token balance
export async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  chainId: number,
): Promise<string | null> {
  try {
    // For native token (ETH), use RPC call
    if (tokenAddress.toLowerCase() === "eth" || tokenAddress.toLowerCase() === "native") {
      // Use QuickNode or public RPC
      const rpcUrl = process.env.QUICKNODE_API_KEY
        ? `https://${getChainName(chainId)}.quiknode.pro/${process.env.QUICKNODE_API_KEY}/`
        : getPublicRpcUrl(chainId);

      const response = await axios.post(
        rpcUrl,
        {
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [walletAddress, "latest"],
          id: 1,
        },
        { timeout: 10000 },
      );

      return response.data?.result || "0";
    }

    // For ERC20 tokens, use standard balanceOf call
    const rpcUrl = process.env.QUICKNODE_API_KEY
      ? `https://${getChainName(chainId)}.quiknode.pro/${process.env.QUICKNODE_API_KEY}/`
      : getPublicRpcUrl(chainId);

    // ERC20 balanceOf(address) function selector: 0x70a08231
    const data = `0x70a08231${walletAddress.slice(2).padStart(64, "0")}`;

    const response = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: tokenAddress,
            data: data,
          },
          "latest",
        ],
        id: 1,
      },
      { timeout: 10000 },
    );

    return response.data?.result || "0";
  } catch (error) {
    console.error(`[DEX] Failed to get token balance:`, error);
    return null;
  }
}

// Get public RPC URL for a chain
function getPublicRpcUrl(chainId: number): string {
  const rpcMap: Record<number, string> = {
    1: "https://eth.llamarpc.com",
    56: "https://bsc-dataseed.binance.org",
    137: "https://polygon-rpc.com",
    8453: "https://mainnet.base.org",
    42161: "https://arb1.arbitrum.io/rpc",
    10: "https://mainnet.optimism.io",
    43114: "https://api.avax.network/ext/bc/C/rpc",
    250: "https://rpc.ftm.tools",
  };

  return rpcMap[chainId] || "https://eth.llamarpc.com";
}

// Format token amount (wei to human readable)
export function formatTokenAmount(amount: string, decimals: number): string {
  const bigIntAmount = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = bigIntAmount / divisor;
  const remainder = bigIntAmount % divisor;
  
  if (remainder === BigInt(0)) {
    return whole.toString();
  }
  
  const remainderStr = remainder.toString().padStart(decimals, "0");
  const trimmed = remainderStr.replace(/0+$/, "");
  
  return `${whole}.${trimmed}`;
}

// Parse token amount (human readable to wei)
export function parseTokenAmount(amount: string, decimals: number): string {
  const parts = amount.split(".");
  const whole = parts[0] || "0";
  const fraction = parts[1] || "";
  
  const wholeBigInt = BigInt(whole) * BigInt(10 ** decimals);
  const fractionBigInt = BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
  
  return (wholeBigInt + fractionBigInt).toString();
}

