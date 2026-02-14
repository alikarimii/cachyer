// =============================================
// CACHYER - MAIN CLASS
// =============================================
// The primary entry point for the caching library
// =============================================

import type {
  AdapterCapabilities,
  CacheAdapter,
  CacheLogger,
  ConnectionStatus,
} from "../types/adapter.types";
import { defaultLogger } from "../types/adapter.types";
import type {
  CacheScanOptions,
  CacheSetOptions,
  CacheStats,
  Serializer,
  SortedSetRangeOptions,
} from "../types/core.types";
import {
  CacheError,
  CacheErrorCode,
  JSONSerializer,
} from "../types/core.types";
import type {
  CacheOperation,
  CacheSchema,
  ExecuteOptions,
  ExecuteResult,
  ExecutorMetrics,
  PipelineEntry,
  PipelineResult,
  ScriptDefinition,
  TransactionResult,
} from "../types/operation.types";

/**
 * Cachyer configuration options
 */
export interface CachyerConfig {
  /** The cache adapter to use */
  adapter: CacheAdapter;

  /** Global key prefix */
  keyPrefix?: string;

  /** Default TTL in seconds */
  defaultTtl?: number;

  /** Default serializer */
  serializer?: Serializer;

  /** Logger instance */
  logger?: CacheLogger;

  /** Default execution options */
  defaultOptions?: ExecuteOptions;

  /** Enable metrics collection */
  enableMetrics?: boolean;

  /** Auto-connect on creation */
  autoConnect?: boolean;
}

/**
 * Main Cachyer class
 *
 * Provides core caching operations with key prefixing, metrics, and schema support.
 * For advanced adapter features (streams, bloom filters, etc.), use the `adapter` property.
 *
 * @example
 * ```typescript
 * const cache = new Cachyer({ adapter: redisAdapter })
 *
 * // Core operations via Cachyer
 * await cache.set('key', 'value')
 * await cache.zadd('leaderboard', [{ member: 'user1', score: 100 }])
 *
 * // Advanced features via adapter
 * await cache.adapter.xadd('stream:logs', '*', { message: 'hello' })
 * await cache.adapter.bfAdd('filter:users', 'user123')
 * ```
 */
export class Cachyer {
  private readonly _adapter: CacheAdapter;
  private readonly config: Required<Omit<CachyerConfig, "adapter">>;
  private readonly schemas: Map<string, CacheSchema<any, any>> = new Map();
  private readonly scriptHashes: Map<string, string> = new Map();
  private isInitialized = false;

  /**
   * Get the underlying cache adapter for advanced operations.
   *
   * Use this to access adapter-specific features like:
   * - Redis Streams (xadd, xread, xrange, etc.)
   * - Bloom Filters (bfReserve, bfAdd, bfExists, etc.)
   * - HyperLogLog, Geo commands, etc.
   *
   * Note: When using adapter directly, key prefixing is NOT applied.
   * Use `prefixKey()` method if you need prefixed keys.
   */
  get adapter(): CacheAdapter {
    return this._adapter;
  }

  constructor(options: CachyerConfig) {
    this._adapter = options.adapter;
    this.config = {
      keyPrefix: options.keyPrefix ?? "",
      defaultTtl: options.defaultTtl ?? 3600,
      serializer: options.serializer ?? JSONSerializer,
      logger: options.logger ?? defaultLogger,
      defaultOptions: options.defaultOptions ?? {
        timeout: 5000,
        retries: 2,
        retryDelay: 100,
        throwOnError: true,
      },
      enableMetrics: options.enableMetrics ?? true,
      autoConnect: options.autoConnect ?? true,
    };

    if (this.config.autoConnect) {
      this.connect().catch((err) => {
        this.config.logger.error("Auto-connect failed", { error: err.message });
      });
    }
  }

  // =============================================
  // CONNECTION MANAGEMENT
  // =============================================

  /**
   * Connect to the cache backend
   */
  async connect(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this._adapter.connect();
      this.isInitialized = true;
      this.config.logger.info("Connected to cache backend", {
        adapter: this._adapter.name,
      });
    } catch (error) {
      this.config.logger.error("Failed to connect", {
        adapter: this._adapter.name,
        error: (error as Error).message,
      });
      throw new CacheError(
        "Failed to connect to cache backend",
        CacheErrorCode.CONNECTION_ERROR,
        { cause: error as Error },
      );
    }
  }

  /**
   * Disconnect from the cache backend
   */
  async disconnect(): Promise<void> {
    try {
      await this._adapter.disconnect();
      this.isInitialized = false;
      this.config.logger.info("Disconnected from cache backend");
    } catch (error) {
      this.config.logger.error("Failed to disconnect", {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._adapter.isConnected();
  }

  /**
   * Get connection status
   */
  get status(): ConnectionStatus {
    return this._adapter.status;
  }

  /**
   * Ping the cache backend
   */
  async ping(): Promise<boolean> {
    return this._adapter.ping();
  }

  /**
   * Get adapter capabilities
   */
  getCapabilities(): AdapterCapabilities {
    return {
      hyperloglog: typeof this._adapter.pfadd === "function",
      scripting: typeof this._adapter.executeScript === "function",
      pipeline: typeof this._adapter.executePipeline === "function",
      transactions: typeof this._adapter.executeTransaction === "function",
      pubsub: typeof this._adapter.publish === "function",
      streams: typeof this._adapter.xadd === "function",
      bloomFilter: typeof this._adapter.bfAdd === "function",
    };
  }

  // =============================================
  // SCHEMA MANAGEMENT
  // =============================================

  /**
   * Register a cache schema
   */
  registerSchema<
    TKeyParams extends Record<string, unknown>,
    TOperations extends Record<string, CacheOperation<any, any>>,
  >(schema: CacheSchema<TKeyParams, TOperations>): void {
    this.schemas.set(schema.name, schema);
    this.config.logger.debug("Registered schema", { name: schema.name });
  }

  /**
   * Get a registered schema
   */
  getSchema<
    TKeyParams extends Record<string, unknown>,
    TOperations extends Record<string, CacheOperation<any, any>>,
  >(name: string): CacheSchema<TKeyParams, TOperations> | undefined {
    return this.schemas.get(name);
  }

  /**
   * List all registered schemas
   */
  listSchemas(): string[] {
    return Array.from(this.schemas.keys());
  }

  // =============================================
  // OPERATION EXECUTION
  // =============================================

  /**
   * Execute a cache operation
   */
  async execute<TParams extends Record<string, unknown>, TResult>(
    operation: CacheOperation<TParams, TResult>,
    params: TParams,
    options?: ExecuteOptions,
  ): Promise<TResult> {
    const opts = { ...this.config.defaultOptions, ...options };
    let lastError: Error | undefined;
    let retries = 0;

    while (retries <= (opts.retries ?? 0)) {
      try {
        const args = operation.buildArgs(params);
        const prefixedArgs = this.applyKeyPrefix(args, operation.command);

        this.config.logger.debug(`Executing ${operation.command}`, {
          args: prefixedArgs,
          attempt: retries + 1,
        });

        const rawResult = await this.executeCommand(
          operation.command,
          prefixedArgs,
          opts.timeout ?? 5000,
        );

        const result = operation.parseResult
          ? operation.parseResult(rawResult)
          : (rawResult as TResult);

        return result;
      } catch (error) {
        lastError = error as Error;
        retries++;

        this.config.logger.warn(`Operation ${operation.command} failed`, {
          error: lastError.message,
          attempt: retries,
          maxRetries: opts.retries,
        });

        if (retries <= (opts.retries ?? 0)) {
          await this.delay(opts.retryDelay ?? 100);
        }
      }
    }

    if (opts.onError) {
      opts.onError(lastError!, operation.command);
    }

    if (opts.throwOnError) {
      throw new CacheError(
        `Operation ${operation.command} failed after ${retries} retries`,
        CacheErrorCode.COMMAND_ERROR,
        { command: operation.command, cause: lastError },
      );
    }

    return undefined as unknown as TResult;
  }

  /**
   * Execute operation and return wrapped result
   */
  async executeWrapped<TParams extends Record<string, unknown>, TResult>(
    operation: CacheOperation<TParams, TResult>,
    params: TParams,
    options?: ExecuteOptions,
  ): Promise<ExecuteResult<TResult>> {
    const startTime = Date.now();
    let retries = 0;

    try {
      const data = await this.execute(operation, params, {
        ...options,
        throwOnError: true,
      });

      return {
        success: true,
        data,
        executionTimeMs: Date.now() - startTime,
        retries,
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        executionTimeMs: Date.now() - startTime,
        retries,
      };
    }
  }

  // =============================================
  // SCRIPT EXECUTION
  // =============================================

  /**
   * Execute a script
   */
  async executeScript<TResult>(
    script: ScriptDefinition<any, any, TResult>,
    keys: string[],
    args: (string | number)[],
    _options?: ExecuteOptions,
  ): Promise<TResult> {
    if (typeof this.adapter.executeScript !== "function") {
      throw new CacheError(
        "Scripting is not supported by this adapter",
        CacheErrorCode.ADAPTER_NOT_SUPPORTED,
      );
    }

    const prefixedKeys = keys.map((k) => this.prefixKey(k));

    try {
      return await this.adapter.executeScript(script, prefixedKeys, args);
    } catch (error) {
      throw new CacheError(
        "Script execution failed",
        CacheErrorCode.SCRIPT_ERROR,
        { cause: error as Error },
      );
    }
  }

  /**
   * Load a script
   */
  async loadScript(script: string): Promise<string> {
    if (typeof this.adapter.loadScript !== "function") {
      throw new CacheError(
        "Scripting is not supported by this adapter",
        CacheErrorCode.ADAPTER_NOT_SUPPORTED,
      );
    }

    const hash = await this.adapter.loadScript(script);
    this.scriptHashes.set(script, hash);
    return hash;
  }

  // =============================================
  // PIPELINE & TRANSACTIONS
  // =============================================

  /**
   * Execute operations in a pipeline
   */
  async pipeline(entries: PipelineEntry[]): Promise<PipelineResult> {
    if (typeof this.adapter.executePipeline !== "function") {
      // Fallback to sequential execution
      return this.executePipelineFallback(entries);
    }

    const prefixedEntries = this.prefixPipelineEntries(entries);
    return this.adapter.executePipeline(prefixedEntries);
  }

  /**
   * Execute operations in a transaction
   */
  async transaction(entries: PipelineEntry[]): Promise<TransactionResult> {
    if (typeof this.adapter.executeTransaction !== "function") {
      throw new CacheError(
        "Transactions are not supported by this adapter",
        CacheErrorCode.ADAPTER_NOT_SUPPORTED,
      );
    }

    const prefixedEntries = this.prefixPipelineEntries(entries);
    return this.adapter.executeTransaction(prefixedEntries);
  }

  // =============================================
  // CONVENIENCE METHODS
  // =============================================

  /**
   * Get a value
   */
  async get(key: string): Promise<string | null> {
    return this._adapter.get(this.prefixKey(key));
  }

  /**
   * Set a value
   */
  async set(
    key: string,
    value: string,
    options?: CacheSetOptions,
  ): Promise<"OK" | null> {
    return this._adapter.set(this.prefixKey(key), value, options);
  }

  /**
   * Delete keys
   */
  async del(...keys: string[]): Promise<number> {
    const prefixedKeys = keys.map((k) => this.prefixKey(k));
    return this._adapter.del(...prefixedKeys);
  }

  /**
   * Check if key exists
   */
  async exists(...keys: string[]): Promise<number> {
    const prefixedKeys = keys.map((k) => this.prefixKey(k));
    return this._adapter.exists(...prefixedKeys);
  }

  /**
   * Set expiration
   */
  async expire(key: string, seconds: number): Promise<0 | 1> {
    return this._adapter.expire(this.prefixKey(key), seconds);
  }

  /**
   * Get TTL
   */
  async ttl(key: string): Promise<number> {
    return this._adapter.ttl(this.prefixKey(key));
  }

  /**
   * Get hash field
   */
  async hget(key: string, field: string): Promise<string | null> {
    return this._adapter.hget(this.prefixKey(key), field);
  }

  /**
   * Set hash field
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    return this._adapter.hset(this.prefixKey(key), field, value);
  }

  /**
   * Get all hash fields
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    return this._adapter.hgetall(this.prefixKey(key));
  }

  /**
   * Delete hash fields
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this._adapter.hdel(this.prefixKey(key), ...fields);
  }

  /**
   * Check if hash field exists
   */
  async hexists(key: string, field: string): Promise<0 | 1> {
    return this._adapter.hexists(this.prefixKey(key), field);
  }

  /**
   * Increment hash field by integer
   */
  async hincrby(
    key: string,
    field: string,
    increment: number,
  ): Promise<number> {
    return this._adapter.hincrby(this.prefixKey(key), field, increment);
  }

  /**
   * Get hash field count
   */
  async hlen(key: string): Promise<number> {
    return this._adapter.hlen(this.prefixKey(key));
  }

  /**
   * Remove from set
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    return this._adapter.srem(this.prefixKey(key), ...members);
  }

  /**
   * Check if member exists in set
   */
  async sismember(key: string, member: string): Promise<0 | 1> {
    return this._adapter.sismember(this.prefixKey(key), member);
  }

  /**
   * Get set size
   */
  async scard(key: string): Promise<number> {
    return this._adapter.scard(this.prefixKey(key));
  }

  /**
   * Add to sorted set
   */
  async zadd(
    key: string,
    scoreMembers: Array<{ score: number; member: string }>,
    options?: { nx?: boolean; xx?: boolean },
  ): Promise<number> {
    return this._adapter.zadd(this.prefixKey(key), scoreMembers, options);
  }

  /**
   * Get from sorted set
   */
  async zrange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | Array<{ member: string; score: number }>> {
    return this._adapter.zrange(this.prefixKey(key), start, stop, options);
  }

  /**
   * Get reverse range from sorted set
   */
  async zrevrange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | Array<{ member: string; score: number }>> {
    return this._adapter.zrevrange(this.prefixKey(key), start, stop, options);
  }

  /**
   * Remove from sorted set
   */
  async zrem(key: string, ...members: string[]): Promise<number> {
    return this._adapter.zrem(this.prefixKey(key), ...members);
  }

  /**
   * Get score of member in sorted set
   */
  async zscore(key: string, member: string): Promise<string | null> {
    return this._adapter.zscore(this.prefixKey(key), member);
  }

  /**
   * Get rank of member in sorted set
   */
  async zrank(key: string, member: string): Promise<number | null> {
    return this._adapter.zrank(this.prefixKey(key), member);
  }

  /**
   * Get sorted set size
   */
  async zcard(key: string): Promise<number> {
    return this._adapter.zcard(this.prefixKey(key));
  }

  /**
   * Increment member score in sorted set
   */
  async zincrby(
    key: string,
    increment: number,
    member: string,
  ): Promise<string> {
    return this._adapter.zincrby(this.prefixKey(key), increment, member);
  }

  /**
   * Increment value
   */
  async incr(key: string): Promise<number> {
    return this._adapter.incr(this.prefixKey(key));
  }

  /**
   * Add to set
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this._adapter.sadd(this.prefixKey(key), ...members);
  }

  /**
   * Get set members
   */
  async smembers(key: string): Promise<string[]> {
    return this._adapter.smembers(this.prefixKey(key));
  }

  /**
   * Push to list
   */
  async lpush(key: string, ...values: string[]): Promise<number> {
    return this._adapter.lpush(this.prefixKey(key), ...values);
  }

  /**
   * Get list range
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this._adapter.lrange(this.prefixKey(key), start, stop);
  }

  /**
   * Scan keys
   */
  async scan(
    cursor: number,
    options?: CacheScanOptions,
  ): Promise<{ cursor: number; keys: string[] }> {
    const result = await this._adapter.scan(cursor, {
      ...options,
      match: options?.match ? this.prefixKey(options.match) : undefined,
    });

    return {
      cursor: result.cursor,
      keys: result.keys.map((k) => this.stripKeyPrefix(k)),
    };
  }

  // =============================================
  // PUB/SUB
  // =============================================

  /**
   * Publish a message
   */
  async publish(channel: string, message: string): Promise<number> {
    if (typeof this.adapter.publish !== "function") {
      throw new CacheError(
        "Pub/Sub is not supported by this adapter",
        CacheErrorCode.ADAPTER_NOT_SUPPORTED,
      );
    }

    return this.adapter.publish(this.prefixKey(channel), message);
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(
    channel: string,
    callback: (message: string, channel: string) => void,
  ): Promise<void> {
    if (typeof this.adapter.subscribe !== "function") {
      throw new CacheError(
        "Pub/Sub is not supported by this adapter",
        CacheErrorCode.ADAPTER_NOT_SUPPORTED,
      );
    }

    return this.adapter.subscribe(this.prefixKey(channel), callback);
  }

  // =============================================
  // METRICS
  // =============================================

  /**
   * Get executor metrics
   */
  getMetrics(): ExecutorMetrics {
    return this._adapter.getMetrics();
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this._adapter.resetMetrics();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats | null> {
    if (typeof this.adapter.getStats === "function") {
      return this.adapter.getStats();
    }
    return null;
  }

  // =============================================
  // PRIVATE HELPERS
  // =============================================

  private prefixKey(key: string): string {
    if (!this.config.keyPrefix) return key;
    if (key.startsWith(this.config.keyPrefix + ":")) return key;
    return `${this.config.keyPrefix}:${key}`;
  }

  private stripKeyPrefix(key: string): string {
    if (!this.config.keyPrefix) return key;
    const prefix = this.config.keyPrefix + ":";
    if (key.startsWith(prefix)) {
      return key.slice(prefix.length);
    }
    return key;
  }

  private applyKeyPrefix(
    args: (string | number)[],
    command: string,
  ): (string | number)[] {
    // Commands where the first argument is a key
    const singleKeyCommands = [
      "GET",
      "SET",
      "SETEX",
      "SETNX",
      "INCR",
      "INCRBY",
      "DECR",
      "DECRBY",
      "LPUSH",
      "RPUSH",
      "LPOP",
      "RPOP",
      "LRANGE",
      "LLEN",
      "LTRIM",
      "LINDEX",
      "SADD",
      "SREM",
      "SMEMBERS",
      "SISMEMBER",
      "SCARD",
      "ZADD",
      "ZREM",
      "ZSCORE",
      "ZRANK",
      "ZREVRANK",
      "ZRANGE",
      "ZREVRANGE",
      "ZCARD",
      "ZCOUNT",
      "ZINCRBY",
      "ZREMRANGEBYRANK",
      "ZREMRANGEBYSCORE",
      "HSET",
      "HSETNX",
      "HGET",
      "HMSET",
      "HMGET",
      "HGETALL",
      "HDEL",
      "HEXISTS",
      "HINCRBY",
      "HINCRBYFLOAT",
      "HKEYS",
      "HVALS",
      "HLEN",
      "EXPIRE",
      "EXPIREAT",
      "TTL",
      "PTTL",
      "PERSIST",
      "TYPE",
      "PFADD",
      "PFCOUNT",
    ];

    if (!this.config.keyPrefix) return args;

    if (singleKeyCommands.includes(command.toUpperCase()) && args.length > 0) {
      return [this.prefixKey(String(args[0])), ...args.slice(1)];
    }

    return args;
  }

  private prefixPipelineEntries(entries: PipelineEntry[]): PipelineEntry[] {
    return entries.map((entry) => ({
      ...entry,
      operation: {
        ...entry.operation,
        buildArgs: (params: any) => {
          const args = entry.operation.buildArgs(params);
          return this.applyKeyPrefix(args, entry.operation.command);
        },
      },
    }));
  }

  private async executeCommand(
    command: string,
    args: (string | number)[],
    timeout: number,
  ): Promise<unknown> {
    const methodName = command.toLowerCase() as keyof CacheAdapter;
    const method = this._adapter[methodName];

    if (typeof method !== "function") {
      throw new CacheError(
        `Command ${command} is not supported by this adapter`,
        CacheErrorCode.ADAPTER_NOT_SUPPORTED,
      );
    }

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation ${command} timed out after ${timeout}ms`));
      }, timeout);
    });

    const commandPromise = (
      method as (...a: unknown[]) => Promise<unknown>
    ).apply(this._adapter, args);

    return Promise.race([commandPromise, timeoutPromise]);
  }

  private async executePipelineFallback(
    entries: PipelineEntry[],
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const results: Array<{ success: boolean; data?: any; error?: Error }> = [];

    for (const entry of entries) {
      try {
        const data = await this.execute(entry.operation, entry.params);
        results.push({ success: true, data });
      } catch (error) {
        results.push({ success: false, error: error as Error });
      }
    }

    return {
      success: results.every((r) => r.success),
      results,
      executionTimeMs: Date.now() - startTime,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================
// FACTORY FUNCTION
// =============================================

/**
 * Create a Cachyer instance
 */
export function createCachyer(config: CachyerConfig): Cachyer {
  return new Cachyer(config);
}
