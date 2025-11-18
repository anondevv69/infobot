# Basescan API Key Setup

## ✅ API Key Added Locally

Your Basescan API key has been added to your local `.env` file:
```
BASESCAN_API_KEY=VK75R7GXBEVUHQ4ZHGM1J34FGGE4WUXP1W
```

## 🚀 Add to Railway (Required for Production)

Since your bot runs on Railway, you need to add the API key there too:

### Option 1: Railway Dashboard
1. Go to your Railway project: https://railway.app
2. Select your service
3. Go to **Variables** tab
4. Click **+ New Variable**
5. Add:
   - **Name**: `BASESCAN_API_KEY`
   - **Value**: `VK75R7GXBEVUHQ4ZHGM1J34FGGE4WUXP1W`
6. Click **Add**
7. Railway will automatically redeploy

### Option 2: Railway CLI
```bash
railway variables set BASESCAN_API_KEY=VK75R7GXBEVUHQ4ZHGM1J34FGGE4WUXP1W
```

## ✅ Benefits

With the API key set, you'll get:
- ✅ Higher rate limits (5 calls/second → much higher with API key)
- ✅ More reliable API responses
- ✅ Better for production use
- ✅ Creator addresses will be fetched more reliably

## 🔒 Security Note

- ✅ `.env` is in `.gitignore` (won't be committed)
- ✅ Never commit API keys to git
- ✅ Railway variables are encrypted and secure

## 🧪 Test Locally

After adding to `.env`, restart your local bot:
```bash
npm run dev
```

The bot will automatically use the API key for Basescan requests.





