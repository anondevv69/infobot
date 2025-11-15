# Railway Deployment Plan

## Services to Create
- **App Service:** Deploy the backend API + Neynar webhook receiver (Node.js/TypeScript). Use the “Github repo” option once the API repo exists; pick Node environment.
- **Postgres Database:** Add Railway’s Postgres add-on for persistent storage (subscriptions, guilds, users).

## Environment Variables to Configure
- `DISCORD_BOT_TOKEN`: token for the bot to post messages.
- `DISCORD_CLIENT_ID`: application ID.
- `NEYNAR_API_KEY`: API key for webhook + SDK calls.
- `WEBHOOK_SECRET`: shared secret for verifying incoming Neynar webhooks.
- `DATABASE_URL`: provided automatically by Railway when linking the Postgres service.

## Notes
- Use Railway’s built-in HTTPS URL as the webhook endpoint (e.g., `https://defiant-chicken.up.railway.app/webhook/neynar`).
- Enable auto-deploy on main branch for continuous updates.

