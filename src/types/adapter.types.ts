// =============================================
// CACHYER - ADAPTER INTERFACE
// =============================================
// The core abstraction that allows pluggable database backends
//
// ARCHITECTURE NOTE:
// The CacheAdapter interface defines ALL available cache operations.
// The Cachyer class exposes only core operations (get/set/hashes/etc).
// Advanced features (streams, bloom filters, etc) are accessed via:
//   cache.adapter.xadd(...)
//   cache.adapter.bfAdd(...)
//
// This design:
// - Keeps Cachyer's API focused and maintainable
// - Avoids proxying 50+ methods unnecessarily
// - Allows direct access to advanced features
// - Makes adapter capabilities explicit
//
// See ARCHITECTURE.md for full explanation.
// =============================================

import type {
  CacheScanOptions,
  CacheSetOptions,
  CacheStats,
  SortedSetRangeOptions,
} from "./core.types";
import type {
  ExecuteOptions,
  ExecutorMetrics,
  PipelineEntry,
  PipelineResult,
  ScriptDefinition,
  TransactionResult,
} from "./operation.types";

/**
 * Logger interface for adapters
 */
export interface CacheLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Default console logger
 */
export const defaultLogger: CacheLogger = {
  debug: (msg, meta) => console.debug(`[Cachyer] ${msg}`, meta ?? ""),
  info: (msg, meta) => console.info(`[Cachyer] ${msg}`, meta ?? ""),
  warn: (msg, meta) => console.warn(`[Cachyer] ${msg}`, meta ?? ""),
  error: (msg, meta) => console.error(`[Cachyer] ${msg}`, meta ?? ""),
};

/**
 * Base configuration for all adapters
 */
export interface AdapterConfig {
  /** Prefix for all keys */
  keyPrefix?: string;

  /** Default TTL in seconds */
  defaultTtl?: number;

  /** Logger instance */
  logger?: CacheLogger;

  /** Default execution options */
  defaultOptions?: ExecuteOptions;

  /** Enable metrics collection */
  enableMetrics?: boolean;
}

/**
 * Connection status
 */
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "ready"
  | "reconnecting"
  | "error";

/**
 * The core cache adapter interface
 * All database adapters must implement this interface
 */
export interface CacheAdapter {
  /** Adapter name (e.g., 'redis', 'mongodb', 'postgres') */
  readonly name: string;

  /** Current connection status */
  readonly status: ConnectionStatus;

  // =============================================
  // CONNECTION METHODS
  // =============================================

  /** Connect to the cache backend */
  connect(): Promise<void>;

  /** Disconnect from the cache backend */
  disconnect(): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;

  /** Ping the cache backend */
  ping(): Promise<boolean>;

  // =============================================
  // STRING OPERATIONS
  // =============================================

  /** Set a string value */
  set(
    key: string,
    value: string,
    options?: CacheSetOptions
  ): Promise<"OK" | null>;

  /** Get a string value */
  get(key: string): Promise<string | null>;

  /** Set multiple values */
  mset(keyValues: Record<string, string>): Promise<"OK">;

  /** Get multiple values */
  mget(keys: string[]): Promise<(string | null)[]>;

  /** Increment a numeric value */
  incr(key: string): Promise<number>;

  /** Increment by a specific amount */
  incrby(key: string, increment: number): Promise<number>;

  /** Decrement a numeric value */
  decr(key: string): Promise<number>;

  /** Decrement by a specific amount */
  decrby(key: string, decrement: number): Promise<number>;

  // =============================================
  // HASH OPERATIONS
  // =============================================

  /** Set a hash field */
  hset(key: string, field: string, value: string): Promise<number>;

  /** Set multiple hash fields */
  hmset(
    key: string,
    fieldValues: Record<string, string | number>
  ): Promise<"OK">;

  /** Get a hash field */
  hget(key: string, field: string): Promise<string | null>;

  /** Get multiple hash fields */
  hmget(key: string, fields: string[]): Promise<(string | null)[]>;

  /** Get all hash fields and values */
  hgetall(key: string): Promise<Record<string, string>>;

  /** Delete hash fields */
  hdel(key: string, ...fields: string[]): Promise<number>;

  /** Check if hash field exists */
  hexists(key: string, field: string): Promise<0 | 1>;

  /** Increment hash field */
  hincrby(key: string, field: string, increment: number): Promise<number>;

  /** Get hash field count */
  hlen(key: string): Promise<number>;

  // =============================================
  // LIST OPERATIONS
  // =============================================

  /** Push to left of list */
  lpush(key: string, ...values: string[]): Promise<number>;

  /** Push to right of list */
  rpush(key: string, ...values: string[]): Promise<number>;

  /** Pop from left of list */
  lpop(key: string): Promise<string | null>;

  /** Pop from right of list */
  rpop(key: string): Promise<string | null>;

  /** Get range from list */
  lrange(key: string, start: number, stop: number): Promise<string[]>;

  /** Get list length */
  llen(key: string): Promise<number>;

  /** Trim list */
  ltrim(key: string, start: number, stop: number): Promise<"OK">;

  /** Get element by index */
  lindex(key: string, index: number): Promise<string | null>;

  // =============================================
  // SET OPERATIONS
  // =============================================

  /** Add to set */
  sadd(key: string, ...members: string[]): Promise<number>;

  /** Remove from set */
  srem(key: string, ...members: string[]): Promise<number>;

  /** Get all set members */
  smembers(key: string): Promise<string[]>;

  /** Check if member exists */
  sismember(key: string, member: string): Promise<0 | 1>;

  /** Get set size */
  scard(key: string): Promise<number>;

  /** Intersection of sets */
  sinter(...keys: string[]): Promise<string[]>;

  /** Union of sets */
  sunion(...keys: string[]): Promise<string[]>;

  /** Difference of sets */
  sdiff(...keys: string[]): Promise<string[]>;

  // =============================================
  // SORTED SET OPERATIONS
  // =============================================

  /** Add to sorted set */
  zadd(
    key: string,
    scoreMembers: Array<{ score: number; member: string }>,
    options?: { nx?: boolean; xx?: boolean; gt?: boolean; lt?: boolean }
  ): Promise<number>;

  /** Remove from sorted set */
  zrem(key: string, ...members: string[]): Promise<number>;

  /** Get score of member */
  zscore(key: string, member: string): Promise<string | null>;

  /** Get rank of member */
  zrank(key: string, member: string): Promise<number | null>;

  /** Get reverse rank of member */
  zrevrank(key: string, member: string): Promise<number | null>;

  /** Get range from sorted set */
  zrange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions
  ): Promise<string[] | Array<{ member: string; score: number }>>;

  /** Get reverse range from sorted set */
  zrevrange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions
  ): Promise<string[] | Array<{ member: string; score: number }>>;

  /** Get sorted set size */
  zcard(key: string): Promise<number>;

  /** Count members in score range */
  zcount(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<number>;

  /** Increment member score */
  zincrby(key: string, increment: number, member: string): Promise<string>;

  /** Remove by rank range */
  zremrangebyrank(key: string, start: number, stop: number): Promise<number>;

  /** Remove by score range */
  zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<number>;

  // =============================================
  // KEY MANAGEMENT
  // =============================================

  /** Delete keys */
  del(...keys: string[]): Promise<number>;

  /** Check if key exists */
  exists(...keys: string[]): Promise<number>;

  /** Set expiration in seconds */
  expire(key: string, seconds: number): Promise<0 | 1>;

  /** Set expiration at timestamp */
  expireat(key: string, timestamp: number): Promise<0 | 1>;

  /** Get TTL in seconds */
  ttl(key: string): Promise<number>;

  /** Get TTL in milliseconds */
  pttl(key: string): Promise<number>;

  /** Remove expiration */
  persist(key: string): Promise<0 | 1>;

  /** Rename key */
  rename(key: string, newKey: string): Promise<"OK">;

  /** Get key type */
  type(key: string): Promise<string>;

  /** Find keys matching pattern */
  keys(pattern: string): Promise<string[]>;

  /** Scan keys with cursor */
  scan(
    cursor: number,
    options?: CacheScanOptions
  ): Promise<{ cursor: number; keys: string[] }>;

  // =============================================
  // HYPERLOGLOG OPERATIONS (optional)
  // =============================================

  /** Add to HyperLogLog */
  pfadd?(key: string, ...elements: string[]): Promise<0 | 1>;

  /** Count HyperLogLog */
  pfcount?(...keys: string[]): Promise<number>;

  /** Merge HyperLogLogs */
  pfmerge?(destKey: string, ...sourceKeys: string[]): Promise<"OK">;

  // =============================================
  // SCRIPTING (optional)
  // =============================================

  /** Execute a script */
  executeScript?<TResult>(
    script: ScriptDefinition<any, any, TResult>,
    keys: string[],
    args: (string | number)[]
  ): Promise<TResult>;

  /** Load a script and get its hash */
  loadScript?(script: string): Promise<string>;

  // =============================================
  // PIPELINE & TRANSACTIONS (optional)
  // =============================================

  /** Execute operations in a pipeline */
  executePipeline?(entries: PipelineEntry[]): Promise<PipelineResult>;

  /** Execute operations in a transaction */
  executeTransaction?(entries: PipelineEntry[]): Promise<TransactionResult>;

  // =============================================
  // PUB/SUB (optional)
  // =============================================

  /** Publish a message */
  publish?(channel: string, message: string): Promise<number>;

  /** Subscribe to a channel */
  subscribe?(
    channel: string,
    callback: (message: string, channel: string) => void
  ): Promise<void>;

  /** Unsubscribe from a channel */
  unsubscribe?(channel: string): Promise<void>;

  // =============================================
  // STREAM OPERATIONS (optional)
  // =============================================

  /** Add entry to stream */
  xadd?(
    key: string,
    id: string | "*",
    fields: Record<string, string>
  ): Promise<string>;

  /** Read from streams */
  xread?(options: {
    streams: string[];
    ids: string[];
    count?: number;
    block?: number;
  }): Promise<Array<{
    stream: string;
    messages: Array<{ id: string; fields: Record<string, string> }>;
  }> | null>;

  /** Get range from stream */
  xrange?(
    key: string,
    start: string,
    end: string,
    count?: number
  ): Promise<Array<{ id: string; fields: Record<string, string> }>>;

  /** Get reverse range from stream */
  xrevrange?(
    key: string,
    end: string,
    start: string,
    count?: number
  ): Promise<Array<{ id: string; fields: Record<string, string> }>>;

  /** Get stream length */
  xlen?(key: string): Promise<number>;

  /** Trim stream */
  xtrim?(
    key: string,
    strategy: "MAXLEN" | "MINID",
    threshold: number | string,
    approximate?: boolean
  ): Promise<number>;

  /** Delete entries from stream */
  xdel?(key: string, ...ids: string[]): Promise<number>;

  // =============================================
  // BLOOM FILTER OPERATIONS (optional)
  // =============================================

  /** Reserve a bloom filter */
  bfReserve?(key: string, errorRate: number, capacity: number): Promise<"OK">;

  /** Add item to bloom filter */
  bfAdd?(key: string, item: string): Promise<0 | 1>;

  /** Add multiple items to bloom filter */
  bfMAdd?(key: string, ...items: string[]): Promise<Array<0 | 1>>;

  /** Check if item exists in bloom filter */
  bfExists?(key: string, item: string): Promise<0 | 1>;

  /** Check if multiple items exist in bloom filter */
  bfMExists?(key: string, ...items: string[]): Promise<Array<0 | 1>>;

  // =============================================
  // METRICS
  // =============================================

  /** Get adapter metrics */
  getMetrics(): ExecutorMetrics;

  /** Reset adapter metrics */
  resetMetrics(): void;

  /** Get cache statistics */
  getStats?(): Promise<CacheStats>;
}

/**
 * Extended adapter with full feature support
 */
export interface FullCacheAdapter extends CacheAdapter {
  pfadd(key: string, ...elements: string[]): Promise<0 | 1>;
  pfcount(...keys: string[]): Promise<number>;
  pfmerge(destKey: string, ...sourceKeys: string[]): Promise<"OK">;
  executeScript<TResult>(
    script: ScriptDefinition<any, any, TResult>,
    keys: string[],
    args: (string | number)[]
  ): Promise<TResult>;
  loadScript(script: string): Promise<string>;
  executePipeline(entries: PipelineEntry[]): Promise<PipelineResult>;
  executeTransaction(entries: PipelineEntry[]): Promise<TransactionResult>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(
    channel: string,
    callback: (message: string, channel: string) => void
  ): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  // Stream operations
  xadd(
    key: string,
    id: string | "*",
    fields: Record<string, string>
  ): Promise<string>;
  xread(options: {
    streams: string[];
    ids: string[];
    count?: number;
    block?: number;
  }): Promise<Array<{
    stream: string;
    messages: Array<{ id: string; fields: Record<string, string> }>;
  }> | null>;
  xrange(
    key: string,
    start: string,
    end: string,
    count?: number
  ): Promise<Array<{ id: string; fields: Record<string, string> }>>;
  xrevrange(
    key: string,
    end: string,
    start: string,
    count?: number
  ): Promise<Array<{ id: string; fields: Record<string, string> }>>;
  xlen(key: string): Promise<number>;
  xtrim(
    key: string,
    strategy: "MAXLEN" | "MINID",
    threshold: number | string,
    approximate?: boolean
  ): Promise<number>;
  xdel(key: string, ...ids: string[]): Promise<number>;
  // Bloom filter operations
  bfReserve(key: string, errorRate: number, capacity: number): Promise<"OK">;
  bfAdd(key: string, item: string): Promise<0 | 1>;
  bfMAdd(key: string, ...items: string[]): Promise<Array<0 | 1>>;
  bfExists(key: string, item: string): Promise<0 | 1>;
  bfMExists(key: string, ...items: string[]): Promise<Array<0 | 1>>;
}

/**
 * Check if adapter supports a feature
 */
export function adapterSupports<K extends keyof FullCacheAdapter>(
  adapter: CacheAdapter,
  feature: K
): adapter is CacheAdapter & Pick<FullCacheAdapter, K> {
  return typeof (adapter as any)[feature] === "function";
}

/**
 * Adapter capability check
 */
export interface AdapterCapabilities {
  hyperloglog: boolean;
  scripting: boolean;
  pipeline: boolean;
  transactions: boolean;
  pubsub: boolean;
  streams: boolean;
  bloomFilter: boolean;
}

/**
 * Get adapter capabilities
 */
export function getAdapterCapabilities(
  adapter: CacheAdapter
): AdapterCapabilities {
  return {
    hyperloglog: typeof adapter.pfadd === "function",
    scripting: typeof adapter.executeScript === "function",
    pipeline: typeof adapter.executePipeline === "function",
    transactions: typeof adapter.executeTransaction === "function",
    pubsub: typeof adapter.publish === "function",
    streams: typeof adapter.xadd === "function",
    bloomFilter: typeof adapter.bfAdd === "function",
  };
}
