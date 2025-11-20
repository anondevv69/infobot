# Discord 2000 Character Limit Error

## Error Message
```
DiscordAPIError[50035]: Invalid Form Body
data.content[BASE_TYPE_MAX_LENGTH]: Must be 2000 or fewer in length.
```

## What This Means

Discord has a **2000 character limit** for the `content` field in messages. When you use `interaction.reply({ content: "..." })` or `message.reply({ content: "..." })`, the content string must be 2000 characters or less.

## Why This Happens

The error occurs when the bot tries to send a message where the `content` field exceeds 2000 characters. This can happen in several places:

### 1. `/help` Command (`src/commands/help.ts`)
- **Issue**: Uses `content` field with a long help message
- **Current**: ~1,200+ characters (may grow as features are added)
- **Risk**: Medium - Could exceed limit if help text grows

### 2. `/clanker` Command (`src/commands/clanker.ts`)
- **Issue**: Uses `content` field with dynamic message
- **Current**: `Clanker results for \`${query}\` (${allTokens.length} total)${clankMessage}`
- **Risk**: High - If query is very long or token count is huge, could exceed limit
- **Example**: If query is 1000+ characters, this could easily exceed 2000

### 3. Error Messages
- **Issue**: Some error messages concatenate multiple strings
- **Risk**: Low - Most error messages are short

### 4. Long Content in Other Commands
- **Issue**: Any command using `content` field could potentially exceed limit
- **Risk**: Medium - Depends on user input length

## Discord Limits Reference

- **Message Content**: 2000 characters max
- **Embed Description**: 4096 characters max
- **Embed Field Value**: 1024 characters max
- **Embed Field Name**: 256 characters max
- **Embed Title**: 256 characters max
- **Embed Footer**: 2048 characters max

## Solution

**Use Embeds Instead of Content**

Discord embeds have much higher limits (4096 for description). For long messages:

1. **Convert to Embed**: Use `EmbedBuilder` instead of `content` field
2. **Split Long Messages**: If still too long, split into multiple embeds or pages
3. **Truncate with "..."**: If content must stay in `content` field, truncate at 1997 chars and add "..."

## Files That Need Fixing

### High Priority:
1. **`src/commands/help.ts`** - Convert to embed
2. **`src/commands/clanker.ts`** - Move content to embed description or truncate

### Medium Priority:
3. **`src/commands/search.ts`** - Check all `content` usages
4. **`src/commands/relay.ts`** - Check error messages
5. **`src/commands/casts.ts`** - Check error messages

## Quick Fix Pattern

**Before:**
```typescript
await interaction.reply({
  content: `Very long message that might exceed 2000 characters...`,
});
```

**After:**
```typescript
const embed = new EmbedBuilder()
  .setTitle("Title")
  .setDescription(`Very long message that can be up to 4096 characters...`)
  .setColor(0x5865f2);

await interaction.reply({
  embeds: [embed],
});
```

Or if you must use content:
```typescript
const message = `Very long message...`;
const truncated = message.length > 2000 
  ? message.substring(0, 1997) + "..." 
  : message;

await interaction.reply({
  content: truncated,
});
```

