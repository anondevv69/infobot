# InfoBot Stress Testing Guide

## Overview

This guide helps you understand and test the bot's capacity limits for:
- Number of Discord servers/guilds
- Number of concurrent requests
- Memory usage
- Response times
- API rate limits

## Estimated Capacity Limits

### Discord Bot Limits

| Metric | Limit | Notes |
|--------|-------|-------|
| **Max Guilds** | ~100 | Discord API limit: 100 guilds per bot |
| **Max Users** | ~10,000 | Estimated based on average guild size |
| **Rate Limit** | 50 req/sec | Discord API rate limit |
| **Concurrent Requests** | ~100 | Safe limit to avoid rate limiting |

### Telegram Bot Limits

| Metric | Limit | Notes |
|--------|-------|-------|
| **Max Chats** | Unlimited | No hard limit from Telegram |
| **Max Users** | Unlimited | No hard limit from Telegram |
| **Rate Limit** | 30 msg/sec/chat | Per chat, not global |
| **Concurrent Requests** | ~50 | Safe limit per chat |

### Memory Limits (Railway Free Tier)

| Metric | Limit | Notes |
|--------|-------|-------|
| **Total Memory** | 512 MB | Railway free tier limit |
| **Recommended Max** | 400 MB | 80% of limit (safe buffer) |
| **Warning Threshold** | 410 MB | 80% of limit |

### Performance Targets

| Metric | Target | Acceptable | Hard Limit |
|--------|--------|------------|------------|
| **Average Response Time** | < 2s | < 3s | < 5s |
| **Max Response Time** | < 3s | < 5s | < 10s |
| **Error Rate** | < 1% | < 5% | < 10% |

### API Rate Limits

| Service | Limit | Notes |
|---------|-------|-------|
| **Neynar API** | Varies | Check your plan |
| **Zora API** | ~100 req/min | Approximate |
| **DexScreener API** | ~300 req/min | Approximate |
| **Paragraph API** | Varies | Check your plan |
| **Basescan API** | ~5 req/sec | With API key |

## Running Stress Tests

### 1. Monitor Current Capacity

```bash
npm run monitor-capacity
```

This will:
- Monitor memory usage
- Track response times
- Show current capacity metrics
- Warn if approaching limits

### 2. Run Stress Test

```bash
npm run stress-test
```

This will:
- Simulate concurrent searches
- Test response times under load
- Monitor memory usage
- Track error rates

### 3. Manual Testing

#### Test Concurrent Requests

1. Open multiple Discord servers
2. Send `/search` commands simultaneously
3. Monitor response times
4. Check for rate limit errors

#### Test Memory Usage

1. Run many searches in sequence
2. Monitor memory with `npm run monitor-capacity`
3. Check if memory grows unbounded
4. Look for memory leaks

#### Test Guild Limits

1. Add bot to multiple servers (up to 100)
2. Test commands in each server
3. Monitor for any issues
4. Check if bot stops responding

## Monitoring in Production

### Key Metrics to Watch

1. **Memory Usage**
   - Should stay below 400 MB
   - Watch for memory leaks (gradual increase)
   - Restart if approaching 500 MB

2. **Response Times**
   - Average should be < 2 seconds
   - 95th percentile should be < 5 seconds
   - Timeouts indicate overload

3. **Error Rates**
   - Should be < 1% for successful requests
   - Rate limit errors indicate too many requests
   - API errors indicate external service issues

4. **Concurrent Requests**
   - Monitor active request count
   - Should not exceed 100 concurrent
   - Queue requests if needed

### Warning Signs

⚠️ **Approaching Limits:**
- Memory usage > 80% (400 MB)
- Response times > 3 seconds average
- Error rate > 5%
- Rate limit errors appearing

🚨 **Critical Issues:**
- Memory usage > 90% (460 MB)
- Response times > 5 seconds average
- Error rate > 10%
- Bot stops responding
- Out of memory errors

## Optimization Tips

### If Approaching Memory Limit

1. **Reduce Caching**
   - Clear in-memory caches more frequently
   - Use database for persistent storage
   - Limit cache sizes

2. **Optimize Code**
   - Remove unused imports
   - Clean up event listeners
   - Use streaming for large data

3. **Scale Up**
   - Upgrade Railway plan
   - Add more memory
   - Use multiple instances

### If Approaching Rate Limits

1. **Implement Queuing**
   - Queue requests instead of rejecting
   - Process requests in batches
   - Add delays between requests

2. **Cache Responses**
   - Cache API responses
   - Reduce duplicate requests
   - Use stale-while-revalidate pattern

3. **Optimize API Calls**
   - Batch multiple requests
   - Use parallel requests where possible
   - Remove unnecessary API calls

### If Response Times Are High

1. **Optimize Database Queries**
   - Add indexes
   - Use connection pooling
   - Cache frequent queries

2. **Parallelize Operations**
   - Run independent operations in parallel
   - Use Promise.all() for concurrent requests
   - Don't wait for non-critical operations

3. **Add Timeouts**
   - Set timeouts on all API calls
   - Fail fast on slow operations
   - Provide fallback responses

## Testing Checklist

- [ ] Bot handles 10 concurrent requests
- [ ] Bot handles 50 concurrent requests
- [ ] Bot handles 100 concurrent requests
- [ ] Memory stays below 400 MB under load
- [ ] Response times stay below 3 seconds
- [ ] Error rate stays below 5%
- [ ] Bot works in 10+ Discord servers
- [ ] Bot works in 50+ Discord servers
- [ ] Bot works in 100 Discord servers (max)
- [ ] Bot handles Telegram group spam
- [ ] Bot recovers from API errors
- [ ] Bot handles rate limit errors gracefully

## Next Steps

1. Run `npm run monitor-capacity` to baseline current usage
2. Run `npm run stress-test` to test limits
3. Monitor production metrics
4. Optimize based on findings
5. Scale up if needed

