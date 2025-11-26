# QuickNode Endpoint Setup Guide

## ⚠️ Important: QuickNode Endpoint Format

The test showed that QuickNode endpoints are returning `401 Unauthorized`. This means **QuickNode requires you to create separate endpoints for each chain** in your QuickNode dashboard.

## How to Get Your QuickNode Endpoints

### Step 1: Log into QuickNode Dashboard
1. Go to https://dashboard.quicknode.com/
2. Log in with your account

### Step 2: Create Endpoints for Each Chain
1. Click **"Create Endpoint"** or **"Add Endpoint"**
2. Select each chain you need:
   - Ethereum
   - Base
   - BSC
   - Polygon
   - Arbitrum
   - Optimism
   - Avalanche
   - Fantom
   - Mantle

3. Each endpoint will have its own unique URL, like:
   ```
   https://your-endpoint-name.ethereum.quiknode.pro/YOUR_API_KEY/
   https://your-endpoint-name.base.quiknode.pro/YOUR_API_KEY/
   https://your-endpoint-name.bsc.quiknode.pro/YOUR_API_KEY/
   ```

### Step 3: Update the Code

Once you have the endpoint URLs, you have two options:

#### Option A: Use Environment Variables (Recommended)

Add each endpoint URL to your `.env` file:

```bash
QUICKNODE_ETHEREUM_URL=https://your-endpoint.ethereum.quiknode.pro/QN_c7a430c65dbc451086e19171e4cf3393/
QUICKNODE_BASE_URL=https://your-endpoint.base.quiknode.pro/QN_c7a430c65dbc451086e19171e4cf3393/
QUICKNODE_BSC_URL=https://your-endpoint.bsc.quiknode.pro/QN_c7a430c65dbc451086e19171e4cf3393/
# ... etc for other chains
```

Then update `src/services/tokenDetection.ts` to use these URLs.

#### Option B: Update Code Directly

Update the `getChainRPCs` function in `src/services/tokenDetection.ts` to use your specific endpoint URLs.

## Current Status

✅ **Code is ready** - Just needs the correct endpoint URLs
❌ **Endpoints need to be created** - In QuickNode dashboard
⚠️ **Falling back to public RPCs** - Bot will still work, just slower

## Testing

After setting up your endpoints, run the test again:

```bash
node test-quicknode.js
```

You should see:
- ✅ Successful responses from QuickNode endpoints
- ⏱️ Faster response times (200-500ms vs 2-5 seconds)
- 📊 Performance improvement summary

## Alternative: Use QuickNode's Unified Endpoint

Some QuickNode plans offer a "unified endpoint" that works for all chains. If you have this, the format might be different. Check your QuickNode dashboard for this option.

## For Now: Bot Still Works

Even without QuickNode endpoints configured, the bot will:
- ✅ Automatically fall back to public RPCs
- ✅ Still detect tokens (just slower)
- ✅ Work normally for all features

QuickNode is an **optimization**, not a requirement!








