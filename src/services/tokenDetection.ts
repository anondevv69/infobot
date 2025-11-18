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
}

const CHAIN_RPCS: ChainRPC[] = [
  { chainId: 1, name: "Ethereum", rpcUrl: "https://eth.llamarpc.com" },
  { chainId: 56, name: "BSC", rpcUrl: "https://bsc-dataseed.binance.org" },
  { chainId: 137, name: "Polygon", rpcUrl: "https://polygon-rpc.com" },
  { chainId: 42161, name: "Arbitrum", rpcUrl: "https://arb1.arbitrum.io/rpc" },
  { chainId: 10, name: "Optimism", rpcUrl: "https://mainnet.optimism.io" },
  { chainId: 8453, name: "Base", rpcUrl: "https://mainnet.base.org" },
  { chainId: 43114, name: "Avalanche", rpcUrl: "https://api.avax.network/ext/bc/C/rpc" },
  { chainId: 250, name: "Fantom", rpcUrl: "https://rpc.ftm.tools" },
  { chainId: 5000, name: "Mantle", rpcUrl: "https://rpc.mantle.xyz" },
];

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
  const chainsToCheck = chainId
    ? CHAIN_RPCS.filter((c) => c.chainId === chainId)
    : CHAIN_RPCS;

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

