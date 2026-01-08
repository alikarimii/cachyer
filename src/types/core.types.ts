// =============================================
// CACHYER - CORE TYPES
// =============================================
// Foundation types for the cache abstraction layer
// =============================================

/**
 * Supported data structure types across all adapters
 */
export type CacheStructure =
  | "STRING"
  | "LIST"
  | "SET"
  | "SORTED_SET"
  | "HASH"
  | "STREAM"
  | "HYPERLOGLOG"
  | "BLOOM_FILTER";

/**
 * Common cache commands that adapters must implement
 */
export type CacheCommand =
  // String commands
  | "SET"
  | "SETEX"
  | "SETNX"
  | "GET"
  | "MGET"
  | "MSET"
  | "INCR"
  | "INCRBY"
  | "DECR"
  | "DECRBY"
  // List commands
  | "LPUSH"
  | "RPUSH"
  | "LPOP"
  | "RPOP"
  | "LRANGE"
  | "LLEN"
  | "LTRIM"
  | "LINDEX"
  | "LSET"
  | "LREM"
  | "LINSERT"
  | "LPOS"
  // Set commands
  | "SADD"
  | "SREM"
  | "SMEMBERS"
  | "SISMEMBER"
  | "SCARD"
  | "SINTER"
  | "SUNION"
  | "SDIFF"
  // Sorted Set commands
  | "ZADD"
  | "ZREM"
  | "ZSCORE"
  | "ZRANK"
  | "ZREVRANK"
  | "ZRANGE"
  | "ZREVRANGE"
  | "ZRANGEBYSCORE"
  | "ZREVRANGEBYSCORE"
  | "ZCARD"
  | "ZCOUNT"
  | "ZINCRBY"
  | "ZREMRANGEBYRANK"
  | "ZREMRANGEBYSCORE"
  // Hash commands
  | "HSET"
  | "HSETNX"
  | "HGET"
  | "HMSET"
  | "HMGET"
  | "HGETALL"
  | "HDEL"
  | "HEXISTS"
  | "HINCRBY"
  | "HINCRBYFLOAT"
  | "HKEYS"
  | "HVALS"
  | "HLEN"
  // Stream commands
  | "XADD"
  | "XREAD"
  | "XRANGE"
  | "XREVRANGE"
  | "XLEN"
  | "XTRIM"
  | "XDEL"
  // HyperLogLog commands
  | "PFADD"
  | "PFCOUNT"
  | "PFMERGE"
  // Bloom Filter commands
  | "BF.ADD"
  | "BF.MADD"
  | "BF.EXISTS"
  | "BF.MEXISTS"
  | "BF.RESERVE"
  // Key management
  | "DEL"
  | "EXISTS"
  | "EXPIRE"
  | "EXPIREAT"
  | "TTL"
  | "PTTL"
  | "PERSIST"
  | "RENAME"
  | "TYPE"
  | "KEYS"
  | "SCAN"
  // Transaction commands
  | "MULTI"
  | "EXEC"
  | "DISCARD"
  | "WATCH"
  | "UNWATCH"
  // Scripting
  | "EVAL"
  | "EVALSHA"
  | "SCRIPT"
  // Pub/Sub
  | "PUBLISH"
  | "SUBSCRIBE"
  | "UNSUBSCRIBE"
  | "PSUBSCRIBE"
  | "PUNSUBSCRIBE"
  // Connection
  | "PING"
  | "QUIT";

/**
 * TTL presets in seconds
 */
export const TTL = {
  ONE_MINUTE: 60,
  FIVE_MINUTES: 300,
  FIFTEEN_MINUTES: 900,
  THIRTY_MINUTES: 1800,
  ONE_HOUR: 3600,
  TWO_HOURS: 7200,
  SIX_HOURS: 21600,
  TWELVE_HOURS: 43200,
  ONE_DAY: 86400,
  ONE_WEEK: 604800,
  ONE_MONTH: 2592000,
} as const;

export type TTLValue = (typeof TTL)[keyof typeof TTL];

/**
 * Cache entry metadata
 */
export interface CacheEntryMeta {
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly accessCount: number;
  readonly lastAccessedAt: number;
  readonly version: number;
  readonly ttl: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
  readonly size: number;
  readonly memoryUsage?: number;
  readonly avgLatencyMs: number;
  readonly p95LatencyMs?: number;
  readonly p99LatencyMs?: number;
}

/**
 * Execution context for operations
 */
export interface OperationContext {
  readonly requestId?: string;
  readonly userId?: string;
  readonly traceId?: string;
  readonly timestamp: number;
  readonly retryCount?: number;
}

/**
 * Error codes for cache operations
 */
export enum CacheErrorCode {
  CONNECTION_ERROR = "CONNECTION_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  COMMAND_ERROR = "COMMAND_ERROR",
  SCRIPT_ERROR = "SCRIPT_ERROR",
  SERIALIZATION_ERROR = "SERIALIZATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  ADAPTER_NOT_SUPPORTED = "ADAPTER_NOT_SUPPORTED",
}

/**
 * Custom cache error
 */
export class CacheError extends Error {
  readonly code: CacheErrorCode;
  readonly command?: CacheCommand;
  readonly key?: string;

  constructor(
    message: string,
    code: CacheErrorCode,
    options?: { command?: CacheCommand; key?: string; cause?: Error }
  ) {
    super(message, { cause: options?.cause });
    this.name = "CacheError";
    this.code = code;
    this.command = options?.command;
    this.key = options?.key;
  }
}

/**
 * Set options for cache operations
 */
export interface CacheSetOptions {
  /** Expire time in seconds */
  ex?: number;
  /** Expire time in milliseconds */
  px?: number;
  /** Only set if not exists */
  nx?: boolean;
  /** Only set if exists */
  xx?: boolean;
  /** Retain existing TTL */
  keepTtl?: boolean;
}

/**
 * Scan options for iteration
 */
export interface CacheScanOptions {
  match?: string;
  count?: number;
  type?: CacheStructure;
}

/**
 * Sorted set range options
 */
export interface SortedSetRangeOptions {
  withScores?: boolean;
  limit?: { offset: number; count: number };
  reverse?: boolean;
}

/**
 * Serializer interface for custom serialization
 */
export interface Serializer<T = unknown> {
  serialize(value: T): string | Buffer;
  deserialize(value: string | Buffer): T;
}

/**
 * Default JSON serializer
 */
export const JSONSerializer: Serializer = {
  serialize: (value) => JSON.stringify(value),
  deserialize: (value) => JSON.parse(value.toString()),
};
