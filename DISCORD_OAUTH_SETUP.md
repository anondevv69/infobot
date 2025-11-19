# Discord OAuth Setup for Mini App

## Overview

The Mini App now supports connecting Discord accounts directly via OAuth, allowing users to:
1. Connect Discord account (OAuth)
2. Connect Farcaster account
3. Link both accounts together

## Setup Steps

### 1. Discord Developer Portal Setup

1. Go to https://discord.com/developers/applications
2. Select your application (or create a new one)
3. Go to **OAuth2** section
4. Add redirect URI:
   ```
   https://infobot.fun
   ```
   (Or your Mini App domain)
5. Copy:
   - **Client ID**
   - **Client Secret**

### 2. Environment Variables

Add to your backend `.env`:
```env
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
DISCORD_REDIRECT_URI=https://infobot.fun
```

### 3. Update Mini App Configuration

In `miniapp/src/main.ts`, update:
```typescript
const DISCORD_CLIENT_ID = 'YOUR_DISCORD_CLIENT_ID'; // TODO: Set this
```

Or better, pass it from environment/config:
```typescript
const DISCORD_CLIENT_ID = urlParams.get('discordClientId') || 
  import.meta.env.VITE_DISCORD_CLIENT_ID || 
  'YOUR_DISCORD_CLIENT_ID';
```

### 4. Deploy

1. Deploy backend with new environment variables
2. Deploy Mini App with updated code
3. Test the flow

## User Flow

### Option 1: From Mini App Directly

1. User visits Mini App: `https://infobot.fun`
2. User clicks "Connect Discord Account"
3. Discord OAuth flow → User authorizes
4. User clicks "Connect with Farcaster"
5. Farcaster sign-in (QR code)
6. User clicks "Link Accounts"
7. ✅ Both accounts linked!

### Option 2: From Discord Bot (Existing Flow)

1. User runs `/connect` in Discord
2. Bot sends Mini App URL with `userId` parameter
3. User connects Farcaster in Mini App
4. ✅ Accounts linked automatically (userId already known)

## Backend Endpoints

### POST `/api/discord/oauth`

Exchanges Discord OAuth code for user info.

**Request:**
```json
{
  "code": "discord_oauth_code",
  "redirectUri": "https://infobot.fun"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "123456789",
    "username": "username",
    "discriminator": "1234",
    "avatar": "avatar_hash",
    "email": "user@example.com"
  }
}
```

## Security Notes

1. **Client Secret**: Never expose in frontend code
   - Backend handles token exchange
   - Frontend only gets user info

2. **Redirect URI**: Must match exactly in Discord Developer Portal

3. **HTTPS**: Required for OAuth (Discord enforces this)

## Testing

### Test Discord OAuth

1. Visit Mini App: `https://infobot.fun`
2. Click "Connect Discord Account"
3. Should redirect to Discord authorization
4. Authorize → Should redirect back with code
5. Should show Discord username and ID

### Test Full Flow

1. Connect Discord via OAuth
2. Connect Farcaster
3. Click "Link Accounts"
4. Should show success message
5. Go to Discord → Run `/balance` → Should work!

## Troubleshooting

### "Discord OAuth not configured"
- Check `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are set
- Restart backend after adding env vars

### "Failed to exchange code for token"
- Check redirect URI matches exactly
- Check client secret is correct
- Check code hasn't expired (codes expire quickly)

### "Failed to get user info"
- Check access token is valid
- Check Discord API is accessible

## Next Steps

- [ ] Add Telegram OAuth (if available)
- [ ] Add connection status display
- [ ] Add disconnect functionality
- [ ] Add account switching

