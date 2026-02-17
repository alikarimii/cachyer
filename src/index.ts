// =============================================
// CACHYER - MAIN INDEX
// =============================================
// A flexible, type-safe caching layer with support
// for multiple database adapters
//
// USAGE:
//   const cache = new Cachyer({ adapter: redisAdapter })
//
//   // Core operations (with key prefixing)
//   await cache.get('key')
//   await cache.zadd('leaderboard', [...])
//
//   // Advanced features (direct adapter access)
//   await cache.adapter.xadd('logs', '*', data)
//   await cache.adapter.bfAdd('bloom', 'item')
//
// See README.md and ARCHITECTURE.md for details.
// =============================================

// Core
export { Cachyer, createCachyer } from "./core/cachyer";
export type { CachyerConfig } from "./core/cachyer";

// Types
export * from "./types";

// Adapters
export { createRedisAdapter, RedisAdapter } from "./adapters/redis";
export type { RedisAdapterConfig } from "./adapters/redis";

export { createMemoryAdapter, MemoryAdapter } from "./adapters/memory";
export type { MemoryAdapterConfig } from "./adapters/memory";

// Schemas
export * from "./schemas";

// Services
export { RateLimitService, createRateLimitService } from "./services";
export type { RateLimitHeaders, RateLimitServiceConfig } from "./services";
export { LockService, createLockService } from "./services";
export type { LockOptions, LockResult, LockServiceConfig } from "./services";
export {
  tokenBucketRateLimitScript,
  multiTierRateLimitScript,
  quotaRateLimitScript,
  buildTokenBucketParams,
  buildMultiTierParams,
  buildQuotaParams,
  getNextDailyReset,
  getNextMonthlyReset,
  RateLimitScripts,
} from "./services";

// Utils
export * from "./utils";

// =============================================
// CONVENIENCE FACTORIES
// =============================================

import { createMemoryAdapter } from "./adapters/memory";
import { createRedisAdapter } from "./adapters/redis";
import { Cachyer } from "./core/cachyer";

/**
 * Create a Cachyer instance with Redis
 * @param options Configuration options for Redis connection and Cachyer
 * @return Cachyer instance
 * @param options.keyPrefix Optional key prefix
 * @param options.defaultTtl Optional default TTL for cache entries
 * @param options.connectionOptions check ioredis documentation for Redis constructor options
 */
export function createRedisCachyer(options?: {
  keyPrefix?: string;
  defaultTtl?: number;
  connectionOptions?: any;
}): Cachyer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Redis } = require("ioredis") as typeof import("ioredis");
  return new Cachyer({
    adapter: createRedisAdapter({
      client: new Redis(options?.connectionOptions),
    }),
    keyPrefix: options?.keyPrefix,
    defaultTtl: options?.defaultTtl,
  });
}

/**
 * Create a Cachyer instance with in-memory storage (for testing/development)
 */
export function createMemoryCachyer(options?: {
  keyPrefix?: string;
  defaultTtl?: number;
  maxEntries?: number;
}): Cachyer {
  return new Cachyer({
    adapter: createMemoryAdapter({ maxEntries: options?.maxEntries }),
    keyPrefix: options?.keyPrefix,
    defaultTtl: options?.defaultTtl,
  });
}


