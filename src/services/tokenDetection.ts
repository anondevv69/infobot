/**
 * Token detection service for tokens not yet on DEXes
 * Detects ERC-20 tokens by calling standard token functions via RPC
 */

interface TokenInfo {
  address: string;
  chainId: number;
  chainName: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
  isToken: boolean;
}

interface ChainRPC {
  chainId: number;
  name: string;
  rpcUrl: string;
  quicknodeEndpoint?: string; // QuickNode endpoint name for this chain
}

// Get RPC URLs - use QuickNode if available, otherwise fallback to public RPCs
function getChainRPCs(quicknodeApiKey?: string | null): ChainRPC[] {
  const baseRPCs: Omit<ChainRPC, "rpcUrl">[] = [
    { chainId: 1, name: "Ethereum", quicknodeEndpoint: "ethereum" },
    { chainId: 56, name: "BSC", quicknodeEndpoint: "bsc" },
    { chainId: 137, name: "Polygon", quicknodeEndpoint: "polygon" },
    { chainId: 42161, name: "Arbitrum", quicknodeEndpoint: "arbitrum" },
    { chainId: 10, name: "Optimism", quicknodeEndpoint: "optimism" },
    { chainId: 8453, name: "Base", quicknodeEndpoint: "base" },
    { chainId: 43114, name: "Avalanche", quicknodeEndpoint: "avalanche" },
    { chainId: 250, name: "Fantom", quicknodeEndpoint: "fantom" },
    { chainId: 5000, name: "Mantle", quicknodeEndpoint: "mantle" },
  ];

  // Public RPC fallbacks
  const publicRPCs: Record<number, string> = {
    1: "https://eth.llamarpc.com",
    56: "https://bsc-dataseed.binance.org",
    137: "https://polygon-rpc.com",
    42161: "https://arb1.arbitrum.io/rpc",
    10: "https://mainnet.optimism.io",
    8453: "https://mainnet.base.org",
    43114: "https://api.avax.network/ext/bc/C/rpc",
    250: "https://rpc.ftm.tools",
    5000: "https://rpc.mantle.xyz",
  };

  // Use QuickNode if API key is provided, otherwise use public RPCs
  if (quicknodeApiKey) {
    return baseRPCs.map((chain) => ({
      ...chain,
      rpcUrl: `https://${chain.quicknodeEndpoint}.quiknode.pro/${quicknodeApiKey}/`,
    }));
  }

  return baseRPCs.map((chain) => ({
    ...chain,
    rpcUrl: publicRPCs[chain.chainId] || `https://rpc.${chain.name.toLowerCase()}.com`,
  }));
}

/**
 * Call a contract function via RPC
 * functionSignature should be the 4-byte function selector (e.g., "06fdde03" for name())
 */
async function callContractFunction(
  rpcUrl: string,
  contractAddress: string,
  functionSignature: string,
  params: string[] = [],
): Promise<string | null> {
  try {
    // Encode function call: selector (4 bytes) + params (32 bytes each)
    let data = functionSignature;
    for (const param of params) {
      // Remove 0x prefix if present and pad to 64 chars (32 bytes)
      const cleanParam = param.startsWith("0x") ? param.slice(2) : param;
      data += cleanParam.padStart(64, "0");
    }

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: contractAddress,
            data: `0x${data}`,
          },
          "latest",
        ],
        id: 1,
      }),
    });

    if (!response.ok) return null;

    const result = (await response.json()) as { result?: string; error?: { message: string } };
    if (result.error || !result.result || result.result === "0x" || result.result === "0x0") {
      return null;
    }

    return result.result;
  } catch (error) {
    console.error(`[TokenDetection] RPC call failed:`, error);
    return null;
  }
}

/**
 * Decode string from hex (for name/symbol)
 */
function decodeString(hex: string): string | null {
  try {
    // Remove 0x prefix and function selector offset
    const data = hex.slice(2);
    if (data.length < 128) return null; // Need at least offset + length

    // Skip offset (first 64 chars = 32 bytes)
    const lengthHex = data.slice(64, 128);
    const length = parseInt(lengthHex, 16);
    if (length === 0 || length > 100) return null; // Sanity check

    // Get string data
    const stringHex = data.slice(128, 128 + length * 2);
    const bytes = Buffer.from(stringHex, "hex");
    return bytes.toString("utf-8").replace(/\0/g, "");
  } catch (error) {
    return null;
  }
}

/**
 * Decode uint256 from hex (for decimals, totalSupply)
 */
function decodeUint256(hex: string): string | null {
  try {
    if (!hex || hex === "0x" || hex.length < 66) return null;
    return BigInt(hex).toString();
  } catch (error) {
    return null;
  }
}

/**
 * Check a single chain for token contract (with timeout)
 */
async function checkChainForToken(
  chain: ChainRPC,
  address: string,
  timeoutMs: number = 5000,
): Promise<TokenInfo | null> {
  try {
    // Add timeout to individual chain check
    const checkPromise = (async () => {
      // First check if it's a contract (has code)
      const codeResponse = await fetch(chain.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getCode",
          params: [address, "latest"],
          id: 1,
        }),
      });

      if (!codeResponse.ok) return null;

      const codeData = (await codeResponse.json()) as { result?: string };
      if (!codeData.result || codeData.result === "0x") {
        return null; // Not a contract on this chain
      }

      // Try to call token functions (only name and symbol for speed)
      const [nameResult, symbolResult] = await Promise.all([
        callContractFunction(chain.rpcUrl, address, "06fdde03"), // name()
        callContractFunction(chain.rpcUrl, address, "95d89b41"), // symbol()
      ]);

      // If we got at least symbol or name, it's likely a token
      const name = nameResult ? decodeString(nameResult) : null;
      const symbol = symbolResult ? decodeString(symbolResult) : null;

      if (name || symbol) {
        // Get decimals and totalSupply only if we found a token (to save time)
        const [decimalsResult, totalSupplyResult] = await Promise.all([
          callContractFunction(chain.rpcUrl, address, "313ce567"), // decimals()
          callContractFunction(chain.rpcUrl, address, "18160ddd"), // totalSupply()
        ]);

        const decimals = decimalsResult ? parseInt(decodeUint256(decimalsResult) || "0", 10) : null;
        const totalSupply = totalSupplyResult ? decodeUint256(totalSupplyResult) : null;

        return {
          address,
          chainId: chain.chainId,
          chainName: chain.name,
          name,
          symbol,
          decimals,
          totalSupply,
          isToken: true,
        };
      }

      return null;
    })();

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });

    return await Promise.race([checkPromise, timeoutPromise]);
  } catch (error) {
    console.error(`[TokenDetection] Failed to check ${chain.name}:`, error);
    return null;
  }
}

/**
 * Detect if an address is an ERC-20 token by calling standard functions
 * Checks chains in parallel for speed, with individual timeouts
 */
export async function detectTokenContract(
  address: string,
  chainId?: number,
): Promise<TokenInfo | null> {
  // Dynamically get RPC URLs (with QuickNode if available)
  const { env } = await import("../config");
  const allChains = getChainRPCs(env.quicknodeApiKey);
  
  const chainsToCheck = chainId
    ? allChains.filter((c) => c.chainId === chainId)
    : allChains;

  // Check all chains in parallel (with 5 second timeout per chain)
  // This is much faster than sequential checking
  const results = await Promise.all(
    chainsToCheck.map((chain) => checkChainForToken(chain, address, 5000)),
  );

  // Return the first successful result
  for (const result of results) {
    if (result && result.isToken) {
      return result;
    }
  }

  return null;
}

