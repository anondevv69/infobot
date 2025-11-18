# Farcaster Trading Bot - Mini App

This is a Farcaster Mini App that provides a better authentication experience with QR code support for mobile users.

## Features

✅ **QR Code Login**: Shows QR code on mobile for easy login
✅ **Native Farcaster Experience**: Works within Warpcast
✅ **Wallet Connection**: Handles Farcaster wallet connection
✅ **Bot Integration**: Links back to Discord/Telegram bot

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure

Update `src/main.ts` with your backend URL if needed.

### 3. Create Assets

Generate required assets:
- `icon.png` (1024×1024)
- `splash.png` (200×200)
- `hero.png` (1200×630)

Use: https://www.miniappassets.com/

### 4. Update Manifest

Edit `.well-known/farcaster.json` with your domain and asset URLs.

### 5. Deploy

Deploy to a public HTTPS domain (Railway, Vercel, Netlify, etc.)

## Development

```bash
npm run dev
```

Visit `http://localhost:5173` (won't work as Mini App - need to deploy)

## Testing

1. Deploy to public URL
2. Visit: https://farcaster.xyz/~/developers/mini-apps/preview
3. Enter your Mini App URL
4. Test the connection flow

## How It Works

1. User clicks `/connect` in Discord/Telegram
2. Bot sends Mini App link with `userId` and `platform` parameters
3. User opens Mini App in Warpcast
4. Mini App shows QR code (mobile) or direct login (desktop)
5. User signs in with Farcaster
6. Mini App sends connection data to backend
7. Backend stores connection
8. User returns to Discord/Telegram
9. Bot confirms connection ✅

## Environment Variables

None required - uses URL parameters from bot.

## Notes

- Must be deployed to HTTPS domain
- Manifest file must be accessible at `/.well-known/farcaster.json`
- Works best when opened from within Warpcast

