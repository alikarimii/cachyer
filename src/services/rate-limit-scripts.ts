// =============================================
// CACHYER - ADVANCED RATE LIMIT SCRIPTS
// =============================================
// Atomic rate limiting strategies using Lua scripts
// =============================================

import { defineScript } from "../types/operation.types";

// =============================================
// TOKEN BUCKET
// =============================================

export const tokenBucketRateLimitScript = defineScript({
  language: "lua",
  script: `
    local key = KEYS[1]
    local bucketSize = tonumber(ARGV[1])
    local refillRate = tonumber(ARGV[2])
    local tokensRequested = tonumber(ARGV[3])
    local now = tonumber(ARGV[4])

    local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
    local tokens = tonumber(bucket[1])
    local lastRefill = tonumber(bucket[2])

    if not tokens then
      tokens = bucketSize
      lastRefill = now
    end

    local elapsed = (now - lastRefill) / 1000
    local tokensToAdd = elapsed * refillRate
    tokens = math.min(bucketSize, tokens + tokensToAdd)

    local allowed = tokens >= tokensRequested

    if allowed then
      tokens = tokens - tokensRequested
    end

    redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
    redis.call('EXPIRE', key, math.ceil(bucketSize / refillRate) + 1)

    local tokensNeeded = bucketSize - tokens
    local resetAt = now + (tokensNeeded / refillRate) * 1000

    return { allowed and 1 or 0, tokens, resetAt }
  `,
  keys: ["rateLimitKey"] as const,
  args: ["bucketSize", "refillRate", "tokensRequested", "now"] as const,
  description: "Token bucket rate limiter",
  parseResult: (result) => {
    const [allowed, tokens, resetAt] = result as [number, number, number];
    return { allowed: allowed === 1, tokens, resetAt };
  },
});

export function buildTokenBucketParams(
  key: string,
  bucketSize: number,
  refillRate: number,
  tokensRequested: number = 1,
): { keys: string[]; args: (string | number)[] } {
  return {
    keys: [key],
    args: [bucketSize, refillRate, tokensRequested, Date.now()],
  };
}

// =============================================
// SLIDING WINDOW (ENHANCED)
// =============================================

export const enhancedSlidingWindowScript = defineScript({
  language: "lua",
  script: `
    local key = KEYS[1]
    local maxRequests = tonumber(ARGV[1])
    local windowMs = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local requestId = ARGV[4]

    local windowStart = now - windowMs
    redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

    local count = redis.call('ZCARD', key)
    local allowed = count < maxRequests

    if allowed then
      redis.call('ZADD', key, now, requestId)
      count = count + 1
    end

    redis.call('PEXPIRE', key, windowMs)

    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local resetAt = now + windowMs
    if #oldest > 0 then
      resetAt = tonumber(oldest[2]) + windowMs
    end

    return { allowed and 1 or 0, count, resetAt }
  `,
  keys: ["rateLimitKey"] as const,
  args: ["maxRequests", "windowMs", "now", "requestId"] as const,
  description: "Sliding window rate limit with sorted set",
  parseResult: (result) => {
    const [allowed, count, resetAt] = result as [number, number, number];
    return { allowed: allowed === 1, count, resetAt };
  },
});

export function buildSlidingWindowParams(
  key: string,
  maxRequests: number,
  windowMs: number,
  requestId?: string,
): { keys: string[]; args: (string | number)[] } {
  return {
    keys: [key],
    args: [
      maxRequests,
      windowMs,
      Date.now(),
      requestId ??
        `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    ],
  };
}

// =============================================
// MULTI-TIER
// =============================================

export const multiTierRateLimitScript = defineScript({
  language: "lua",
  script: `
    local numTiers = tonumber(ARGV[1])
    local allowed = true
    local results = {}

    for i = 0, numTiers - 1 do
      local keyIdx = i + 1
      local argBase = 2 + i * 2

      local key = KEYS[keyIdx]
      local maxRequests = tonumber(ARGV[argBase])
      local windowSeconds = tonumber(ARGV[argBase + 1])

      local current = tonumber(redis.call('GET', key) or 0)
      local tierAllowed = current < maxRequests

      if tierAllowed then
        current = redis.call('INCR', key)
        if current == 1 then
          redis.call('EXPIRE', key, windowSeconds)
        end
      else
        allowed = false
      end

      local ttl = redis.call('TTL', key)
      if ttl < 0 then ttl = windowSeconds end

      table.insert(results, { current, maxRequests, ttl, tierAllowed and 1 or 0 })
    end

    return { allowed and 1 or 0, results }
  `,
  keys: ["...tierKeys"] as const,
  args: ["numTiers", "...maxRequestsAndWindowPairs"] as const,
  description: "Multi-tier rate limiting (per-second, per-minute, etc.)",
  parseResult: (result) => {
    const [allowed, tiers] = result as [
      number,
      Array<[number, number, number, number]>,
    ];
    return {
      allowed: allowed === 1,
      limits: tiers.map(([count, max, ttl, tierAllowed], i) => ({
        tier: i,
        count,
        max,
        ttl,
        allowed: tierAllowed === 1,
      })),
    };
  },
});

export function buildMultiTierParams(
  userId: string,
  tiers: Array<{ name: string; maxRequests: number; windowSeconds: number }>,
): { keys: string[]; args: (string | number)[] } {
  const keys = tiers.map((t) => `ratelimit:${t.name}:${userId}`);
  const args: (string | number)[] = [tiers.length];

  for (const tier of tiers) {
    args.push(tier.maxRequests, tier.windowSeconds);
  }

  return { keys, args };
}

// =============================================
// QUOTA
// =============================================

export const quotaRateLimitScript = defineScript({
  language: "lua",
  script: `
    local key = KEYS[1]
    local quota = tonumber(ARGV[1])
    local resetTime = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local cost = tonumber(ARGV[4])

    local lastReset = tonumber(redis.call('HGET', key, 'lastReset') or 0)

    if now >= resetTime and lastReset < resetTime then
      redis.call('HMSET', key, 'used', 0, 'lastReset', now)
    end

    local used = tonumber(redis.call('HGET', key, 'used') or 0)
    local remaining = quota - used
    local allowed = remaining >= cost

    if allowed then
      used = redis.call('HINCRBY', key, 'used', cost)
    end

    local nextReset = resetTime
    if now >= resetTime then
      local secondsInDay = 86400
      nextReset = resetTime + math.ceil((now - resetTime) / secondsInDay) * secondsInDay
    end

    redis.call('EXPIREAT', key, nextReset + 3600)

    return { allowed and 1 or 0, used, quota, nextReset }
  `,
  keys: ["quotaKey"] as const,
  args: ["quota", "resetTime", "now", "cost"] as const,
  description: "Quota-based rate limiting with periodic reset",
  parseResult: (result) => {
    const [allowed, used, quota, resetAt] = result as [
      number,
      number,
      number,
      number,
    ];
    return {
      allowed: allowed === 1,
      used,
      quota,
      remaining: quota - used,
      resetAt,
    };
  },
});

export function buildQuotaParams(
  key: string,
  quota: number,
  resetTime: number,
  cost: number = 1,
): { keys: string[]; args: (string | number)[] } {
  return {
    keys: [key],
    args: [quota, resetTime, Date.now(), cost],
  };
}

// =============================================
// RESET TIME HELPERS
// =============================================

export function getNextDailyReset(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  return tomorrow.getTime();
}

export function getNextMonthlyReset(): number {
  const now = new Date();
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0),
  );
  return nextMonth.getTime();
}

// =============================================
// COMBINED EXPORT
// =============================================

export const RateLimitScripts = {
  tokenBucket: tokenBucketRateLimitScript,
  slidingWindow: enhancedSlidingWindowScript,
  multiTier: multiTierRateLimitScript,
  quota: quotaRateLimitScript,
} as const;
