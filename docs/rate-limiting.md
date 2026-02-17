# Rate Limiting

Cachyer provides a `RateLimitService` with multiple algorithms for controlling request rates.

## Basic Setup

```typescript
import { createRedisAdapter, createRateLimitService } from "cachyer";

const adapter = createRedisAdapter({ client: redis });
const rateLimiter = createRateLimitService(adapter, {
  defaultConfig: { maxRequests: 100, windowSeconds: 60 },
  endpoints: {
    "api:create": { maxRequests: 10, windowSeconds: 60 },
    "api:search": { maxRequests: 30, windowSeconds: 60 },
  },
});
```

## Fixed Window

```typescript
const result = await rateLimiter.check("user123", "api:create");

if (!result.allowed) {
  console.log(`Rate limited. Retry after ${result.retryAfter}s`);
}

// HTTP headers included for API responses
// result.headers -> { "X-RateLimit-Limit", "X-RateLimit-Remaining", ... }
```

## Sliding Window

More accurate than fixed window — avoids the burst problem at window boundaries:

```typescript
const result = await rateLimiter.checkSlidingWindow("user123", "api:create");
```

## IP-Based

```typescript
const result = await rateLimiter.checkIP("192.168.1.1", {
  maxRequests: 100,
  windowSeconds: 60,
});
```

## Advanced Lua Scripts

Four additional strategies implemented as atomic Lua scripts for high-concurrency scenarios.

### Token Bucket

Allows bursts up to a maximum while refilling tokens at a steady rate.

```typescript
import { tokenBucketRateLimitScript, buildTokenBucketParams } from "cachyer";

const params = buildTokenBucketParams(
  "ratelimit:api:user-42",
  100,  // bucket size
  10,   // refill rate (tokens/second)
  1,    // tokens per request
);

const result = await adapter.executeScript(
  tokenBucketRateLimitScript,
  params.keys,
  params.args,
);
// { allowed: boolean, tokens: number, resetAt: number }
```

### Multi-Tier

Check multiple rate limits atomically. All tiers must pass.

```typescript
import { multiTierRateLimitScript, buildMultiTierParams } from "cachyer";

const params = buildMultiTierParams("user-42", [
  { name: "per-second", maxRequests: 10, windowSeconds: 1 },
  { name: "per-minute", maxRequests: 100, windowSeconds: 60 },
  { name: "per-hour", maxRequests: 1000, windowSeconds: 3600 },
]);

const result = await adapter.executeScript(
  multiTierRateLimitScript,
  params.keys,
  params.args,
);
// { allowed: boolean, limits: Array<{ tier, count, max, ttl, allowed }> }
```

### Quota-Based

Daily or monthly quotas that reset at specific times.

```typescript
import {
  quotaRateLimitScript,
  buildQuotaParams,
  getNextDailyReset,
} from "cachyer";

const params = buildQuotaParams(
  "quota:api:user-42",
  1000,               // total quota
  getNextDailyReset(), // reset timestamp
  1,                   // cost per request
);

const result = await adapter.executeScript(
  quotaRateLimitScript,
  params.keys,
  params.args,
);
// { allowed, used, quota, remaining, resetAt }
```

### Enhanced Sliding Window

Sorted-set-based sliding window, available as a standalone script:

```typescript
import { enhancedSlidingWindowScript, buildSlidingWindowParams } from "cachyer";

const params = buildSlidingWindowParams(
  "ratelimit:sliding:user-42",
  100,    // max requests
  60000,  // window in ms
);

const result = await adapter.executeScript(
  enhancedSlidingWindowScript,
  params.keys,
  params.args,
);
// { allowed, count, resetAt }
```

### Convenience Object

All scripts under a single export:

```typescript
import { RateLimitScripts } from "cachyer";

RateLimitScripts.tokenBucket;
RateLimitScripts.slidingWindow;
RateLimitScripts.multiTier;
RateLimitScripts.quota;
```
