// =============================================
// CACHYER - DISTRIBUTED LOCK SERVICE
// =============================================
// Redis-backed distributed locking with safe release
// =============================================

import type { CacheAdapter } from "../types/adapter.types";
import { defineScript } from "../types/operation.types";

// =============================================
// TYPES
// =============================================

export interface LockOptions {
  /** Lock TTL in milliseconds */
  ttlMs?: number;
  /** Timeout for acquiring the lock in milliseconds */
  timeoutMs?: number;
  /** Retry interval in milliseconds */
  retryIntervalMs?: number;
  /** Unique owner identifier */
  ownerId?: string;
}

export interface LockResult {
  acquired: boolean;
  ownerId: string;
  resource: string;
}

export interface LockServiceConfig {
  /** Key prefix for lock keys */
  keyPrefix?: string;
  /** Default lock TTL in milliseconds */
  defaultTtlMs?: number;
  /** Default acquire timeout in milliseconds */
  defaultTimeoutMs?: number;
  /** Default retry interval in milliseconds */
  defaultRetryIntervalMs?: number;
}

// =============================================
// LUA SCRIPTS
// =============================================

export const releaseLockScript = defineScript({
  script: `
    local key = KEYS[1]
    local ownerId = ARGV[1]

    if redis.call('GET', key) == ownerId then
      return redis.call('DEL', key)
    end
    return 0
  `,
  language: "lua",
  keys: ["lockKey"] as const,
  args: ["ownerId"] as const,
  description: "Release lock only if owned by caller",
  parseResult: (result) => (result as number) === 1,
});

export const extendLockScript = defineScript({
  script: `
    local key = KEYS[1]
    local ownerId = ARGV[1]
    local ttlMs = tonumber(ARGV[2])

    if redis.call('GET', key) == ownerId then
      return redis.call('PEXPIRE', key, ttlMs)
    end
    return 0
  `,
  language: "lua",
  keys: ["lockKey"] as const,
  args: ["ownerId", "ttlMs"] as const,
  description: "Extend lock TTL only if owned by caller",
  parseResult: (result) => (result as number) === 1,
});

// =============================================
// LOCK SERVICE CLASS
// =============================================

export class LockService {
  private readonly adapter: CacheAdapter;
  private readonly config: Required<LockServiceConfig>;

  constructor(adapter: CacheAdapter, config?: LockServiceConfig) {
    this.adapter = adapter;
    this.config = {
      keyPrefix: config?.keyPrefix ?? "lock",
      defaultTtlMs: config?.defaultTtlMs ?? 10000,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 5000,
      defaultRetryIntervalMs: config?.defaultRetryIntervalMs ?? 100,
    };
  }

  /**
   * Acquire a distributed lock
   */
  async acquireLock(
    resource: string,
    ttlMs?: number,
    ownerId?: string,
  ): Promise<LockResult> {
    const key = this.buildKey(resource);
    const owner = ownerId ?? this.generateOwnerId();
    const ttl = ttlMs ?? this.config.defaultTtlMs;

    const result = await this.adapter.set(key, owner, {
      nx: true,
      px: ttl,
    });

    return {
      acquired: result === "OK",
      ownerId: owner,
      resource,
    };
  }

  /**
   * Release a distributed lock (safe: only releases if owned)
   */
  async releaseLock(resource: string, ownerId: string): Promise<boolean> {
    const key = this.buildKey(resource);

    if (typeof this.adapter.executeScript === "function") {
      return this.adapter.executeScript(releaseLockScript, [key], [ownerId]);
    }

    // Fallback for adapters without scripting (not fully safe)
    const current = await this.adapter.get(key);
    if (current === ownerId) {
      await this.adapter.del(key);
      return true;
    }
    return false;
  }

  /**
   * Extend a lock's TTL (safe: only extends if owned)
   */
  async extendLock(
    resource: string,
    ttlMs: number,
    ownerId: string,
  ): Promise<boolean> {
    const key = this.buildKey(resource);

    if (typeof this.adapter.executeScript === "function") {
      return this.adapter.executeScript(
        extendLockScript,
        [key],
        [ownerId, ttlMs],
      );
    }

    // Fallback for adapters without scripting (not fully safe)
    const current = await this.adapter.get(key);
    if (current === ownerId) {
      await this.adapter.expire(key, Math.ceil(ttlMs / 1000));
      return true;
    }
    return false;
  }

  /**
   * Execute a function while holding a lock
   */
  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options?: LockOptions,
  ): Promise<T> {
    const ttlMs = options?.ttlMs ?? this.config.defaultTtlMs;
    const timeoutMs = options?.timeoutMs ?? this.config.defaultTimeoutMs;
    const retryInterval =
      options?.retryIntervalMs ?? this.config.defaultRetryIntervalMs;
    const ownerId = options?.ownerId ?? this.generateOwnerId();

    const deadline = Date.now() + timeoutMs;

    // Try to acquire lock with retries
    let result = await this.acquireLock(resource, ttlMs, ownerId);

    while (!result.acquired && Date.now() < deadline) {
      await this.delay(retryInterval);
      result = await this.acquireLock(resource, ttlMs, ownerId);
    }

    if (!result.acquired) {
      throw new Error(
        `Failed to acquire lock on "${resource}" within ${timeoutMs}ms`,
      );
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(resource, ownerId);
    }
  }

  private buildKey(resource: string): string {
    return `${this.config.keyPrefix}:${resource}`;
  }

  private generateOwnerId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createLockService(
  adapter: CacheAdapter,
  config?: LockServiceConfig,
): LockService {
  return new LockService(adapter, config);
}
