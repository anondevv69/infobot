# Local Testing & GitHub Workflow

## Local Testing

### 1. Test Locally Before Pushing

```bash
# Make sure you're in the project directory
cd C:\Users\Administrator\Desktop\discord

# Install dependencies (if not already done)
npm install

# Build the project
npm run build

# Test locally
npm run dev
```

The bot will start and connect to Discord. You can test commands and features in your Discord server.

### 2. Stop the Bot
Press `Ctrl+C` in the terminal to stop the local bot.

---

## GitHub Workflow

### Initial Setup (First Time Only)

1. **Initialize Git (if not already done):**
   ```bash
   git init
   ```

2. **Create .gitignore (if it doesn't exist):**
   Make sure `.gitignore` includes:
   ```
   node_modules/
   dist/
   .env
   *.log
   .DS_Store
   ```

3. **Create GitHub Repository:**
   - Go to [github.com](https://github.com)
   - Click "New repository"
   - Name it (e.g., "discord-bot")
   - Don't initialize with README (you already have files)
   - Copy the repository URL

4. **Connect Local to GitHub:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   ```

5. **First Commit & Push:**
   ```bash
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git push -u origin main
   ```

---

## Daily Workflow: Test → Push → Deploy

### Step 1: Make Changes Locally
Edit your code files as needed.

### Step 2: Test Locally
```bash
# Build to check for errors
npm run build

# Run locally to test
npm run dev
```

Test your changes in Discord to make sure everything works.

### Step 3: Commit & Push
```bash
# Check what changed
git status

# Add all changes
git add .

# Commit with descriptive message
git commit -m "Add market cap to clanker tokens"

# Push to GitHub
git push origin main
```

### Step 4: Auto-Deploy (if using Railway/Render)
- Railway/Render automatically detects the push
- Builds and deploys the new version
- Bot restarts with new code
- Check logs in cloud dashboard to verify

---

## Branch Strategy (Optional but Recommended)

For safer deployments, use branches:

```bash
# Create a feature branch
git checkout -b feature/new-feature

# Make changes and test
npm run build
npm run dev

# Commit to branch
git add .
git commit -m "Add new feature"
git push origin feature/new-feature

# Create Pull Request on GitHub
# Review and test, then merge to main
# Main branch auto-deploys
```

---

## Testing Checklist

Before pushing to main:
- [ ] Code compiles: `npm run build` succeeds
- [ ] Bot starts: `npm run dev` runs without errors
- [ ] Test the feature you changed
- [ ] Check Discord logs for any errors
- [ ] Verify environment variables are set (but not committed!)

---

## Common Issues

**"Module not found" errors:**
```bash
npm install
```

**TypeScript errors:**
```bash
npm run build
# Fix any TypeScript errors shown
```

**Git push fails:**
```bash
# Make sure you're authenticated
# Or use SSH instead of HTTPS
git remote set-url origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
```

---

## Environment Variables

**Never commit `.env` file!**

Your `.gitignore` should include:
```
.env
.env.local
```

For cloud deployment, set environment variables in:
- Railway: Dashboard → Variables tab
- Render: Dashboard → Environment tab
- etc.

---

## Quick Reference

```bash
# Test locally
npm run build && npm run dev

# Push updates
git add .
git commit -m "Your message"
git push origin main

# Check status
git status
git log --oneline
```

