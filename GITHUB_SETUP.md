# GitHub Setup Instructions

## Step 1: Create GitHub Repository

1. Go to [github.com](https://github.com) and sign in
2. Click the **"+"** icon in the top right → **"New repository"**
3. Fill in:
   - **Repository name:** `discord-bot` (or your preferred name)
   - **Description:** "Discord bot for Zora, Clanker, and Farcaster lookups"
   - **Visibility:** Choose Public or Private
   - **DO NOT** check "Initialize with README" (you already have files)
4. Click **"Create repository"**

## Step 2: Connect and Push

After creating the repo, GitHub will show you commands. Use these:

```bash
# Add the remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/discord-bot.git

# Push to GitHub
git push -u origin main
```

## Alternative: Using SSH

If you prefer SSH (recommended for frequent pushes):

```bash
# Add SSH remote (replace YOUR_USERNAME)
git remote add origin git@github.com:YOUR_USERNAME/discord-bot.git

# Push
git push -u origin main
```

## What's Already Done ✅

- ✅ All files committed locally
- ✅ .gitignore configured (excludes .env, node_modules, dist)
- ✅ Ready to push!

## Next Steps After Pushing

1. **Set up Railway deployment** (see DEPLOYMENT.md)
2. **Add environment variables** in Railway dashboard
3. **Auto-deploy on every push!** 🚀

