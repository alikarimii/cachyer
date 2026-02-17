// =============================================
// CACHYER - RATE LIMIT SERVICE
// =============================================
// High-level service for API rate limiting
// =============================================

import type { CacheAdapter } from "../types/adapter.types";
import { defineScript } from "../types/operation.types";

// =============================================
// TYPES
// =============================================

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface RateLimitHeaders {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
  "Retry-After"?: string;
}

export interface RateLimitServiceConfig {
  keyPrefix?: string;
  defaultConfig?: RateLimitConfig;
  endpoints?: Record<string, RateLimitConfig>;
}

// =============================================
// DEFAULT CONFIGS
// =============================================

export const DefaultRateLimitConfigs: Record<string, RateLimitConfig> = {
  default: { maxRequests: 100, windowSeconds: 60 },
  strict: { maxRequests: 10, windowSeconds: 60 },
  relaxed: { maxRequests: 1000, windowSeconds: 60 },
  "post:create": { maxRequests: 10, windowSeconds: 60 },
  comment: { maxRequests: 30, windowSeconds: 60 },
  like: { maxRequests: 60, windowSeconds: 60 },
  follow: { maxRequests: 30, windowSeconds: 60 },
  message: { maxRequests: 20, windowSeconds: 60 },
  search: { maxRequests: 30, windowSeconds: 60 },
  upload: { maxRequests: 10, windowSeconds: 300 },
  auth: { maxRequests: 5, windowSeconds: 300 },
};

// =============================================
// LUA SCRIPTS
// =============================================

export const rateLimitCheckScript = defineScript({
  script: `
    local key = KEYS[1]
    local maxRequests = tonumber(ARGV[1])
    local windowSeconds = tonumber(ARGV[2])
    
    local current = tonumber(redis.call('GET', key) or 0)
    local allowed = current < maxRequests
    
    if allowed then
      current = redis.call('INCR', key)
      if current == 1 then
        redis.call('EXPIRE', key, windowSeconds)
      end
    end
    
    local ttl = redis.call('TTL', key)
    if ttl < 0 then ttl = windowSeconds end
    
    return { current, ttl, allowed and 1 or 0 }
  `,
  language: "lua",
  keys: ["rateLimitKey"] as const,
  args: ["maxRequests", "windowSeconds"] as const,
  description: "Check and increment rate limit atomically",
  parseResult: (result) => {
    const [count, ttl, allowed] = result as [number, number, number];
    return { count, ttl, allowed: allowed === 1 };
  },
});

export const slidingWindowRateLimitScript = defineScript({
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
  language: "lua",
  keys: ["rateLimitKey"] as const,
  args: ["maxRequests", "windowMs", "now", "requestId"] as const,
  description: "Sliding window rate limit",
  parseResult: (result) => {
    const [allowed, count, resetAt] = result as [number, number, number];
    return { allowed: allowed === 1, count, resetAt };
  },
});

// =============================================
// RATE LIMIT SERVICE CLASS
// =============================================

export class RateLimitService {
  private readonly adapter: CacheAdapter;
  private readonly config: Required<RateLimitServiceConfig>;

  constructor(adapter: CacheAdapter, config?: RateLimitServiceConfig) {
    this.adapter = adapter;
    this.config = {
      keyPrefix: config?.keyPrefix ?? "ratelimit",
      defaultConfig: config?.defaultConfig ?? DefaultRateLimitConfigs.default!,
      endpoints: config?.endpoints ?? {},
    };
  }

  async check(
    identifier: string,
    endpoint: string,
  ): Promise<RateLimitResult & { headers: RateLimitHeaders }> {
    const cfg = this.getConfig(endpoint);
    const key = this.buildKey(identifier, endpoint);

    if (typeof this.adapter.executeScript === "function") {
      return this.checkWithScript(key, cfg);
    }

    return this.checkBasic(key, cfg);
  }

  private async checkWithScript(
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult & { headers: RateLimitHeaders }> {
    const result = await this.adapter.executeScript!(
      rateLimitCheckScript,
      [key],
      [config.maxRequests, config.windowSeconds],
    );

    const rateLimitResult: RateLimitResult = {
      allowed: result.allowed,
      remaining: Math.max(0, config.maxRequests - result.count),
      resetAt: Date.now() + result.ttl * 1000,
      retryAfter: result.allowed ? undefined : result.ttl,
    };

    return {
      ...rateLimitResult,
      headers: this.generateHeaders(rateLimitResult, config.maxRequests),
    };
  }

  private async checkBasic(
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult & { headers: RateLimitHeaders }> {
    // Atomic: INCR first, then check against limit
    const count = await this.adapter.incr(key);

    if (count === 1) {
      await this.adapter.expire(key, config.windowSeconds);
    }

    const allowed = count <= config.maxRequests;

    const ttl = await this.adapter.ttl(key);
    const effectiveTtl = ttl > 0 ? ttl : config.windowSeconds;

    const result: RateLimitResult = {
      allowed,
      remaining: Math.max(0, config.maxRequests - count),
      resetAt: Date.now() + effectiveTtl * 1000,
      retryAfter: allowed ? undefined : effectiveTtl,
    };

    return {
      ...result,
      headers: this.generateHeaders(result, config.maxRequests),
    };
  }

  async checkSlidingWindow(
    identifier: string,
    endpoint: string,
    config?: RateLimitConfig,
  ): Promise<RateLimitResult & { headers: RateLimitHeaders }> {
    const cfg = config ?? this.getConfig(endpoint);
    const key = `${this.config.keyPrefix}:sliding:${endpoint}:${identifier}`;

    if (typeof this.adapter.executeScript !== "function") {
      return this.check(identifier, endpoint);
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await this.adapter.executeScript(
      slidingWindowRateLimitScript,
      [key],
      [cfg.maxRequests, cfg.windowSeconds * 1000, Date.now(), requestId],
    );

    const rateLimitResult: RateLimitResult = {
      allowed: result.allowed,
      remaining: Math.max(0, cfg.maxRequests - result.count),
      resetAt: result.resetAt,
      retryAfter: result.allowed
        ? undefined
        : Math.ceil((result.resetAt - Date.now()) / 1000),
    };

    return {
      ...rateLimitResult,
      headers: this.generateHeaders(rateLimitResult, cfg.maxRequests),
    };
  }

  async checkIP(
    ipAddress: string,
    config?: RateLimitConfig,
  ): Promise<RateLimitResult & { headers: RateLimitHeaders }> {
    const cfg = config ?? { maxRequests: 100, windowSeconds: 60 };
    const key = `${this.config.keyPrefix}:ip:${ipAddress}`;
    return this.checkBasic(key, cfg);
  }

  async reset(identifier: string, endpoint: string): Promise<void> {
    const key = this.buildKey(identifier, endpoint);
    await this.adapter.del(key);
  }

  async getStatus(
    identifier: string,
    endpoint: string,
  ): Promise<{ count: number; ttl: number; remaining: number }> {
    const cfg = this.getConfig(endpoint);
    const key = this.buildKey(identifier, endpoint);

    const [countStr, ttl] = await Promise.all([
      this.adapter.get(key),
      this.adapter.ttl(key),
    ]);

    const count = countStr ? parseInt(countStr, 10) : 0;

    return {
      count,
      ttl: Math.max(0, ttl),
      remaining: Math.max(0, cfg.maxRequests - count),
    };
  }

  private buildKey(identifier: string, endpoint: string): string {
    return `${this.config.keyPrefix}:${endpoint}:${identifier}`;
  }

  private getConfig(endpoint: string): RateLimitConfig {
    return this.config.endpoints[endpoint] ?? this.config.defaultConfig;
  }

  private generateHeaders(
    result: RateLimitResult,
    limit: number,
  ): RateLimitHeaders {
    const headers: RateLimitHeaders = {
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    };

    if (result.retryAfter) {
      headers["Retry-After"] = String(result.retryAfter);
    }

    return headers;
  }
}

export function createRateLimitService(
  adapter: CacheAdapter,
  config?: RateLimitServiceConfig,
): RateLimitService {
  return new RateLimitService(adapter, config);
}
