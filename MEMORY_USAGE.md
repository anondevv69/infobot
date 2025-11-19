# Bot Memory Usage Breakdown

## Current Memory: 37.43 MB

### In-Memory Data Structures

#### 1. **User Tracking** (`src/utils/botStats.ts`)
- `uniqueUsers`: Set<string> - Discord user IDs who have used commands
  - Current: 14 unique Discord users
  - Size: ~14 strings × ~20 bytes = ~280 bytes
  
- `uniqueTelegramUsers`: Set<number> - Telegram user IDs who have used commands
  - Current: Unknown count
  - Size: ~8 bytes per number

#### 2. **Search Statistics** (`src/utils/botStats.ts`)
- `totalSearches`: { count: number } - Total search counter
  - Current: 3 searches
  - Size: ~8 bytes

#### 3. **Response Time Tracking** (`src/utils/botStats.ts`)
- `responseTimes`: number[] - Last 1000 response times (milliseconds)
  - Max size: 1000 numbers × 8 bytes = ~8 KB
  - Auto-trims: Oldest removed when > 1000 entries
  - Current: Likely < 100 entries (3 searches)

#### 4. **Telegram Chat Tracking** (`src/utils/botStats.ts` + `src/platforms/telegram/index.ts`)
- `telegramChatMembers`: Map<number, number> - chatId → memberCount
  - Current: 151 total members across chats
  - Size: ~16 bytes per entry (chatId + memberCount)
  
- `seenTelegramChats`: Set<number> - Chat IDs we've seen
  - Current: 0 (showing 0 in stats, but tracking members)
  - Size: ~8 bytes per chat ID

#### 5. **Pagination Cache** (`src/handlers/pagination.ts`)
- `paginationStore`: Map<string, EmbedBuilder> - Stores embeds for pagination buttons
  - Auto-expires: Deletes after 5 minutes
  - Size: Varies (Discord embed objects are ~1-5 KB each)
  - Current: Likely empty or very few (expires quickly)

#### 6. **Copy Button Store** (`src/utils/copyStore.ts`)
- `STORE`: Map<string, CopyPayload> - Stores copy values for copy buttons
  - Auto-expires: Deletes after 1 hour
  - Size: ~100-500 bytes per entry
  - Current: Likely empty or very few (expires after 1 hour)

#### 7. **Discord.js Client Cache** (Discord.js library)
- `client.guilds.cache` - Discord servers cache
  - Current: 5 servers
  - Size: ~5-10 KB per server (includes server metadata)
  
- `client.channels.cache` - Channel cache
- `client.users.cache` - User cache
- Other internal Discord.js caches

#### 8. **Node.js Runtime**
- JavaScript heap
- V8 engine overhead
- Module cache
- Event loop data structures

## Memory Breakdown Estimate

| Component | Estimated Size |
|-----------|---------------|
| User tracking (Sets) | ~1 KB |
| Response times array | ~1 KB |
| Telegram chat data | ~2 KB |
| Pagination cache | ~0-5 KB (varies) |
| Copy store | ~0-1 KB (varies) |
| Discord.js caches | ~50-100 KB |
| Node.js runtime | ~5-10 MB |
| **Total Heap Used** | **~37.43 MB** |

## Memory Optimization Features

✅ **Response times**: Limited to 1000 entries (auto-trims oldest)
✅ **Pagination cache**: Auto-expires after 5 minutes
✅ **Copy store**: Auto-expires after 1 hour
✅ **Telegram chats**: Stored in database (persistent, not just memory)

## Potential Memory Growth

- **User tracking**: Grows with unique users (unbounded, but small per user)
- **Response times**: Capped at 1000 entries
- **Pagination cache**: Auto-expires, won't grow indefinitely
- **Copy store**: Auto-expires, won't grow indefinitely
- **Discord.js cache**: Grows with servers/channels/users, but Discord.js manages this

## Notes

- Most data is small (Sets, Maps, arrays of primitives)
- Largest components are Discord.js caches and Node.js runtime
- All temporary caches have expiration mechanisms
- Database is used for persistent storage (Telegram chats, Discord guilds)

