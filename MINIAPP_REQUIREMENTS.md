# Mini App Requirements & Backend Connection

## What Your Mini App Needs to Do

Your Mini App at `https://infobot.fun` needs to:

### 1. **Read URL Parameters**
When users click the `/connect` button, they'll be sent to:
```
https://farcaster.xyz/miniapps/J68v-h9yA2J3/infobot?userId=123&platform=discord&backendUrl=https://infobot-production-f74e.up.railway.app
```

Your Mini App needs to read:
- `userId` - Discord/Telegram user ID
- `platform` - "discord" or "telegram"
- `backendUrl` - Your backend URL

### 2. **Authenticate User with Farcaster**
Use Farcaster's Mini App SDK to:
- Show QR code (mobile) or direct login (desktop)
- Get user to sign in with their Farcaster account
- Receive authenticated user data (FID, username, custody address)

### 3. **Send Data to Backend**
After authentication, send the data to your backend:
```
POST https://infobot-production-f74e.up.railway.app/api/siwf/miniapp-connect
```

**Request Body:**
```json
{
  "userId": "123",
  "platform": "discord",
  "fid": 456,
  "username": "alice",
  "custodyAddress": "0x...",
  "verifiedAddresses": ["0x..."]
}
```

### 4. **Show Success/Error**
- If successful: Show "✅ Connected! Return to Discord/Telegram"
- If error: Show error message

## Do You Need a Backend?

**YES** - But you don't need to build one! The backend already exists at:
- `https://infobot-production-f74e.up.railway.app`

Your Mini App just needs to **call** this backend endpoint - you don't need to build a new backend.

## How to Connect Your Lovable Mini App to the Backend

### Option 1: JavaScript/TypeScript (If Lovable supports custom code)

Add this code to your Lovable Mini App:

```javascript
// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('userId');
const platform = urlParams.get('platform') || 'discord';
const backendUrl = urlParams.get('backendUrl') || 'https://infobot-production-f74e.up.railway.app';

// Initialize Farcaster SDK (if available in Lovable)
// This depends on what Lovable provides

// After user signs in, send to backend:
async function connectToBackend(farcasterUser) {
  try {
    const response = await fetch(`${backendUrl}/api/siwf/miniapp-connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        platform: platform,
        fid: farcasterUser.fid,
        username: farcasterUser.username,
        custodyAddress: farcasterUser.custodyAddress,
        verifiedAddresses: farcasterUser.verifiedAddresses || [],
      }),
    });

    const result = await response.json();
    
    if (response.ok) {
      // Show success message
      alert('✅ Connected! Return to Discord/Telegram');
    } else {
      // Show error
      alert('❌ Error: ' + (result.error || 'Connection failed'));
    }
  } catch (error) {
    console.error('Connection error:', error);
    alert('❌ Failed to connect: ' + error.message);
  }
}
```

### Option 2: Use Lovable's API/Backend Features

If Lovable has built-in API/backend features:
1. Create an API endpoint in Lovable
2. Have it call your Railway backend
3. Or use Lovable's backend to store the connection (but you'd need to sync with Railway)

### Option 3: Simple HTML Form (If Lovable doesn't support custom code)

If Lovable only allows HTML/forms, you could:
1. Create a form that posts to your backend
2. But you'd still need Farcaster authentication (which requires JavaScript/SDK)

## What Lovable Needs to Support

For the Mini App to work, Lovable needs to support:
- ✅ **JavaScript/TypeScript** - To use Farcaster SDK
- ✅ **Fetch API** - To call your backend
- ✅ **URL Parameters** - To read userId, platform, backendUrl
- ✅ **Farcaster SDK** - To authenticate users

## Backend Endpoint Details

Your backend endpoint is already set up and ready:

**Endpoint:** `POST /api/siwf/miniapp-connect`

**Request:**
```json
{
  "userId": "discord-user-id",
  "platform": "discord",
  "fid": 123,
  "username": "alice",
  "custodyAddress": "0x...",
  "verifiedAddresses": ["0x..."]
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Successfully connected to bot",
  "connection": {
    "fid": 123,
    "username": "alice",
    "custodyAddress": "0x..."
  }
}
```

**Response (Error):**
```json
{
  "error": "Missing required fields"
}
```

## Testing

1. **Test URL Parameters:**
   - Visit: `https://infobot.fun?userId=test&platform=discord&backendUrl=https://infobot-production-f74e.up.railway.app`
   - Check if your Mini App can read these parameters

2. **Test Backend Connection:**
   - Use browser console or Postman
   - POST to: `https://infobot-production-f74e.up.railway.app/api/siwf/miniapp-connect`
   - With test data

3. **Test Full Flow:**
   - Run `/connect` in Discord
   - Should open Mini App
   - Sign in with Farcaster
   - Should connect to backend
   - Return to Discord - should be connected

## Questions for Lovable

Ask Lovable support:
1. "Can I use the Farcaster Mini App SDK in my app?"
2. "Can I make HTTP requests (fetch/axios) to external APIs?"
3. "Can I read URL query parameters?"
4. "Do you support JavaScript/TypeScript custom code?"

If Lovable doesn't support these, you might need to:
- Use a different platform (Vercel, Railway, Netlify)
- Or build a simple HTML/JS page and host it separately

## Summary

**You DON'T need to build a new backend** - the backend already exists at Railway.

**You DO need to:**
1. Make your Mini App read URL parameters
2. Use Farcaster SDK to authenticate users
3. Call the existing backend endpoint with the authenticated user data

The backend is ready - your Mini App just needs to call it!

