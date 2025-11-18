// Quick test script to check DexScreener API response
const address = "0xDD43923eF4c7b7Fe7e200518CC2229DDD36D444";

async function testDexScreener() {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
    console.log(`Testing DexScreener API: ${url}`);
    
    const response = await fetch(url);
    console.log(`Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error(`API error: ${response.status}`);
      return;
    }
    
    const data = await response.json();
    console.log(`\nResponse structure:`, {
      hasPairs: !!data.pairs,
      pairsLength: data.pairs?.length ?? 0,
    });
    
    if (data.pairs && data.pairs.length > 0) {
      const bestPair = data.pairs.reduce((best, current) => {
        const bestLiq = best.liquidity?.usd ?? 0;
        const currentLiq = current.liquidity?.usd ?? 0;
        return currentLiq > bestLiq ? current : best;
      }, data.pairs[0]);
      
      console.log(`\nBest pair (highest liquidity):`, {
        chainId: bestPair.chainId,
        chainName: bestPair.chainId === "bsc" || bestPair.chainId === "56" ? "BSC" : bestPair.chainId,
        tokenName: bestPair.baseToken?.name,
        tokenSymbol: bestPair.baseToken?.symbol,
        liquidity: bestPair.liquidity?.usd,
        priceUsd: bestPair.priceUsd,
      });
      
      // Show all chains this token is on
      const chains = [...new Set(data.pairs.map(p => p.chainId))];
      console.log(`\nToken found on chains:`, chains);
    } else {
      console.log(`\n❌ No pairs found - token not in DexScreener database`);
    }
  } catch (error) {
    console.error(`Error:`, error);
  }
}

testDexScreener();

