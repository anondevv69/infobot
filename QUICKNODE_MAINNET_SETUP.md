# QuickNode Mainnet Setup Guide

## ✅ Answer: Create **MAINNET** Endpoints

For your bot to detect real tokens on production blockchains, you need **MAINNET** endpoints.

## Why Mainnet?

- ✅ **Real tokens**: Your bot detects real tokens on production chains
- ✅ **Real transactions**: Users paste real addresses from mainnet
- ✅ **Real data**: DexScreener, Etherscan, etc. all use mainnet data
- ❌ **Testnet**: Only has test tokens, not real ones
- ❌ **Devnet**: Only for development/testing

## Step-by-Step: Creating Mainnet Endpoints

### 1. Go to QuickNode Dashboard
- Visit: https://dashboard.quicknode.com/
- Log in with your account

### 2. Create Endpoint
- Click **"Create Endpoint"** or **"Add Endpoint"**
- Select **"Mainnet"** (NOT testnet or devnet)

### 3. Select Chain
For each chain you need, create a separate mainnet endpoint:

1. **Ethereum** → Select "Ethereum Mainnet"
2. **Base** → Select "Base Mainnet"
3. **BSC** → Select "BNB Smart Chain Mainnet"
4. **Polygon** → Select "Polygon Mainnet"
5. **Arbitrum** → Select "Arbitrum One Mainnet"
6. **Optimism** → Select "Optimism Mainnet"
7. **Avalanche** → Select "Avalanche C-Chain Mainnet"
8. **Fantom** → Select "Fantom Mainnet"
9. **Mantle** → Select "Mantle Mainnet"

### 4. Get Endpoint URLs
After creating each endpoint, QuickNode will give you a URL like:
```
https://your-endpoint-name.ethereum.quiknode.pro/QN_c7a430c65dbc451086e19171e4cf3393/
https://your-endpoint-name.base.quiknode.pro/QN_c7a430c65dbc451086e19171e4cf3393/
```

### 5. Copy All Endpoint URLs
You'll need all 9 endpoint URLs to update the code.

## Quick Reference: What to Select

| Chain | QuickNode Selection |
|-------|-------------------|
| Ethereum | **Ethereum Mainnet** |
| Base | **Base Mainnet** |
| BSC | **BNB Smart Chain Mainnet** |
| Polygon | **Polygon Mainnet** |
| Arbitrum | **Arbitrum One Mainnet** |
| Optimism | **Optimism Mainnet** |
| Avalanche | **Avalanche C-Chain Mainnet** |
| Fantom | **Fantom Mainnet** |
| Mantle | **Mantle Mainnet** |

## Important Notes

- ✅ **Always select MAINNET** - Never testnet or devnet
- ✅ **Create separate endpoints** - One for each chain
- ✅ **Copy the full URL** - Including the `/` at the end
- ⚠️ **Free tier limits** - Check your plan's request limits

## After Creating Endpoints

Once you have all 9 mainnet endpoint URLs, share them with me and I'll update the code to use them. Or you can update `src/services/tokenDetection.ts` yourself.

## Testing

After setting up mainnet endpoints, run:
```bash
node test-quicknode.js
```

You should see:
- ✅ Successful responses (no 401 errors)
- ⏱️ Fast response times (200-500ms)
- 📊 Performance improvement

## Summary

**Create MAINNET endpoints for all 9 chains** - that's what you need! 🚀








