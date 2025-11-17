# Base Token Integration Guide

## Overview

This implementation adds support for detecting and displaying Base network tokens from various factories (Rainbow, ApeStore, Fey, etc.) with comprehensive market data and trading links.

## Architecture

### 1. **DexScreener API Integration** (`src/services/dexscreener.ts`)
   - **Why DexScreener?**
     - Multi-chain support (Base, Solana, Ethereum, etc.)
     - Free tier available
     - Real-time market data (price, volume, liquidity, market cap)
     - Price change percentages (1H, 24H, etc.)
     - Trading activity (buys/sells)
     - No API key required for basic usage

   - **Features:**
     - Fetches token metrics for Base network tokens
     - Returns price, market cap, volume, liquidity, FDV
     - Provides trading activity data
     - Returns DexScreener URL for charts

### 2. **Factory Detection** (`src/services/baseFactories.ts`)
   - **Purpose:** Identify which factory created a token (Rainbow, ApeStore, Fey, Zora)
   - **Current Status:** Framework in place, needs actual factory addresses
   - **TODO:** 
     - Add actual factory contract addresses
     - Implement Basescan API integration to detect factory from creation transaction
     - Add pattern matching for factory-specific token characteristics

### 3. **Token Embed Builder** (`src/utils/baseTokenEmbeds.ts`)
   - Creates rich Discord embeds with:
     - Token metrics (price, MC, FDV, liquidity, volume)
     - Price change indicators (24H %)
     - Trading activity (buys/sells)
     - Factory information
     - Trading links (DexScreener, Uniswap, Basescan, factory-specific)

### 4. **Handler Integration** (`src/handlers/clankerAddress.ts`)
   - Automatically detects Base tokens when an Ethereum address is pasted
   - Checks DexScreener for token data
   - Attempts factory detection
   - Displays comprehensive token card with trading options

## Next Steps

### 1. **Get Factory Contract Addresses**

You need to find the actual factory contract addresses for:
- **Rainbow Factory**: Check Rainbow's documentation or Basescan
- **ApeStore Factory**: Check ApeStore's documentation or Basescan  
- **Fey Factory**: Check Fey's documentation or Basescan

Once you have them, update `src/services/baseFactories.ts`:

```typescript
RAINBOW: {
  name: "Rainbow",
  address: "0xACTUAL_RAINBOW_FACTORY_ADDRESS",
  explorerUrl: "https://basescan.org/address/",
  swapUrl: "https://app.uniswap.org/#/swap?chain=base&outputCurrency=",
},
```

### 2. **Implement Factory Detection**

Two approaches:

**Option A: Basescan API** (Recommended)
- Use Basescan API to get contract creation transaction
- Parse transaction to find factory address
- Match against known factories

**Option B: Pattern Matching**
- Check token metadata/characteristics
- Look for factory-specific patterns in contract code
- Use on-chain data to infer factory

### 3. **Add ERC20 Token Metadata**

Currently, token name and symbol are `null`. You can:
- Use Basescan API to fetch ERC20 metadata
- Use ethers.js to call `name()` and `symbol()` on the contract
- Use DexScreener data (if available)

### 4. **Optional: Add More APIs**

For even more comprehensive data:
- **Birdeye API**: Advanced analytics, holder distribution
- **CoinGecko API**: Historical data, market rankings
- **Moralis API**: On-chain analytics, holder insights

## Usage

Once factory addresses are added, the bot will automatically:
1. Detect Base tokens when addresses are pasted
2. Fetch market data from DexScreener
3. Attempt to identify the factory
4. Display a comprehensive token card with:
   - Market metrics
   - Trading activity
   - Trading links (DexScreener, Uniswap, Basescan)
   - Factory-specific swap links

## API Costs

- **DexScreener**: Free tier available, no API key required
- **Basescan API**: Free tier available (5 calls/sec), API key recommended
- **Optional APIs**: May require paid tiers for production use

## Testing

To test:
1. Paste a Base token address in Discord
2. Bot should detect it and show token card
3. Verify metrics are accurate
4. Test trading links

## Example Token Addresses for Testing

You can test with any Base token address. Popular ones:
- Zora creator coins
- Any ERC20 token on Base network

## Notes

- DexScreener may not have data for very new tokens
- Factory detection requires actual factory addresses
- Some tokens may not be on DexScreener yet (newly created)
- Consider adding fallback to direct contract calls for metadata



