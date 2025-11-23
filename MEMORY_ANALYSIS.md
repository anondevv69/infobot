# Memory Storage Analysis

## In-Memory Data Structures

### 1. **User Tracking** (`src/utils/botStats.ts`)
```typescript
const uniqueUsers = new Set<string>();           // Discord user IDs
const uniqueTelegramUsers = new Set<number>();   // Telegram user IDs
```
- **Purpose**: Track unique users who have used commands
- **Growth**: Unbounded (grows with each new user)
- **Size**: ~20 bytes per Discord user ID, ~8 bytes per Telegram user ID
- **Risk**: Could grow large over time (1000 users = ~20 KB)
- **Recommendation**: Add cleanup for old/inactive users

### 2. **Search Statistics** (`src/utils/botStats.ts`)
```typescript
const totalSearches = { count: 0 };  // Simple counter
```
- **Purpose**: Track total number of searches
- **Size**: ~8 bytes (single number)
- **Risk**: Minimal

### 3. **Response Time Tracking** (`src/utils/botStats.ts`)
```typescript
const responseTimes: number[] = [];  // Capped at 1000 entries
const MAX_RESPONSE_TIMES = 1000;
```
- **Purpose**: Track response times for average calculation
- **Growth**: Capped at 1000 entries (auto-trims oldest)
- **Size**: ~8 KB max (1000 × 8 bytes)
- **Risk**: Low (has cleanup mechanism)
- **Cleanup**: Runs every hour, keeps only last 1000

### 4. **Pagination Cache** (`src/handlers/pagination.ts`)
```typescript
const paginationStore = new Map<string, EmbedBuilder>();
```
- **Purpose**: Store embeds for pagination button interactions
- **Growth**: Temporary (auto-expires after 5 minutes)
- **Size**: ~1-5 KB per embed (Discord embed objects)
- **Risk**: Low (auto-expires)
- **Cleanup**: Each entry deleted after 5 minutes

### 5. **Copy Button Store** (`src/utils/copyStore.ts`)
```typescript
const STORE = new Map<string, CopyPayload>();
```
- **Purpose**: Store copy values for copy-to-clipboard buttons
- **Growth**: Temporary (auto-expires after 1 hour)
- **Size**: ~100-500 bytes per entry
- **Risk**: Low (auto-expires)
- **Cleanup**: Sweeps expired entries on each access

### 6. **Telegram Chat Tracking** (`src/platforms/telegram/index.ts`)
```typescript
const seenTelegramChats = new Set<number>();
```
- **Purpose**: Fast lookup to prevent duplicate "NEW TELEGRAM GROUP" logs
- **Growth**: Capped (cleared every 24 hours)
- **Size**: ~8 bytes per chat ID
- **Risk**: Low (periodic cleanup)
- **Cleanup**: Cleared every 24 hours

### 7. **Telegram Chat Count** (`src/utils/botStats.ts`)
```typescript
let telegramChatCount = 0;  // Simple number
```
- **Purpose**: Track number of Telegram chats
- **Size**: ~8 bytes
- **Risk**: Minimal

### 8. **Discord.js Client Caches** (Discord.js library)
```typescript
client.guilds.cache    // Discord servers
client.channels.cache  // Channels
client.users.cache     // Users
```
- **Purpose**: Discord.js internal caching
- **Growth**: Grows with servers/channels/users
- **Size**: ~5-10 KB per server, ~1-2 KB per channel/user
- **Risk**: Managed by Discord.js (has limits)
- **Note**: Discord.js manages these caches automatically

### 9. **Logger Rate Limiting** (`src/utils/logger.ts`)
```typescript
private rateLimitDelay = 0;  // Number (timestamp)
```
- **Purpose**: Rate limit webhook calls
- **Size**: ~8 bytes
- **Risk**: Minimal

## Memory Usage Breakdown

| Component | Current Size | Max Size | Growth Pattern |
|-----------|-------------|----------|----------------|
| User Tracking (Sets) | ~1-5 KB | Unbounded | Grows with unique users |
| Response Times Array | ~1-8 KB | 8 KB (capped) | Capped at 1000 entries |
| Pagination Cache | ~0-50 KB | Varies | Auto-expires (5 min) |
| Copy Store | ~0-10 KB | Varies | Auto-expires (1 hour) |
| Telegram Chat Set | ~0-1 KB | Varies | Cleared every 24h |
| Discord.js Caches | ~50-500 KB | Varies | Managed by library |
| Node.js Runtime | ~5-10 MB | Fixed | Base runtime |
| **Total Estimated** | **~37-50 MB** | **~100-200 MB** | Depends on usage |

## Potential Memory Issues

### ⚠️ **High Risk: Unbounded Growth**

1. **User Tracking Sets** (`uniqueUsers`, `uniqueTelegramUsers`)
   - **Problem**: Grow unbounded with each new user
   - **Impact**: Could reach 1-10 MB with 10,000+ users
   - **Solution**: Add cleanup for inactive users (e.g., users not seen in 30 days)

### ✅ **Low Risk: Capped or Auto-Expiring**

2. **Response Times Array**
   - ✅ Capped at 1000 entries
   - ✅ Auto-trims oldest entries
   - ✅ Cleanup runs every hour

3. **Pagination Cache**
   - ✅ Auto-expires after 5 minutes
   - ✅ Each entry has timeout cleanup

4. **Copy Store**
   - ✅ Auto-expires after 1 hour
   - ✅ Sweeps expired entries on access

5. **Telegram Chat Set**
   - ✅ Cleared every 24 hours
   - ✅ Small size (~8 bytes per chat)

## Recommendations

### 1. **Add User Tracking Cleanup**
```typescript
// Clean up users not seen in 30 days
setInterval(() => {
  // Would need to track last seen timestamp
  // Remove users not seen in 30 days
}, 24 * 60 * 60 * 1000); // Daily
```

### 2. **Monitor Memory Growth**
- Use `npm run monitor-capacity` to track memory usage
- Set alerts if memory exceeds 400 MB (80% of 512 MB limit)
- Restart bot if memory exceeds 450 MB

### 3. **Optimize Discord.js Cache**
- Discord.js manages its own cache limits
- Can configure cache sizes if needed
- Current defaults are reasonable

### 4. **Database for Persistent Data**
- ✅ Telegram chats stored in database (not just memory)
- ✅ Discord guilds stored in database (not just memory)
- ✅ Member counts stored in database (not just memory)

## Current Memory Footprint

**Estimated Current Usage: ~37-50 MB**
- Base Node.js runtime: ~5-10 MB
- Discord.js caches: ~50-500 KB
- Application data: ~1-5 KB
- **Total: ~37-50 MB** (well below 512 MB limit)

**Safe Operating Range: < 400 MB** (80% of 512 MB limit)

