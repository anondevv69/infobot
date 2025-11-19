import { initMiniAppSDK } from '@farcaster/miniapp-sdk';

// Initialize Farcaster Mini App SDK
let sdk: any = null;
let user: any = null;
let discordUser: any = null;

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('userId'); // From Discord bot (if coming from /connect command)
const platform = urlParams.get('platform') || 'discord';
const backendUrl = urlParams.get('backendUrl') || 'https://infobot-production-f74e.up.railway.app';
const challenge = urlParams.get('challenge'); // SIWF challenge from bot (REQUIRED for security)

// Discord OAuth configuration
// You'll need to set these in your Discord Developer Portal
const DISCORD_CLIENT_ID = 'YOUR_DISCORD_CLIENT_ID'; // TODO: Set this from environment or config
const DISCORD_REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;
const DISCORD_SCOPE = 'identify';

async function initSDK() {
  try {
    showStatus('info', '🔄 Initializing Farcaster SDK...');
    
    // Initialize the Mini App SDK
    sdk = await initMiniAppSDK();
    
    // Check if user is already authenticated
    try {
      user = await sdk.actions.signIn();
      if (user) {
        showUserInfo(user);
        showStatus('success', '✅ Connected to Farcaster!');
        document.getElementById('connectBtn')!.style.display = 'none';
        
        // Check if we can link accounts now
        checkCanLink();
      } else {
        // User not signed in - show connect button
        showStatus('info', '👆 Click "Connect with Farcaster" to sign in');
        document.getElementById('connectBtn')!.style.display = 'block';
      }
    } catch (error: any) {
      // User not signed in yet - this is normal
      console.log('[Mini App] User not signed in:', error?.message || error);
      showStatus('info', '👆 Click "Connect with Farcaster" to sign in');
      document.getElementById('connectBtn')!.style.display = 'block';
    }
  } catch (error: any) {
    console.error('[Mini App] Failed to initialize SDK:', error);
    showStatus('error', `Failed to initialize: ${error?.message || 'Make sure you\'re opening this in Warpcast'}`);
    document.getElementById('connectBtn')!.style.display = 'block';
  }
}

// Connect wallet function - REMOVED DUPLICATE, see below

// Link to Discord/Telegram bot
(window as any).linkBot = async function() {
  if (!user) {
    showStatus('error', 'Please connect your Farcaster account first');
    return;
  }
  
  await linkToBot(user);
};

// linkToBot function - REMOVED DUPLICATE, see below

function showUserInfo(user: any) {
  const userInfoDiv = document.getElementById('userInfo')!;
  userInfoDiv.innerHTML = `
    <div class="user-info">
      <h3>👤 Connected Account</h3>
      <p><strong>Username:</strong> @${user.username || 'N/A'}</p>
      <p><strong>FID:</strong> ${user.fid}</p>
      <p><strong>Custody Address:</strong> ${user.custodyAddress?.slice(0, 10)}...${user.custodyAddress?.slice(-8)}</p>
    </div>
  `;
}

function showStatus(type: 'success' | 'error' | 'info', message: string) {
  const statusDiv = document.getElementById('status')!;
  statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

// Connect Discord via OAuth
(window as any).connectDiscord = async function() {
  try {
    showStatus('info', '🔄 Redirecting to Discord...');
    
    // Check if we have a code from Discord OAuth callback
    const code = urlParams.get('code');
    if (code) {
      // Exchange code for access token
      await handleDiscordCallback(code);
      return;
    }
    
    // Start Discord OAuth flow
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?` +
      `client_id=${DISCORD_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&` +
      `response_type=code&` +
      `scope=${DISCORD_SCOPE}`;
    
    window.location.href = discordAuthUrl;
  } catch (error: any) {
    console.error('[Mini App] Discord OAuth error:', error);
    showStatus('error', `Discord connection failed: ${error.message || 'Unknown error'}`);
  }
};

// Handle Discord OAuth callback
async function handleDiscordCallback(code: string) {
  try {
    showStatus('info', '🔄 Verifying Discord connection...');
    
    // Exchange code for access token via backend (more secure)
    const response = await fetch(`${backendUrl}/api/discord/oauth`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        code,
        redirectUri: DISCORD_REDIRECT_URI,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to connect Discord');
    }
    
    const result = await response.json();
    discordUser = result.user;
    
    // Show Discord info
    showDiscordInfo(discordUser);
    showStatus('success', '✅ Discord connected!');
    
    // Check if we can link accounts now
    checkCanLink();
    
    // Remove code from URL
    const newUrl = window.location.href.split('?')[0] + 
      (userId ? `?userId=${userId}&platform=${platform}&backendUrl=${backendUrl}` : '');
    window.history.replaceState({}, '', newUrl);
  } catch (error: any) {
    console.error('[Mini App] Discord callback error:', error);
    showStatus('error', `Discord connection failed: ${error.message || 'Unknown error'}`);
  }
}

// Show Discord connection info
function showDiscordInfo(discordUser: any) {
  const discordInfoDiv = document.getElementById('discordInfo')!;
  const discordUsernameSpan = document.getElementById('discordUsername')!;
  const discordUserIdSpan = document.getElementById('discordUserId')!;
  
  discordInfoDiv.style.display = 'block';
  discordUsernameSpan.textContent = `${discordUser.username}#${discordUser.discriminator || ''}`;
  discordUserIdSpan.textContent = discordUser.id;
  
  // Hide connect button
  document.getElementById('connectDiscordBtn')!.style.display = 'none';
}

// Check if we can link accounts (both Discord and Farcaster connected)
function checkCanLink() {
  if (discordUser && user) {
    // Both connected - show link button
    document.getElementById('linkBotBtn')!.style.display = 'block';
    showStatus('success', '✅ Both accounts connected! Click "Link Accounts" to complete setup.');
  } else if (discordUser && !user) {
    showStatus('info', '💡 Now connect your Farcaster account to complete the setup.');
  } else if (!discordUser && user) {
    showStatus('info', '💡 Now connect your Discord account to complete the setup.');
  }
}

// Link Farcaster account to Discord/Telegram bot
async function linkToBot(farcasterUser: any) {
  try {
    showStatus('info', '🔄 Linking accounts...');
    
    // Use Discord user ID if available, otherwise use userId from URL params
    const finalUserId = discordUser?.id || userId;
    const finalPlatform = discordUser ? 'discord' : (platform || 'discord');
    
    if (!finalUserId) {
      showStatus('error', '❌ No Discord/Telegram connection found. Please connect Discord above or use /connect command in Discord/Telegram.');
      return;
    }
    
    // SECURITY: Challenge is required for signature verification
    if (!challenge) {
      showStatus('error', '❌ Missing security challenge. Please use /connect command in Discord/Telegram to get a valid connection link.');
      return;
    }
    
    // SECURITY: Get signed SIWF message from Farcaster SDK
    // The SDK should provide a way to sign a message with the user's custody address
    let signedMessage: string | null = null;
    let signature: string | null = null;
    
    try {
      // Create a message to sign (includes challenge for verification)
      const messageToSign = `Connect to InfoBot\n\nChallenge: ${challenge}\nPlatform: ${finalPlatform}\nUser ID: ${finalUserId}\n\nThis signature proves you own this Farcaster account.`;
      
      // Try to get signature from SDK (if available)
      // Note: Farcaster Mini App SDK may provide signing capabilities
      if (sdk?.actions?.signMessage) {
        const signResult = await sdk.actions.signMessage(messageToSign);
        signedMessage = messageToSign;
        signature = signResult?.signature || null;
      } else if (farcasterUser.signature) {
        // If SDK provides signature directly
        signedMessage = messageToSign;
        signature = farcasterUser.signature;
      } else {
        // Fallback: Use the challenge as the message and let backend verify via Neynar
        // Backend will verify the user owns the custody address
        signedMessage = challenge;
        signature = null; // Backend will verify via Neynar API lookup
      }
    } catch (signError: any) {
      console.warn('[Mini App] Could not get signature from SDK:', signError);
      // Continue without signature - backend will verify via Neynar API
      signedMessage = challenge;
      signature = null;
    }
    
    // Log the request for debugging
    console.log('[Mini App] Making request to:', `${backendUrl}/api/siwf/miniapp-connect`);
    console.log('[Mini App] Request data:', {
      userId: finalUserId,
      platform: finalPlatform,
      fid: farcasterUser.fid,
      username: farcasterUser.username,
      challenge: challenge,
      hasSignature: !!signature,
      discordUser: discordUser ? `${discordUser.username}#${discordUser.discriminator}` : 'none',
    });
    
    // Try to send connection data to backend
    let response: Response;
    try {
      response = await fetch(`${backendUrl}/api/siwf/miniapp-connect`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          // Required for verification
          challenge: challenge,
          userId: finalUserId,
          platform: finalPlatform,
          // Farcaster user data (will be verified server-side)
          fid: farcasterUser.fid,
          username: farcasterUser.username,
          custodyAddress: farcasterUser.custodyAddress,
          verifiedAddresses: farcasterUser.verifiedAddresses || [],
          // Signed message for cryptographic verification
          message: signedMessage,
          signature: signature,
          // Include Discord info if available
          discordUsername: discordUser ? `${discordUser.username}#${discordUser.discriminator}` : undefined,
          discordId: discordUser?.id,
          // Delegated signer info (if available from SDK)
          signerPrivateKey: farcasterUser.signerPrivateKey,
          signerPublicKey: farcasterUser.signerPublicKey,
          signerFid: farcasterUser.signerFid,
        }),
      });
    } catch (fetchError: any) {
      // CORS or network error - fallback to server-side SIWF flow
      console.error('[Mini App] CORS/Network error:', fetchError);
      showStatus('error', '❌ CORS error detected. Redirecting to server-side flow...');
      
      // Generate server-side SIWF URL as fallback
      const challenge = crypto.randomUUID(); // Simple challenge for fallback
      const siwfUrl = `https://warpcast.com/~/signin?challenge=${challenge}&redirect_uri=${encodeURIComponent(`${backendUrl}/api/siwf/callback?challenge=${challenge}&userId=${finalUserId}&platform=${finalPlatform}`)}`;
      
      setTimeout(() => {
        showStatus('info', '🔄 Redirecting to server-side connection flow...');
        window.location.href = siwfUrl;
      }, 2000);
      return;
    }
    
    console.log('[Mini App] Response status:', response.status);
    console.log('[Mini App] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      showStatus('success', '✅ Successfully linked! You can now use the bot in Discord.');
      
      // Show success message with instructions
      setTimeout(() => {
        showStatus('info', '💡 Go to Discord and use /balance or /buy to start trading!');
      }, 2000);
    } else {
      throw new Error(result.error || 'Failed to link accounts');
    }
  } catch (error: any) {
    console.error('[Mini App] Link error:', error);
    console.error('[Mini App] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    // Show more detailed error message
    let errorMessage = 'Failed to link: ';
    if (error.message) {
      errorMessage += error.message;
    } else if (error.name === 'TypeError' && error.message?.includes('fetch')) {
      errorMessage += 'Network/CORS error. Try using the server-side flow from Discord/Telegram instead.';
    } else {
      errorMessage += 'Unknown error. Try using /connect command in Discord/Telegram.';
    }
    
    showStatus('error', errorMessage);
    
    // Show fallback option
    if (userId) {
      setTimeout(() => {
        showStatus('info', '💡 Tip: Use the "Connect with Farcaster (Recommended)" button in Discord for a more reliable connection.');
      }, 3000);
    }
  }
}

// Connect wallet function - handles Farcaster sign-in
(window as any).connectWallet = async function() {
  try {
    showStatus('info', '🔄 Connecting to Farcaster...');
    const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
    if (connectBtn) {
      connectBtn.disabled = true;
    }
    
    // Sign in with Farcaster (this will show QR code on mobile)
    user = await sdk.actions.signIn();
    
    if (user) {
      showUserInfo(user);
      showStatus('success', '✅ Successfully connected to Farcaster!');
      if (connectBtn) {
        connectBtn.style.display = 'none';
      }
      
      // Check if we can link accounts now
      checkCanLink();
      
      // Automatically link if we have both Discord and userId
      if (discordUser || userId) {
        // Small delay to show success message
        setTimeout(() => {
          linkToBot(user);
        }, 1000);
      } else {
        // No Discord/userId - show message
        showStatus('info', '💡 Connect Discord or use /connect command in Discord/Telegram to link accounts');
      }
    } else {
      showStatus('error', 'Failed to get user info from Farcaster');
      if (connectBtn) {
        connectBtn.disabled = false;
      }
    }
  } catch (error: any) {
    console.error('[Mini App] Connection error:', error);
    showStatus('error', `Connection failed: ${error?.message || 'Unknown error'}. Try again or use the server-side flow from Discord/Telegram.`);
    const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
    if (connectBtn) {
      connectBtn.disabled = false;
    }
  }
};

// Update linkBot function
(window as any).linkBot = async function() {
  if (!user) {
    showStatus('error', 'Please connect your Farcaster account first');
    return;
  }
  
  if (!discordUser && !userId) {
    showStatus('error', 'Please connect your Discord account first or use /connect command in Discord');
    return;
  }
  
  await linkToBot(user);
};

// Show loading indicator on page load
document.addEventListener('DOMContentLoaded', () => {
  const loadingIndicator = document.getElementById('loadingIndicator');
  const connectBtn = document.getElementById('connectBtn');
  if (loadingIndicator) {
    loadingIndicator.style.display = 'block';
  }
  if (connectBtn) {
    connectBtn.style.display = 'none';
  }
  
  // Show warning if no userId (direct visit)
  if (!userId) {
    const warning = document.getElementById('noUserIdWarning');
    if (warning) {
      warning.style.display = 'block';
    }
  }
  
  // Initialize SDK
  initSDK().then(() => {
    // Hide loading indicator after init
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  }).catch((error) => {
    console.error('[Mini App] Init error:', error);
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
    if (connectBtn) {
      connectBtn.style.display = 'block';
    }
  });
});

// Check if we have Discord OAuth code
const code = urlParams.get('code');
if (code) {
  handleDiscordCallback(code);
}

