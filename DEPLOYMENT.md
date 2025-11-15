# Cloud Deployment Guide

This guide covers deploying the Discord bot to cloud platforms and pushing updates.

## Quick Deploy Options

### Option 1: Railway (Recommended - Easiest)

Railway is the simplest option with automatic deployments from GitHub.

#### Setup Steps:

1. **Push your code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Deploy on Railway:**
   - Go to [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Railway will auto-detect Node.js

3. **Set Environment Variables:**
   In Railway dashboard, go to "Variables" tab and add:
   ```
   DISCORD_TOKEN=your-bot-token
   DISCORD_CLIENT_ID=your-client-id
   NEYNAR_API_KEY=your-neynar-key
   ZORA_API_KEY=your-zora-key
   APP_VERSION=1.0.0
   BRAND_NAME=InfoBot
   ```

4. **Configure Build & Start:**
   Railway should auto-detect, but verify:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`

5. **Auto-deploy on push:**
   - Every `git push` to main branch automatically deploys
   - Railway watches your repo and redeploys on changes

#### Pushing Updates:

```bash
git add .
git commit -m "Your update message"
git push origin main
```

Railway will automatically:
- Detect the push
- Build the new version
- Deploy it
- Restart the bot

---

### Option 2: Render

1. **Create account at [render.com](https://render.com)**

2. **Create new Web Service:**
   - Connect your GitHub repo
   - Select "Node" environment
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`

3. **Set Environment Variables** (same as Railway)

4. **Auto-deploy:** Enabled by default on git push

---

### Option 3: DigitalOcean App Platform

1. **Create account at [digitalocean.com](https://digitalocean.com)**

2. **Create App:**
   - Connect GitHub
   - Select Node.js
   - Build: `npm install && npm run build`
   - Run: `npm start`

3. **Set Environment Variables**

4. **Auto-deploy:** Enabled on git push

---

### Option 4: AWS EC2 / Lightsail

For more control, you can use AWS:

1. **Launch EC2 instance** (Ubuntu recommended)
2. **SSH into instance:**
   ```bash
   ssh -i your-key.pem ubuntu@your-instance-ip
   ```

3. **Install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

4. **Clone and setup:**
   ```bash
   git clone <your-repo-url>
   cd discord
   npm install
   npm run build
   ```

5. **Use PM2 for process management:**
   ```bash
   sudo npm install -g pm2
   pm2 start dist/index.js --name discord-bot
   pm2 save
   pm2 startup  # Follow instructions to enable on boot
   ```

6. **For updates:**
   ```bash
   git pull
   npm install
   npm run build
   pm2 restart discord-bot
   ```

---

### Option 5: Docker + Any Cloud Provider

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

CMD ["npm", "start"]
```

Then deploy to:
- **Railway:** Supports Dockerfiles automatically
- **Render:** Supports Dockerfiles
- **Fly.io:** `flyctl launch` (auto-detects Dockerfile)
- **Google Cloud Run:** `gcloud run deploy`
- **AWS ECS/Fargate:** Use Docker image

---

## Environment Variables Checklist

Make sure these are set in your cloud platform:

```
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id
DISCORD_GUILD_ID=optional-guild-id  # Leave empty for public bot (global commands)
NEYNAR_API_KEY=your-neynar-key
ZORA_API_KEY=your-zora-key
APP_VERSION=1.0.0
BRAND_NAME=InfoBot
BRAND_ICON_URL=optional-icon-url
```

**Note:** For public bots that others can add, leave `DISCORD_GUILD_ID` empty. This registers commands globally (takes up to 1 hour) instead of to a specific server (instant). Your code already supports both modes!

---

## Continuous Deployment Workflow

### Recommended: GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      # Railway auto-deploys on push, but you can add manual deploy step here if needed
```

---

## Monitoring & Logs

### Railway:
- View logs in dashboard
- Set up alerts for crashes

### PM2 (if using EC2):
```bash
pm2 logs discord-bot
pm2 monit
```

### Health Checks:
Consider adding a health check endpoint if using web services.

---

## Best Practices

1. **Use environment variables** - Never commit secrets
2. **Enable auto-deploy** - Push to main = deploy
3. **Monitor logs** - Set up alerts for errors
4. **Version control** - Tag releases: `git tag v1.0.0`
5. **Backup .env** - Keep a secure copy of environment variables
6. **Test before deploy** - Use a staging environment if possible

---

## Quick Start (Railway - Recommended)

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo>
git push -u origin main

# 2. Deploy on Railway
# - Go to railway.app
# - New Project → Deploy from GitHub
# - Select your repo
# - Add environment variables
# - Deploy!

# 3. Future updates
git add .
git commit -m "Update message"
git push origin main
# Railway auto-deploys! 🚀
```

## Making Your Bot Public

**Good news:** Your code already supports public bots! No changes needed.

### To Make Bot Public:

1. **Enable in Discord Portal:**
   - Go to [discord.com/developers/applications](https://discord.com/developers/applications)
   - Select your bot → Bot tab
   - Toggle "Public Bot" ON
   - Enable "MESSAGE CONTENT INTENT" if needed

2. **Update Railway Variables:**
   - Remove or leave empty `DISCORD_GUILD_ID`
   - This makes commands register globally (for all servers)

3. **Generate Invite Link:**
   - Discord Portal → OAuth2 → URL Generator
   - Select `bot` + `applications.commands`
   - Select permissions (Send Messages, Embed Links, etc.)
   - Share the generated URL

4. **Re-register Commands:**
   ```bash
   npm run register-commands
   ```
   Or Railway will auto-run this on deploy

**That's it!** Your bot is now public and others can add it to their servers.

See `PUBLIC_BOT_SETUP.md` for detailed instructions.

---

## Troubleshooting

**Bot not responding?**
- Check logs in cloud dashboard
- Verify DISCORD_TOKEN is correct
- Ensure bot is online in Discord

**Build fails?**
- Check Node.js version (needs 18+)
- Verify all dependencies in package.json
- Check build logs for specific errors

**Deployment slow?**
- Use build cache if available
- Consider using Docker for faster builds
- Check if dependencies are up to date

