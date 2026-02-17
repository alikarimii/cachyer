// =============================================
// CACHYER - MEMORY ADAPTER
// =============================================
// In-memory adapter for testing and development
// =============================================

import type {
  AdapterConfig,
  CacheAdapter,
  CacheLogger,
  ConnectionStatus,
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
  TransactionResult,
} from "../../types/operation.types";

/**
 * Memory adapter configuration
 */
export interface MemoryAdapterConfig extends AdapterConfig {
  /** Maximum entries in cache */
  maxEntries?: number;

  /** Check interval for TTL expiration (ms) */
  checkInterval?: number;
}

/**
 * Internal cache entry
 */
interface CacheEntry {
  value: any;
  expiresAt?: number;
  type: "string" | "list" | "set" | "zset" | "hash";
}

/**
 * In-memory adapter implementation
 */
export class MemoryAdapter implements CacheAdapter {
  readonly name = "memory";
  private readonly store: Map<string, CacheEntry> = new Map();
  private readonly config: Required<Omit<MemoryAdapterConfig, never>>;
  private readonly logger: CacheLogger;
  private checkIntervalId?: NodeJS.Timeout;
  private _status: ConnectionStatus = "disconnected";
  private metrics: ExecutorMetrics = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    totalExecutionTimeMs: 0,
    avgExecutionTimeMs: 0,
    operationCounts: {},
  };

  constructor(options?: MemoryAdapterConfig) {
    this.config = {
      keyPrefix: options?.keyPrefix ?? "",
      defaultTtl: options?.defaultTtl ?? 3600,
      logger: options?.logger ?? defaultLogger,
      defaultOptions: options?.defaultOptions ?? {},
      enableMetrics: options?.enableMetrics ?? true,
      maxEntries: options?.maxEntries ?? 10000,
      checkInterval: options?.checkInterval ?? 1000,
    };
    this.logger = this.config.logger;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  // =============================================
  // CONNECTION METHODS
  // =============================================

  async connect(): Promise<void> {
    this._status = "ready";
    this.logger.info("Connected to memory cache", { adapter: this.name });

    // Start TTL check interval
    if (this.config.checkInterval > 0) {
      this.checkIntervalId = setInterval(() => {
        this.cleanExpired();
      }, this.config.checkInterval);
    }
  }

  async disconnect(): Promise<void> {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
    }
    this.store.clear();
    this._status = "disconnected";
    this.logger.info("Disconnected from memory cache");
  }

  isConnected(): boolean {
    return this._status === "ready";
  }

  async ping(): Promise<boolean> {
    return this._status === "ready";
  }

  // =============================================
  // STRING OPERATIONS
  // =============================================

  async set(
    key: string,
    value: string,
    options?: CacheSetOptions,
  ): Promise<"OK" | null> {
    this.recordOperation("SET");

    const existing = this.store.get(key);

    if (options?.nx && existing) return null;
    if (options?.xx && !existing) return null;

    let expiresAt: number | undefined;

    if (options?.ex) {
      expiresAt = Date.now() + options.ex * 1000;
    } else if (options?.px) {
      expiresAt = Date.now() + options.px;
    } else if (options?.keepTtl && existing?.expiresAt) {
      expiresAt = existing.expiresAt;
    }

    this.store.set(key, { value, expiresAt, type: "string" });
    this.evictIfNeeded();
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    this.recordOperation("GET");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "string") return null;
    return entry.value as string;
  }

  async mset(keyValues: Record<string, string>): Promise<"OK"> {
    this.recordOperation("MSET");
    for (const [key, value] of Object.entries(keyValues)) {
      this.store.set(key, { value, type: "string" });
    }
    return "OK";
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    this.recordOperation("MGET");
    return keys.map((key) => {
      const entry = this.getEntry(key);
      if (!entry || entry.type !== "string") return null;
      return entry.value as string;
    });
  }

  async incr(key: string): Promise<number> {
    return this.incrby(key, 1);
  }

  async incrby(key: string, increment: number): Promise<number> {
    this.recordOperation("INCRBY");
    const entry = this.getEntry(key);
    const current = entry ? parseInt(entry.value, 10) || 0 : 0;
    const newValue = current + increment;
    this.store.set(key, {
      value: String(newValue),
      expiresAt: entry?.expiresAt,
      type: "string",
    });
    return newValue;
  }

  async decr(key: string): Promise<number> {
    return this.incrby(key, -1);
  }

  async decrby(key: string, decrement: number): Promise<number> {
    return this.incrby(key, -decrement);
  }

  // =============================================
  // HASH OPERATIONS
  // =============================================

  async hset(key: string, field: string, value: string): Promise<number> {
    this.recordOperation("HSET");
    const entry = this.getEntry(key);
    const hash: Record<string, string> =
      entry?.type === "hash" ? entry.value : {};
    const isNew = !(field in hash);
    hash[field] = value;
    this.store.set(key, {
      value: hash,
      expiresAt: entry?.expiresAt,
      type: "hash",
    });
    return isNew ? 1 : 0;
  }

  async hmset(
    key: string,
    fieldValues: Record<string, string | number>,
  ): Promise<"OK"> {
    this.recordOperation("HMSET");
    const entry = this.getEntry(key);
    const hash: Record<string, string> =
      entry?.type === "hash" ? entry.value : {};
    for (const [field, value] of Object.entries(fieldValues)) {
      hash[field] = String(value);
    }
    this.store.set(key, {
      value: hash,
      expiresAt: entry?.expiresAt,
      type: "hash",
    });
    return "OK";
  }

  async hget(key: string, field: string): Promise<string | null> {
    this.recordOperation("HGET");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "hash") return null;
    return entry.value[field] ?? null;
  }

  async hmget(key: string, fields: string[]): Promise<(string | null)[]> {
    this.recordOperation("HMGET");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "hash") return fields.map(() => null);
    return fields.map((f) => entry.value[f] ?? null);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    this.recordOperation("HGETALL");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "hash") return {};
    return { ...entry.value };
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    this.recordOperation("HDEL");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "hash") return 0;
    let deleted = 0;
    for (const field of fields) {
      if (field in entry.value) {
        delete entry.value[field];
        deleted++;
      }
    }
    return deleted;
  }

  async hexists(key: string, field: string): Promise<0 | 1> {
    this.recordOperation("HEXISTS");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "hash") return 0;
    return field in entry.value ? 1 : 0;
  }

  async hincrby(
    key: string,
    field: string,
    increment: number,
  ): Promise<number> {
    this.recordOperation("HINCRBY");
    const entry = this.getEntry(key);
    const hash: Record<string, string> =
      entry?.type === "hash" ? entry.value : {};
    const current = parseInt(hash[field] || "0", 10);
    const newValue = current + increment;
    hash[field] = String(newValue);
    this.store.set(key, {
      value: hash,
      expiresAt: entry?.expiresAt,
      type: "hash",
    });
    return newValue;
  }

  async hlen(key: string): Promise<number> {
    this.recordOperation("HLEN");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "hash") return 0;
    return Object.keys(entry.value).length;
  }

  // =============================================
  // LIST OPERATIONS
  // =============================================

  async lpush(key: string, ...values: string[]): Promise<number> {
    this.recordOperation("LPUSH");
    const entry = this.getEntry(key);
    const list: string[] = entry?.type === "list" ? entry.value : [];
    list.unshift(...values.reverse());
    this.store.set(key, {
      value: list,
      expiresAt: entry?.expiresAt,
      type: "list",
    });
    return list.length;
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    this.recordOperation("RPUSH");
    const entry = this.getEntry(key);
    const list: string[] = entry?.type === "list" ? entry.value : [];
    list.push(...values);
    this.store.set(key, {
      value: list,
      expiresAt: entry?.expiresAt,
      type: "list",
    });
    return list.length;
  }

  async lpop(key: string): Promise<string | null> {
    this.recordOperation("LPOP");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "list" || entry.value.length === 0)
      return null;
    return entry.value.shift();
  }

  async rpop(key: string): Promise<string | null> {
    this.recordOperation("RPOP");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "list" || entry.value.length === 0)
      return null;
    return entry.value.pop();
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    this.recordOperation("LRANGE");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "list") return [];
    const list = entry.value as string[];
    const normalizedStop = stop < 0 ? list.length + stop + 1 : stop + 1;
    return list.slice(start, normalizedStop);
  }

  async llen(key: string): Promise<number> {
    this.recordOperation("LLEN");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "list") return 0;
    return entry.value.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK"> {
    this.recordOperation("LTRIM");
    const entry = this.getEntry(key);
    if (entry && entry.type === "list") {
      const normalizedStop =
        stop < 0 ? entry.value.length + stop + 1 : stop + 1;
      entry.value = entry.value.slice(start, normalizedStop);
    }
    return "OK";
  }

  async lindex(key: string, index: number): Promise<string | null> {
    this.recordOperation("LINDEX");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "list") return null;
    const list = entry.value as string[];
    const normalizedIndex = index < 0 ? list.length + index : index;
    return list[normalizedIndex] ?? null;
  }

  // =============================================
  // SET OPERATIONS
  // =============================================

  async sadd(key: string, ...members: string[]): Promise<number> {
    this.recordOperation("SADD");
    const entry = this.getEntry(key);
    const set: Set<string> = entry?.type === "set" ? entry.value : new Set();
    const sizeBefore = set.size;
    for (const member of members) {
      set.add(member);
    }
    this.store.set(key, {
      value: set,
      expiresAt: entry?.expiresAt,
      type: "set",
    });
    return set.size - sizeBefore;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    this.recordOperation("SREM");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "set") return 0;
    let removed = 0;
    for (const member of members) {
      if (entry.value.delete(member)) removed++;
    }
    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    this.recordOperation("SMEMBERS");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "set") return [];
    return Array.from(entry.value);
  }

  async sismember(key: string, member: string): Promise<0 | 1> {
    this.recordOperation("SISMEMBER");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "set") return 0;
    return entry.value.has(member) ? 1 : 0;
  }

  async scard(key: string): Promise<number> {
    this.recordOperation("SCARD");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "set") return 0;
    return entry.value.size;
  }

  async sinter(...keys: string[]): Promise<string[]> {
    this.recordOperation("SINTER");
    const sets = keys
      .map((k) => this.getEntry(k))
      .filter((e): e is CacheEntry => e?.type === "set")
      .map((e) => e.value as Set<string>);

    if (sets.length === 0) return [];
    if (sets.length === 1) return Array.from(sets[0]!);

    const [first, ...rest] = sets;
    const result: string[] = [];
    for (const member of first!) {
      if (rest.every((s) => s.has(member))) {
        result.push(member);
      }
    }
    return result;
  }

  async sunion(...keys: string[]): Promise<string[]> {
    this.recordOperation("SUNION");
    const result = new Set<string>();
    for (const key of keys) {
      const entry = this.getEntry(key);
      if (entry?.type === "set") {
        for (const member of entry.value as Set<string>) {
          result.add(member);
        }
      }
    }
    return Array.from(result);
  }

  async sdiff(...keys: string[]): Promise<string[]> {
    this.recordOperation("SDIFF");
    const [firstKey, ...restKeys] = keys;
    const firstEntry = this.getEntry(firstKey!);
    if (!firstEntry || firstEntry.type !== "set") return [];

    const result = new Set(firstEntry.value as Set<string>);
    for (const key of restKeys) {
      const entry = this.getEntry(key);
      if (entry?.type === "set") {
        for (const member of entry.value as Set<string>) {
          result.delete(member);
        }
      }
    }
    return Array.from(result);
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
    const entry = this.getEntry(key);
    const zset: Map<string, number> =
      entry?.type === "zset" ? entry.value : new Map();
    let added = 0;

    for (const { score, member } of scoreMembers) {
      const existing = zset.get(member);
      const exists = existing !== undefined;

      if (options?.nx && exists) continue;
      if (options?.xx && !exists) continue;
      if (options?.gt && exists && score <= existing) continue;
      if (options?.lt && exists && score >= existing) continue;

      if (!exists) added++;
      zset.set(member, score);
    }

    this.store.set(key, {
      value: zset,
      expiresAt: entry?.expiresAt,
      type: "zset",
    });
    return added;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    this.recordOperation("ZREM");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "zset") return 0;
    let removed = 0;
    for (const member of members) {
      if (entry.value.delete(member)) removed++;
    }
    return removed;
  }

  async zscore(key: string, member: string): Promise<string | null> {
    this.recordOperation("ZSCORE");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "zset") return null;
    const score = entry.value.get(member);
    return score !== undefined ? String(score) : null;
  }

  async zrank(key: string, member: string): Promise<number | null> {
    this.recordOperation("ZRANK");
    const sorted = this.getSortedZSetEntries(key);
    const index = sorted.findIndex(([m]) => m === member);
    return index >= 0 ? index : null;
  }

  async zrevrank(key: string, member: string): Promise<number | null> {
    this.recordOperation("ZREVRANK");
    const sorted = this.getSortedZSetEntries(key).reverse();
    const index = sorted.findIndex(([m]) => m === member);
    return index >= 0 ? index : null;
  }

  async zrange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | Array<{ member: string; score: number }>> {
    this.recordOperation("ZRANGE");
    const sorted = this.getSortedZSetEntries(key);
    const normalizedStop = stop < 0 ? sorted.length + stop + 1 : stop + 1;
    const slice = sorted.slice(start, normalizedStop);

    if (options?.withScores) {
      return slice.map(([member, score]) => ({ member, score }));
    }
    return slice.map(([member]) => member);
  }

  async zrevrange(
    key: string,
    start: number,
    stop: number,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | Array<{ member: string; score: number }>> {
    this.recordOperation("ZREVRANGE");
    const sorted = this.getSortedZSetEntries(key).reverse();
    const normalizedStop = stop < 0 ? sorted.length + stop + 1 : stop + 1;
    const slice = sorted.slice(start, normalizedStop);

    if (options?.withScores) {
      return slice.map(([member, score]) => ({ member, score }));
    }
    return slice.map(([member]) => member);
  }

  async zcard(key: string): Promise<number> {
    this.recordOperation("ZCARD");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "zset") return 0;
    return entry.value.size;
  }

  async zcount(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<number> {
    this.recordOperation("ZCOUNT");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "zset") return 0;

    const minVal = min === "-inf" ? -Infinity : Number(min);
    const maxVal = max === "+inf" ? Infinity : Number(max);

    let count = 0;
    for (const score of entry.value.values()) {
      if (score >= minVal && score <= maxVal) count++;
    }
    return count;
  }

  async zincrby(
    key: string,
    increment: number,
    member: string,
  ): Promise<string> {
    this.recordOperation("ZINCRBY");
    const entry = this.getEntry(key);
    const zset: Map<string, number> =
      entry?.type === "zset" ? entry.value : new Map();
    const current = zset.get(member) ?? 0;
    const newScore = current + increment;
    zset.set(member, newScore);
    this.store.set(key, {
      value: zset,
      expiresAt: entry?.expiresAt,
      type: "zset",
    });
    return String(newScore);
  }

  async zremrangebyrank(
    key: string,
    start: number,
    stop: number,
  ): Promise<number> {
    this.recordOperation("ZREMRANGEBYRANK");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "zset") return 0;

    const sorted = this.getSortedZSetEntries(key);
    const normalizedStop = stop < 0 ? sorted.length + stop + 1 : stop + 1;
    const toRemove = sorted.slice(start, normalizedStop);

    for (const [member] of toRemove) {
      entry.value.delete(member);
    }
    return toRemove.length;
  }

  async zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<number> {
    this.recordOperation("ZREMRANGEBYSCORE");
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "zset") return 0;

    const minVal = min === "-inf" ? -Infinity : Number(min);
    const maxVal = max === "+inf" ? Infinity : Number(max);

    const toRemove: string[] = [];
    for (const [member, score] of entry.value) {
      if (score >= minVal && score <= maxVal) {
        toRemove.push(member);
      }
    }

    for (const member of toRemove) {
      entry.value.delete(member);
    }
    return toRemove.length;
  }

  async zrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | Array<{ member: string; score: number }>> {
    this.recordOperation("ZRANGEBYSCORE");
    const sorted = this.getSortedZSetEntries(key);
    const { minVal, minExclusive } = this.parseScoreBound(min);
    const { minVal: maxVal, minExclusive: maxExclusive } =
      this.parseScoreBound(max);

    let filtered = sorted.filter(([, score]) => {
      const aboveMin = minExclusive ? score > minVal : score >= minVal;
      const belowMax = maxExclusive ? score < maxVal : score <= maxVal;
      return aboveMin && belowMax;
    });

    if (options?.limit) {
      filtered = filtered.slice(
        options.limit.offset,
        options.limit.offset + options.limit.count,
      );
    }

    if (options?.withScores) {
      return filtered.map(([member, score]) => ({ member, score }));
    }
    return filtered.map(([member]) => member);
  }

  async zrevrangebyscore(
    key: string,
    max: number | string,
    min: number | string,
    options?: SortedSetRangeOptions,
  ): Promise<string[] | Array<{ member: string; score: number }>> {
    this.recordOperation("ZREVRANGEBYSCORE");
    const sorted = this.getSortedZSetEntries(key).reverse();
    const { minVal, minExclusive } = this.parseScoreBound(min);
    const { minVal: maxVal, minExclusive: maxExclusive } =
      this.parseScoreBound(max);

    let filtered = sorted.filter(([, score]) => {
      const aboveMin = minExclusive ? score > minVal : score >= minVal;
      const belowMax = maxExclusive ? score < maxVal : score <= maxVal;
      return aboveMin && belowMax;
    });

    if (options?.limit) {
      filtered = filtered.slice(
        options.limit.offset,
        options.limit.offset + options.limit.count,
      );
    }

    if (options?.withScores) {
      return filtered.map(([member, score]) => ({ member, score }));
    }
    return filtered.map(([member]) => member);
  }

  private parseScoreBound(bound: number | string): {
    minVal: number;
    minExclusive: boolean;
  } {
    const str = String(bound);
    if (str === "-inf") return { minVal: -Infinity, minExclusive: false };
    if (str === "+inf") return { minVal: Infinity, minExclusive: false };
    if (str.startsWith("(")) {
      return { minVal: Number(str.slice(1)), minExclusive: true };
    }
    return { minVal: Number(str), minExclusive: false };
  }

  // =============================================
  // KEY MANAGEMENT
  // =============================================

  async del(...keys: string[]): Promise<number> {
    this.recordOperation("DEL");
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted++;
    }
    return deleted;
  }

  async exists(...keys: string[]): Promise<number> {
    this.recordOperation("EXISTS");
    let count = 0;
    for (const key of keys) {
      if (this.getEntry(key)) count++;
    }
    return count;
  }

  async expire(key: string, seconds: number): Promise<0 | 1> {
    this.recordOperation("EXPIRE");
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async expireat(key: string, timestamp: number): Promise<0 | 1> {
    this.recordOperation("EXPIREAT");
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = timestamp * 1000;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    this.recordOperation("TTL");
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async pttl(key: string): Promise<number> {
    this.recordOperation("PTTL");
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? remaining : -2;
  }

  async persist(key: string): Promise<0 | 1> {
    this.recordOperation("PERSIST");
    const entry = this.store.get(key);
    if (!entry || !entry.expiresAt) return 0;
    delete entry.expiresAt;
    return 1;
  }

  async rename(key: string, newKey: string): Promise<"OK"> {
    this.recordOperation("RENAME");
    const entry = this.store.get(key);
    if (!entry) throw new Error(`ERR no such key: ${key}`);
    this.store.delete(key);
    this.store.set(newKey, entry);
    return "OK";
  }

  async type(key: string): Promise<string> {
    this.recordOperation("TYPE");
    const entry = this.getEntry(key);
    if (!entry) return "none";
    return entry.type;
  }

  async keys(pattern: string): Promise<string[]> {
    this.recordOperation("KEYS");
    const regex = this.patternToRegex(pattern);
    const result: string[] = [];
    for (const key of this.store.keys()) {
      if (regex.test(key) && this.getEntry(key)) {
        result.push(key);
      }
    }
    return result;
  }

  async scan(
    cursor: number,
    options?: CacheScanOptions,
  ): Promise<{ cursor: number; keys: string[] }> {
    this.recordOperation("SCAN");
    const allKeys = await this.keys(options?.match ?? "*");
    const count = options?.count ?? 10;
    const start = cursor;
    const end = Math.min(start + count, allKeys.length);
    const keys = allKeys.slice(start, end);
    const nextCursor = end >= allKeys.length ? 0 : end;

    return { cursor: nextCursor, keys };
  }

  // =============================================
  // HYPERLOGLOG OPERATIONS (Simulated)
  // =============================================

  async pfadd(key: string, ...elements: string[]): Promise<0 | 1> {
    this.recordOperation("PFADD");
    // Use a Set to simulate HyperLogLog
    const entry = this.getEntry(key);
    const set: Set<string> = entry?.type === "set" ? entry.value : new Set();
    const sizeBefore = set.size;
    for (const el of elements) {
      set.add(el);
    }
    this.store.set(key, {
      value: set,
      expiresAt: entry?.expiresAt,
      type: "set",
    });
    return set.size > sizeBefore ? 1 : 0;
  }

  async pfcount(...keys: string[]): Promise<number> {
    this.recordOperation("PFCOUNT");
    const combined = new Set<string>();
    for (const key of keys) {
      const entry = this.getEntry(key);
      if (entry?.type === "set") {
        for (const el of entry.value) {
          combined.add(el);
        }
      }
    }
    return combined.size;
  }

  async pfmerge(destKey: string, ...sourceKeys: string[]): Promise<"OK"> {
    this.recordOperation("PFMERGE");
    const combined = new Set<string>();
    for (const key of sourceKeys) {
      const entry = this.getEntry(key);
      if (entry?.type === "set") {
        for (const el of entry.value) {
          combined.add(el);
        }
      }
    }
    this.store.set(destKey, { value: combined, type: "set" });
    return "OK";
  }

  // =============================================
  // PIPELINE & TRANSACTIONS
  // =============================================

  async executePipeline(entries: AnyPipelineEntry[]): Promise<PipelineResult> {
    const startTime = Date.now();
    const results: Array<{ success: boolean; data?: any; error?: Error }> = [];

    for (const entry of entries) {
      try {
        const args = entry.operation.buildArgs(entry.params);
        const methodName = entry.operation.command.toLowerCase();
        const method = (this as any)[methodName];

        if (!method) {
          results.push({
            success: false,
            error: new Error(`Unknown command: ${entry.operation.command}`),
          });
          continue;
        }

        const result = await method.call(this, ...args);
        const parsed = entry.operation.parseResult
          ? entry.operation.parseResult(result)
          : result;
        results.push({ success: true, data: parsed });
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

  async executeTransaction(
    entries: AnyPipelineEntry[],
  ): Promise<TransactionResult> {
    // In-memory adapter doesn't need real transactions
    const result = await this.executePipeline(entries);
    return {
      success: result.success,
      committed: result.success,
      results: result.results.map((r) => r.data),
      executionTimeMs: result.executionTimeMs,
    };
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
    return {
      hits: this.metrics.successfulOperations,
      misses: this.metrics.failedOperations,
      hitRate:
        this.metrics.totalOperations > 0
          ? this.metrics.successfulOperations / this.metrics.totalOperations
          : 0,
      size: this.store.size,
      avgLatencyMs: this.metrics.avgExecutionTimeMs,
    };
  }

  // =============================================
  // PRIVATE HELPERS
  // =============================================

  private getEntry(key: string): CacheEntry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry;
  }

  private getSortedZSetEntries(key: string): Array<[string, number]> {
    const entry = this.getEntry(key);
    if (!entry || entry.type !== "zset") return [];
    const zset = entry.value as Map<string, number>;
    return Array.from(zset.entries()).sort((a, b) => a[1] - b[1]);
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  private evictIfNeeded(): void {
    if (this.store.size <= this.config.maxEntries) return;

    // Simple LRU-like eviction: remove oldest entries
    const toRemove = this.store.size - this.config.maxEntries;
    const keys = Array.from(this.store.keys()).slice(0, toRemove);
    for (const key of keys) {
      this.store.delete(key);
    }
  }

  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`);
  }

  private recordOperation(command: string): void {
    if (!this.config.enableMetrics) return;
    this.metrics.totalOperations++;
    this.metrics.successfulOperations++;
    this.metrics.operationCounts[command] =
      (this.metrics.operationCounts[command] ?? 0) + 1;
  }

  /**
   * Clear all data (useful for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get store size
   */
  size(): number {
    return this.store.size;
  }
}

// =============================================
// FACTORY FUNCTION
// =============================================

/**
 * Create a memory adapter
 */
export function createMemoryAdapter(
  config?: MemoryAdapterConfig,
): MemoryAdapter {
  return new MemoryAdapter(config);
}
