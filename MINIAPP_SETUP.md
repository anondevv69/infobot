# Farcaster Mini App Setup Guide

## Overview

Instead of using direct SIWF links (which don't work well in Discord/Telegram), we're creating a **Farcaster Mini App** that:

1. ✅ Shows QR code for mobile login (native Farcaster experience)
2. ✅ Handles wallet connection properly
3. ✅ Links back to Discord/Telegram bot
4. ✅ Provides better UX than bot-based SIWF

## Architecture

```
User runs /connect in Discord/Telegram
  ↓
Bot sends Mini App link
  ↓
User opens Mini App in Warpcast
  ↓
Mini App shows QR code (mobile) or direct login (desktop)
  ↓
User signs in with Farcaster
  ↓
Mini App sends connection data to backend
  ↓
Backend stores connection
  ↓
User returns to Discord/Telegram
  ↓
Bot confirms connection ✅
```

## Setup Steps

### 1. Deploy Mini App

The Mini App needs to be hosted on a public domain (HTTPS required).

**Option A: Deploy to Railway/Vercel/Netlify**
```bash
cd miniapp
npm install
npm run build
# Deploy dist/ folder to your hosting service
```

**Option B: Use Railway**
1. Create new Railway service
2. Point to `miniapp/` directory
3. Set build command: `npm install && npm run build`
4. Set start command: `npm run preview` (or use a static file server)

### 2. Update Manifest File

Edit `miniapp/.well-known/farcaster.json`:

```json
{
  "name": "Trading Bot",
  "iconUrl": "https://your-domain.com/icon.png",
  "homeUrl": "https://your-domain.com",
  "splashImageUrl": "https://your-domain.com/splash.png",
  "splashBackgroundColor": "#667eea",
  "heroImageUrl": "https://your-domain.com/hero.png",
  "tagline": "Trade tokens directly from Discord and Telegram"
}
```

**Required Assets:**
- `icon.png` - 1024×1024px
- `splash.png` - 200×200px
- `hero.png` - 1200×630px

Generate these at: https://www.miniappassets.com/

### 3. Update Mini App Code

Edit `miniapp/src/main.ts`:
- Update `backendUrl` if needed
- Customize UI/styling

### 4. Update Bot Commands

The `/connect` command should now link to the Mini App:

```typescript
// In src/commands/connect.ts
const miniappUrl = `https://your-domain.com?userId=${userId}&platform=discord&backendUrl=${env.backendUrl}`;
```

### 5. Test Mini App

1. Deploy Mini App to public URL
2. Visit: https://farcaster.xyz/~/developers/mini-apps/preview
3. Enter your Mini App URL
4. Test the connection flow

## Environment Variables

### Mini App
- None required (uses URL parameters)

### Backend
- `NEYNAR_API_KEY` - For user verification (optional)
- `BACKEND_URL` - Your backend URL

## How It Works

### 1. User Clicks Connect in Discord/Telegram

Bot sends a message with Mini App link:
```
🔗 Connect your Farcaster account:
https://your-domain.com?userId=123&platform=discord
```

### 2. User Opens Mini App

- **On Mobile**: Shows QR code to scan with Warpcast app
- **On Desktop**: Direct login if already in Warpcast

### 3. User Signs In

Mini App SDK handles:
- QR code generation (mobile)
- SIWF authentication
- Wallet connection
- User data retrieval

### 4. Connection Stored

Mini App sends data to backend:
```json
POST /api/siwf/miniapp-connect
{
  "userId": "123",
  "platform": "discord",
  "fid": 456,
  "username": "alice",
  "custodyAddress": "0x...",
  "verifiedAddresses": ["0x..."]
}
```

### 5. User Returns to Bot

Bot confirms connection and user can start trading!

## Benefits Over Direct SIWF

✅ **QR Code Support**: Native mobile login experience
✅ **Better UX**: Works within Warpcast
✅ **Wallet Integration**: Can connect wallets directly
✅ **No Redirect Issues**: Stays within Farcaster ecosystem
✅ **Proper Authentication**: Uses Farcaster's native SDK

## Troubleshooting

### Mini App Not Loading
- Check HTTPS is enabled
- Verify manifest file is accessible at `/.well-known/farcaster.json`
- Check browser console for errors

### QR Code Not Showing
- Make sure you're testing on mobile or using mobile view
- Check Mini App SDK is initialized correctly
- Verify you're opening in Warpcast (not regular browser)

### Connection Not Storing
- Check backend logs
- Verify `backendUrl` is correct
- Check CORS settings if needed

## Next Steps

1. ✅ Deploy Mini App to public domain
2. ✅ Update manifest with your assets
3. ✅ Update bot `/connect` command to use Mini App URL
4. ✅ Test the full flow
5. ✅ Add wallet connection features (if needed)

## References

- [Farcaster Mini App Docs](https://docs.farcaster.xyz/developers/mini-apps)
- [Mini App SDK](https://docs.farcaster.xyz/developers/siwf/)
- [Mini App Asset Generator](https://www.miniappassets.com/)
- [Mini App Preview Tool](https://farcaster.xyz/~/developers/mini-apps/preview)

