// =============================================
// CACHYER - REDIS ADAPTER
// =============================================
// Full-featured Redis adapter using ioredis
// =============================================

import type { Redis } from "ioredis";
import type {
  AdapterConfig,
  ConnectionStatus,
  FullCacheAdapter,
} from "../../types/adapter.types";
import { defaultLogger } from "../../types/adapter.types";
import type {
  CacheScanOptions,
  CacheSetOptions,
  CacheStats,
  SortedSetRangeOptions,
} from "../../types/core.types";
import type {
  AnyPipelineEntry,
  ExecutorMetrics,
  PipelineResult,
  ScriptDefinition,
  TransactionResult,
} from "../../types/operation.types";

/**
 * Redis adapter configuration
 */
export interface RedisAdapterConfig extends AdapterConfig {
  /** ioredis client instance */
  client: Redis;

  /** Enable script caching */
  cacheScripts?: boolean;
}

/**
 * Redis adapter implementation
 */
export class RedisAdapter implements FullCacheAdapter {
  readonly name = "redis";
  private readonly client: Redis;
  private readonly config: Required<Omit<RedisAdapterConfig, "client">>;
  private readonly scriptHashes: Map<string, string> = new Map();
  private metrics: ExecutorMetrics = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    totalExecutionTimeMs: 0,
    avgExecutionTimeMs: 0,
    operationCounts: {},
  };

  constructor(options: RedisAdapterConfig) {
    this.client = options.client;
    this.config = {
      keyPrefix: options.keyPrefix ?? "",
      defaultTtl: options.defaultTtl ?? 3600,
      logger: options.logger ?? defaultLogger,
      defaultOptions: options.defaultOptions ?? {},
      enableMetrics: options.enableMetrics ?? true,
      cacheScripts: options.cacheScripts ?? true,
    };
  }

  get status(): ConnectionStatus {
    const redisStatus = this.client.status;
    switch (redisStatus) {
      case "connecting":
        return "connecting";
      case "connect":
      case "ready":
        return "ready";
      case "reconnecting":
        return "reconnecting";
      case "end":
      case "close":
        return "disconnected";
      default:
        return "disconnected";
    }
  }

  // =============================================
  // CONNECTION METHODS
  // =============================================

  async connect(): Promise<void> {
    if (this.client.status === "ready") return;

    return new Promise((resolve, reject) => {
      const onReady = () => {
        this.client.off("error", onError);
        resolve();
      };

      const onError = (err: Error) => {
        this.client.off("ready", onReady);
        reject(err);
      };

      if (this.client.status === "ready") {
        resolve();
      } else {
        this.client.once("ready", onReady);
        this.client.once("error", onError);
      }
    });
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  isConnected(): boolean {
    return this.client.status === "ready";
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  // =============================================
  // STRING OPERATIONS
  // =============================================

  async set(
    key: string,
    value: string,
    options?: CacheSetOptions,
  ): Promise<"OK" | null> {
    const args: (string | number)[] = [key, value];

    if (options?.ex) {
      args.push("EX", options.ex);
    } else if (options?.px) {
      args.push("PX", options.px);
    }

    if (options?.nx) {
      args.push("NX");
    } else if (options?.xx) {
      args.push("XX");
    }

    if (options?.keepTtl) {
      args.push("KEEPTTL");
    }

    this.recordOperation("SET");
    const result = (await this.client.call("SET", ...args)) as "OK" | null;
    return result;
  }

  async get(key: string): Promise<string | null> {
    this.recordOperation("GET");
    return this.client.get(key);
  }

  async mset(keyValues: Record<string, string>): Promise<"OK"> {
    const args: string[] = [];
    for (const [key, value] of Object.entries(keyValues)) {
      args.push(key, value);
    }
    this.recordOperation("MSET");
    return this.client.mset(...args);
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    this.recordOperation("MGET");
    return this.client.mget(...keys);
  }

  async incr(key: string): Promise<number> {
    this.recordOperation("INCR");
    return this.client.incr(key);
  }

  async incrby(key: string, increment: number): Promise<number> {
    this.recordOperation("INCRBY");
    return this.client.incrby(key, increment);
  }

  async decr(key: string): Promise<number> {
    this.recordOperation("DECR");
    return this.client.decr(key);
  }

  async decrby(key: string, decrement: number): Promise<number> {
    this.recordOperation("DECRBY");
    return this.client.decrby(key, decrement);
  }

  // =============================================
  // HASH OPERATIONS
  // =============================================

  async hset(key: string, field: string, value: string): Promise<number> {
    this.recordOperation("HSET");
    return this.client.hset(key, field, value);
  }

  async hmset(
    key: string,
    fieldValues: Record<string, string | number>,
  ): Promise<"OK"> {
    this.recordOperation("HMSET");
    return this.client.hmset(key, fieldValues);
  }

  async hget(key: string, field: string): Promise<string | null> {
    this.recordOperation("HGET");
    return this.client.hget(key, field);
  }

  async hmget(key: string, fields: string[]): Promise<(string | null)[]> {
    this.recordOperation("HMGET");
    return this.client.hmget(key, ...fields);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    this.recordOperation("HGETALL");
    return this.client.hgetall(key);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    this.recordOperation("HDEL");
    return this.client.hdel(key, ...fields);
  }

  async hexists(key: string, field: string): Promise<0 | 1> {
    this.recordOperation("HEXISTS");
    return (await this.client.hexists(key, field)) as 0 | 1;
  }

  async hincrby(
    key: string,
    field: string,
    increment: number,
  ): Promise<number> {
    this.recordOperation("HINCRBY");
    return this.client.hincrby(key, field, increment);
  }

  async hlen(key: string): Promise<number> {
    this.recordOperation("HLEN");
    return this.client.hlen(key);
  }

  // =============================================
  // LIST OPERATIONS
  // =============================================

  async lpush(key: string, ...values: string[]): Promise<number> {
    this.recordOperation("LPUSH");
    return this.client.lpush(key, ...values);
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    this.recordOperation("RPUSH");
    return this.client.rpush(key, ...values);
  }

  async lpop(key: string): Promise<string | null> {
    this.recordOperation("LPOP");
    return this.client.lpop(key);
  }

  async rpop(key: string): Promise<string | null> {
    this.recordOperation("RPOP");
    return this.client.rpop(key);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    this.recordOperation("LRANGE");
    return this.client.lrange(key, start, stop);
  }

  async llen(key: string): Promise<number> {
    this.recordOperation("LLEN");
    return this.client.llen(key);
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK"> {
    this.recordOperation("LTRIM");
    return this.client.ltrim(key, start, stop);
  }

  async lindex(key: string, index: number): Promise<string | null> {
    this.recordOperation("LINDEX");
    return this.client.lindex(key, index);
  }

  // =============================================
  // SET OPERATIONS
  // =============================================

  async sadd(key: string, ...members: string[]): Promise<number> {
    this.recordOperation("SADD");
    return this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    this.recordOperation("SREM");
    return this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    this.recordOperation("SMEMBERS");
    return this.client.smembers(key);
  }

  async sismember(key: string, member: string): Promise<0 | 1> {
    this.recordOperation("SISMEMBER");
    return (await this.client.sismember(key, member)) as 0 | 1;
  }

  async scard(key: string): Promise<number> {
    this.recordOperation("SCARD");
    return this.client.scard(key);
  }

  async sinter(...keys: string[]): Promise<string[]> {
    this.recordOperation("SINTER");
    return this.client.sinter(...keys);
  }

  async sunion(...keys: string[]): Promise<string[]> {
    this.recordOperation("SUNION");
    return this.client.sunion(...keys);
  }

  async sdiff(...keys: string[]): Promise<string[]> {
    this.recordOperation("SDIFF");
    return this.client.sdiff(...keys);
  }

  // =============================================
  // SORTED SET OPERATIONS
  // =============================================

  async zadd(
    key: string,
    scoreMembers: Array<{ score: number; member: string }>,
    options?: { nx?: boolean; xx?: boolean; gt?: boolean; lt?: boolean },
  ): Promise<number> {
    this.recordOperation("ZADD");

    const args: (string | number)[] = [key];

    if (options?.nx) args.push("NX");
    if (options?.xx) args.push("XX");
    if (options?.gt) args.push("GT");
    if (options?.lt) args.push("LT");

    for (const { score, member } of scoreMembers) {
      args.push(score, member);
    }

    return this.client.call("ZADD", ...args) as Promise<number>;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    this.recordOperation("ZREM");
    return this.client.zrem(key, ...members);
  }

  async zscore(key: string, member: string): Promise<string | null> {
    this.recordOperation("ZSCORE");
    return this.client.zscore(key, member);
  }

  async zrank(key: string, member: string): Promise<number | null> {
    this.recordOperation("ZRANK");
    return this.client.zrank(key, member);
  }

  async zrevrank(key: string, member: string): Promise<number | null> {
    this.recordOperation("ZREVRANK");
    return this.client.zrevrank(key, member);
  }

  async zrange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | Array<{ member: string; score: number }>> {
    this.recordOperation("ZRANGE");

    if (options?.withScores) {
      const result = await this.client.zrange(key, start, stop, "WITHSCORES");
      const parsed: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < result.length; i += 2) {
        parsed.push({
          member: result[i]!,
          score: parseFloat(result[i + 1]!),
        });
      }
      return parsed;
    }

    return this.client.zrange(key, start, stop);
  }

  async zrevrange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | Array<{ member: string; score: number }>> {
    this.recordOperation("ZREVRANGE");

    if (options?.withScores) {
      const result = await this.client.zrevrange(
        key,
        start,
        stop,
        "WITHSCORES",
      );
      const parsed: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < result.length; i += 2) {
        parsed.push({
          member: result[i]!,
          score: parseFloat(result[i + 1]!),
        });
      }
      return parsed;
    }

    return this.client.zrevrange(key, start, stop);
  }

  async zcard(key: string): Promise<number> {
    this.recordOperation("ZCARD");
    return this.client.zcard(key);
  }

  async zcount(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<number> {
    this.recordOperation("ZCOUNT");
    return this.client.zcount(key, min, max);
  }

  async zincrby(
    key: string,
    increment: number,
    member: string,
  ): Promise<string> {
    this.recordOperation("ZINCRBY");
    return this.client.zincrby(key, increment, member);
  }

  async zremrangebyrank(
    key: string,
    start: number,
    stop: number,
  ): Promise<number> {
    this.recordOperation("ZREMRANGEBYRANK");
    return this.client.zremrangebyrank(key, start, stop);
  }

  async zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<number> {
    this.recordOperation("ZREMRANGEBYSCORE");
    return this.client.zremrangebyscore(key, min, max);
  }

  async zrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | Array<{ member: string; score: number }>> {
    this.recordOperation("ZRANGEBYSCORE");

    const args: (string | number)[] = [key, String(min), String(max)];
    if (options?.withScores) args.push("WITHSCORES");
    if (options?.limit) {
      args.push("LIMIT", options.limit.offset, options.limit.count);
    }

    const result = await this.client.zrangebyscore(
      ...(args as [string, string, string]),
    );

    if (options?.withScores) {
      const parsed: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < result.length; i += 2) {
        parsed.push({
          member: result[i]!,
          score: parseFloat(result[i + 1]!),
        });
      }
      return parsed;
    }

    return result;
  }

  async zrevrangebyscore(
    key: string,
    max: number | string,
    min: number | string,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | Array<{ member: string; score: number }>> {
    this.recordOperation("ZREVRANGEBYSCORE");

    const args: (string | number)[] = [key, String(max), String(min)];
    if (options?.withScores) args.push("WITHSCORES");
    if (options?.limit) {
      args.push("LIMIT", options.limit.offset, options.limit.count);
    }

    const result = await this.client.zrevrangebyscore(
      ...(args as [string, string, string]),
    );

    if (options?.withScores) {
      const parsed: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < result.length; i += 2) {
        parsed.push({
          member: result[i]!,
          score: parseFloat(result[i + 1]!),
        });
      }
      return parsed;
    }

    return result;
  }

  // =============================================
  // KEY MANAGEMENT
  // =============================================

  async del(...keys: string[]): Promise<number> {
    this.recordOperation("DEL");
    return this.client.del(...keys);
  }

  async exists(...keys: string[]): Promise<number> {
    this.recordOperation("EXISTS");
    return this.client.exists(...keys);
  }

  async expire(key: string, seconds: number): Promise<0 | 1> {
    this.recordOperation("EXPIRE");
    return (await this.client.expire(key, seconds)) as 0 | 1;
  }

  async expireat(key: string, timestamp: number): Promise<0 | 1> {
    this.recordOperation("EXPIREAT");
    return (await this.client.expireat(key, timestamp)) as 0 | 1;
  }

  async ttl(key: string): Promise<number> {
    this.recordOperation("TTL");
    return this.client.ttl(key);
  }

  async pttl(key: string): Promise<number> {
    this.recordOperation("PTTL");
    return this.client.pttl(key);
  }

  async persist(key: string): Promise<0 | 1> {
    this.recordOperation("PERSIST");
    return (await this.client.persist(key)) as 0 | 1;
  }

  async rename(key: string, newKey: string): Promise<"OK"> {
    this.recordOperation("RENAME");
    return this.client.rename(key, newKey);
  }

  async type(key: string): Promise<string> {
    this.recordOperation("TYPE");
    return this.client.type(key);
  }

  async keys(pattern: string): Promise<string[]> {
    this.recordOperation("KEYS");
    return this.client.keys(pattern);
  }

  async scan(
    cursor: number,
    options?: CacheScanOptions,
  ): Promise<{ cursor: number; keys: string[] }> {
    this.recordOperation("SCAN");

    const args: (string | number)[] = [cursor];

    if (options?.match) {
      args.push("MATCH", options.match);
    }

    if (options?.count) {
      args.push("COUNT", options.count);
    }

    if (options?.type) {
      args.push("TYPE", options.type.toLowerCase());
    }

    const [nextCursor, keys] = (await this.client.call("SCAN", ...args)) as [
      string,
      string[],
    ];

    return {
      cursor: parseInt(nextCursor, 10),
      keys,
    };
  }

  // =============================================
  // HYPERLOGLOG OPERATIONS
  // =============================================

  async pfadd(key: string, ...elements: string[]): Promise<0 | 1> {
    this.recordOperation("PFADD");
    return (await this.client.pfadd(key, ...elements)) as 0 | 1;
  }

  async pfcount(...keys: string[]): Promise<number> {
    this.recordOperation("PFCOUNT");
    return this.client.pfcount(...keys);
  }

  async pfmerge(destKey: string, ...sourceKeys: string[]): Promise<"OK"> {
    this.recordOperation("PFMERGE");
    return this.client.pfmerge(destKey, ...sourceKeys);
  }

  // =============================================
  // SCRIPTING
  // =============================================

  async executeScript<TResult>(
    script: ScriptDefinition<any, any, TResult>,
    keys: string[],
    args: (string | number)[],
  ): Promise<TResult> {
    this.recordOperation("EVAL");

    // Try EVALSHA first if we have the hash
    let hash = script.hash || this.scriptHashes.get(script.script);

    if (hash && this.config.cacheScripts) {
      try {
        const result = await this.client.evalsha(
          hash,
          keys.length,
          ...keys,
          ...args.map(String),
        );

        return script.parseResult
          ? script.parseResult(result)
          : (result as TResult);
      } catch (error) {
        // Script not loaded, fall through to EVAL
        if (!(error as Error).message.includes("NOSCRIPT")) {
          throw error;
        }
      }
    }

    // Fall back to EVAL
    const result = await this.client.eval(
      script.script,
      keys.length,
      ...keys,
      ...args.map(String),
    );

    // Cache the hash for future calls
    if (this.config.cacheScripts) {
      hash = await this.loadScript(script.script);
      this.scriptHashes.set(script.script, hash);
      script.hash = hash;
    }

    return script.parseResult
      ? script.parseResult(result)
      : (result as TResult);
  }

  async loadScript(script: string): Promise<string> {
    this.recordOperation("SCRIPT");
    return this.client.script("LOAD", script) as Promise<string>;
  }

  // =============================================
  // PIPELINE & TRANSACTIONS
  // =============================================

  async executePipeline(entries: AnyPipelineEntry[]): Promise<PipelineResult> {
    const startTime = Date.now();
    const pipeline = this.client.pipeline();

    // Add all operations to pipeline
    for (const { operation, params } of entries) {
      const args = operation.buildArgs(params);
      const method = operation.command.toLowerCase();
      const pipelineWithMethods = pipeline as unknown as Record<
        string,
        (...args: unknown[]) => typeof pipeline
      >;
      if (typeof pipelineWithMethods[method] === "function") {
        pipelineWithMethods[method](...args);
      }
    }

    try {
      const rawResults = await pipeline.exec();

      if (!rawResults) {
        return {
          success: false,
          results: entries.map(() => ({
            success: false,
            error: new Error("Pipeline returned null"),
          })),
          executionTimeMs: Date.now() - startTime,
        };
      }

      const results = rawResults.map((result, index) => {
        const [error, value] = result;
        const operation = entries[index]!.operation;

        if (error) {
          return {
            success: false,
            error: error as Error,
          };
        }

        return {
          success: true,
          data: operation.parseResult ? operation.parseResult(value) : value,
        };
      });

      return {
        success: results.every((r) => r.success),
        results,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        results: entries.map(() => ({
          success: false,
          error: error as Error,
        })),
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  async executeTransaction(
    entries: AnyPipelineEntry[],
  ): Promise<TransactionResult> {
    const startTime = Date.now();
    const multi = this.client.multi();

    // Add all operations to transaction
    for (const { operation, params } of entries) {
      const args = operation.buildArgs(params);
      const method = operation.command.toLowerCase();
      const multiWithMethods = multi as unknown as Record<
        string,
        (...args: unknown[]) => typeof multi
      >;
      if (typeof multiWithMethods[method] === "function") {
        multiWithMethods[method](...args);
      }
    }

    try {
      const rawResults = await multi.exec();

      if (!rawResults) {
        return {
          success: false,
          committed: false,
          error: new Error("Transaction aborted"),
          executionTimeMs: Date.now() - startTime,
        };
      }

      const results = rawResults.map((result, index) => {
        const [error, value] = result;
        if (error) throw error;

        const operation = entries[index]!.operation;
        return operation.parseResult ? operation.parseResult(value) : value;
      });

      return {
        success: true,
        committed: true,
        results,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        committed: false,
        error: error as Error,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  // =============================================
  // PUB/SUB
  // =============================================

  async publish(channel: string, message: string): Promise<number> {
    this.recordOperation("PUBLISH");
    return this.client.publish(channel, message);
  }

  async subscribe(
    channel: string,
    callback: (message: string, channel: string) => void,
  ): Promise<void> {
    await this.client.subscribe(channel);
    this.client.on("message", (ch, msg) => {
      if (ch === channel) {
        callback(msg, ch);
      }
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.client.unsubscribe(channel);
  }

  // =============================================
  // METRICS
  // =============================================

  getMetrics(): ExecutorMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      totalExecutionTimeMs: 0,
      avgExecutionTimeMs: 0,
      operationCounts: {},
    };
  }

  async getStats(): Promise<CacheStats> {
    const stats: CacheStats = {
      hits: this.metrics.successfulOperations,
      misses: this.metrics.failedOperations,
      hitRate:
        this.metrics.totalOperations > 0
          ? this.metrics.successfulOperations / this.metrics.totalOperations
          : 0,
      size: 0,
      avgLatencyMs: this.metrics.avgExecutionTimeMs,
    };

    return stats;
  }
  // =============================================
  // STREAM OPERATIONS
  // =============================================

  async xadd(
    key: string,
    id: string | "*",
    fields: Record<string, string>,
  ): Promise<string> {
    this.recordOperation("XADD");
    return this.client.xadd(
      key,
      id,
      ...Object.entries(fields).flat(),
    ) as Promise<string>;
  }

  async xread(options: {
    streams: string[];
    ids: string[];
    count?: number;
    block?: number;
  }): Promise<Array<{
    stream: string;
    messages: Array<{ id: string; fields: Record<string, string> }>;
  }> | null> {
    this.recordOperation("XREAD");

    const args: (string | number)[] = [];

    if (options.count !== undefined) {
      args.push("COUNT", options.count);
    }

    if (options.block !== undefined) {
      args.push("BLOCK", options.block);
    }

    args.push("STREAMS", ...options.streams, ...options.ids);

    const result = (await this.client.call("XREAD", ...args)) as Array<
      [string, Array<[string, string[]]>]
    > | null;

    if (!result) return null;

    return result.map((streamData: any) => ({
      stream: streamData[0],
      messages: streamData[1].map((msg: any) => ({
        id: msg[0],
        fields: this.parseStreamFields(msg[1]),
      })),
    }));
  }

  async xrange(
    key: string,
    start: string,
    end: string,
    count?: number,
  ): Promise<Array<{ id: string; fields: Record<string, string> }>> {
    this.recordOperation("XRANGE");

    const args: (string | number)[] = [key, start, end];
    if (count !== undefined) {
      args.push("COUNT", count);
    }

    const result = (await this.client.call("XRANGE", ...args)) as Array<
      [string, string[]]
    >;

    return result.map((msg: [string, string[]]) => ({
      id: msg[0],
      fields: this.parseStreamFields(msg[1]),
    }));
  }

  async xrevrange(
    key: string,
    end: string,
    start: string,
    count?: number,
  ): Promise<Array<{ id: string; fields: Record<string, string> }>> {
    this.recordOperation("XREVRANGE");

    const args: (string | number)[] = [key, end, start];
    if (count !== undefined) {
      args.push("COUNT", count);
    }

    const result = (await this.client.call("XREVRANGE", ...args)) as Array<
      [string, string[]]
    >;

    return result.map((msg: [string, string[]]) => ({
      id: msg[0],
      fields: this.parseStreamFields(msg[1]),
    }));
  }

  async xlen(key: string): Promise<number> {
    this.recordOperation("XLEN");
    return this.client.xlen(key);
  }

  async xtrim(
    key: string,
    strategy: "MAXLEN" | "MINID",
    threshold: number | string,
    approximate?: boolean,
  ): Promise<number> {
    this.recordOperation("XTRIM");

    const args: (string | number)[] = [key, strategy];

    if (approximate) {
      args.push("~");
    }

    args.push(threshold);

    return this.client.call("XTRIM", ...args) as Promise<number>;
  }

  async xdel(key: string, ...ids: string[]): Promise<number> {
    this.recordOperation("XDEL");
    return this.client.xdel(key, ...ids);
  }

  // =============================================
  // BLOOM FILTER OPERATIONS
  // =============================================

  async bfReserve(
    key: string,
    errorRate: number,
    capacity: number,
  ): Promise<"OK"> {
    this.recordOperation("BF.RESERVE");
    const result = await this.client.call(
      "BF.RESERVE",
      key,
      errorRate,
      capacity,
    );
    return result as "OK";
  }

  async bfAdd(key: string, item: string): Promise<0 | 1> {
    this.recordOperation("BF.ADD");
    return this.client.call("BF.ADD", key, item) as Promise<0 | 1>;
  }

  async bfMAdd(key: string, ...items: string[]): Promise<Array<0 | 1>> {
    this.recordOperation("BF.MADD");
    const result = await this.client.call("BF.MADD", key, ...items);
    return result as Array<0 | 1>;
  }

  async bfExists(key: string, item: string): Promise<0 | 1> {
    this.recordOperation("BF.EXISTS");
    return this.client.call("BF.EXISTS", key, item) as Promise<0 | 1>;
  }

  async bfMExists(key: string, ...items: string[]): Promise<Array<0 | 1>> {
    this.recordOperation("BF.MEXISTS");
    const result = await this.client.call("BF.MEXISTS", key, ...items);
    return result as Array<0 | 1>;
  }

  // =============================================
  // PRIVATE HELPERS
  // =============================================

  private parseStreamFields(fields: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      result[fields[i]!] = fields[i + 1]!;
    }
    return result;
  }

  // =============================================
  // PRIVATE HELPERS
  // =============================================

  private recordOperation(command: string): void {
    if (!this.config.enableMetrics) return;

    this.metrics.totalOperations++;
    this.metrics.successfulOperations++;
    this.metrics.operationCounts[command] =
      (this.metrics.operationCounts[command] ?? 0) + 1;
  }

  /**
   * Get the underlying Redis client
   */
  getClient(): Redis {
    return this.client;
  }
}

// =============================================
// FACTORY FUNCTION
// =============================================

/**
 * Create a Redis adapter
 */
export function createRedisAdapter(config: RedisAdapterConfig): RedisAdapter {
  return new RedisAdapter(config);
}
