/**
 * Basescan API service for Base network
 * Used to get contract creation information
 */

const BASESCAN_API_BASE = "https://api.basescan.org/api";

export interface ContractCreation {
  contractAddress: string;
  contractCreator: string;
  txHash: string;
}

/**
 * Get contract creation information from Basescan API
 * Returns the creator address and transaction hash
 * Uses the transaction list to find the contract creation transaction
 */
export async function getContractCreation(
  contractAddress: string,
): Promise<ContractCreation | null> {
  try {
    // Method 1: Try to get the contract creation transaction
    // Get the first transaction for this contract (which should be the creation transaction)
    const txListUrl = `${BASESCAN_API_BASE}?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc`;
    
    const txResponse = await fetch(txListUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (txResponse.ok) {
      const txData = (await txResponse.json()) as {
        status?: string;
        message?: string;
        result?: Array<{
          hash: string;
          from: string;
          to: string;
          contractAddress?: string;
        }>;
      };

      if (txData.status === "1" && txData.result && txData.result.length > 0) {
        const firstTx = txData.result[0];
        // If the "to" field is empty, it's a contract creation transaction
        if (!firstTx.to || firstTx.to === "" || firstTx.contractAddress?.toLowerCase() === contractAddress.toLowerCase()) {
          return {
            contractAddress: contractAddress,
            contractCreator: firstTx.from,
            txHash: firstTx.hash,
          };
        }
      }
    }

    // Method 2: Try the contract creation endpoint (may be deprecated but worth trying)
    const url = `${BASESCAN_API_BASE}?module=contract&action=getcontractcreation&contractaddresses=${contractAddress}`;
    
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data = (await response.json()) as {
        status?: string;
        message?: string;
        result?: Array<{
          contractAddress: string;
          contractCreator: string;
          txHash: string;
        }>;
      };

      if (data.status === "1" && data.result && data.result.length > 0) {
        const result = data.result[0];
        return {
          contractAddress: result.contractAddress,
          contractCreator: result.contractCreator,
          txHash: result.txHash,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch contract creation from Basescan:", error);
    return null;
  }
}

