import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryAdapter } from "../src/adapters/memory/memory.adapter";
import { Cachyer } from "../src/core/cachyer";
import { CacheError } from "../src/types/core.types";
import type { CacheOperation } from "../src/types/operation.types";

describe("Cachyer", () => {
  let adapter: MemoryAdapter;
  let cache: Cachyer;

  beforeEach(async () => {
    adapter = new MemoryAdapter({ checkInterval: 0 });
    cache = new Cachyer({
      adapter,
      keyPrefix: "test",
      autoConnect: false,
      enableMetrics: true,
    });
    await cache.connect();
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  // =============================================
  // CONNECTION
  // =============================================

  describe("connection", () => {
    it("should connect and report connected", () => {
      expect(cache.isConnected()).toBe(true);
    });

    it("should report status as ready", () => {
      expect(cache.status).toBe("ready");
    });

    it("should disconnect", async () => {
      await cache.disconnect();
      expect(cache.isConnected()).toBe(false);
      expect(cache.status).toBe("disconnected");
    });

    it("should ping", async () => {
      expect(await cache.ping()).toBe(true);
    });

    it("should not reconnect if already initialized", async () => {
      await cache.connect(); // second call should be no-op
      expect(cache.isConnected()).toBe(true);
    });

    it("should get capabilities", () => {
      const caps = cache.getCapabilities();
      expect(caps.hyperloglog).toBe(true);
      expect(caps.pipeline).toBe(true);
      expect(caps.transactions).toBe(true);
      expect(typeof caps.scripting).toBe("boolean");
      expect(typeof caps.pubsub).toBe("boolean");
    });
  });

  // =============================================
  // KEY PREFIXING
  // =============================================

  describe("key prefixing", () => {
    it("should prefix keys on set/get", async () => {
      await cache.set("mykey", "hello");
      expect(await cache.get("mykey")).toBe("hello");
      // Verify the adapter has the prefixed key
      expect(await adapter.get("test:mykey")).toBe("hello");
    });

    it("should not double-prefix keys", async () => {
      await cache.set("test:mykey", "hello");
      expect(await adapter.get("test:mykey")).toBe("hello");
    });

    it("should strip prefix on scan", async () => {
      await adapter.set("test:a", "1");
      await adapter.set("test:b", "2");
      const result = await cache.scan(0, { match: "*" });
      expect(result.keys).toContain("a");
      expect(result.keys).toContain("b");
    });

    it("should work without prefix", async () => {
      const noPrefix = new Cachyer({
        adapter,
        autoConnect: false,
      });
      await noPrefix.set("raw", "value");
      expect(await adapter.get("raw")).toBe("value");
    });
  });

  // =============================================
  // STRING OPS
  // =============================================

  describe("string operations", () => {
    it("should set and get a value", async () => {
      await cache.set("str", "value");
      expect(await cache.get("str")).toBe("value");
    });

    it("should return null for missing key", async () => {
      expect(await cache.get("missing")).toBeNull();
    });

    it("should set with NX option (only if not exists)", async () => {
      await cache.set("nx", "first");
      const result = await cache.set("nx", "second", { nx: true });
      expect(result).toBeNull();
      expect(await cache.get("nx")).toBe("first");
    });

    it("should set with XX option (only if exists)", async () => {
      const result = await cache.set("xx", "value", { xx: true });
      expect(result).toBeNull();
      expect(await cache.get("xx")).toBeNull();
    });

    it("should set with EX option", async () => {
      await cache.set("ttlkey", "value", { ex: 100 });
      const ttl = await cache.ttl("ttlkey");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(100);
    });

    it("should set with PX option", async () => {
      await cache.set("pxkey", "value", { px: 50000 });
      const ttl = await cache.ttl("pxkey");
      expect(ttl).toBeGreaterThan(0);
    });

    it("should delete a key", async () => {
      await cache.set("delme", "value");
      const deleted = await cache.del("delme");
      expect(deleted).toBe(1);
      expect(await cache.get("delme")).toBeNull();
    });

    it("should delete multiple keys", async () => {
      await cache.set("d1", "v1");
      await cache.set("d2", "v2");
      const deleted = await cache.del("d1", "d2");
      expect(deleted).toBe(2);
    });

    it("should check key exists", async () => {
      await cache.set("ex", "val");
      expect(await cache.exists("ex")).toBe(1);
      expect(await cache.exists("nope")).toBe(0);
    });

    it("should set and check expire", async () => {
      await cache.set("expkey", "val");
      await cache.expire("expkey", 200);
      const ttl = await cache.ttl("expkey");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(200);
    });

    it("should return -2 for TTL of missing key", async () => {
      expect(await cache.ttl("none")).toBe(-2);
    });

    it("should increment", async () => {
      expect(await cache.incr("counter")).toBe(1);
      expect(await cache.incr("counter")).toBe(2);
    });
  });

  // =============================================
  // HASH OPS
  // =============================================

  describe("hash operations", () => {
    it("should hset and hget", async () => {
      await cache.hset("hash", "field1", "val1");
      expect(await cache.hget("hash", "field1")).toBe("val1");
    });

    it("should return null for missing hash field", async () => {
      expect(await cache.hget("hash", "nope")).toBeNull();
    });

    it("should hgetall", async () => {
      await cache.hset("h", "a", "1");
      await cache.hset("h", "b", "2");
      const all = await cache.hgetall("h");
      expect(all).toEqual({ a: "1", b: "2" });
    });

    it("should return empty object for hgetall on missing key", async () => {
      expect(await cache.hgetall("nope")).toEqual({});
    });

    it("should hdel", async () => {
      await cache.hset("h", "a", "1");
      await cache.hset("h", "b", "2");
      expect(await cache.hdel("h", "a")).toBe(1);
      expect(await cache.hget("h", "a")).toBeNull();
    });

    it("should hdel multiple fields", async () => {
      await cache.hset("h", "a", "1");
      await cache.hset("h", "b", "2");
      expect(await cache.hdel("h", "a", "b")).toBe(2);
    });

    it("should hexists", async () => {
      await cache.hset("h", "a", "1");
      expect(await cache.hexists("h", "a")).toBe(1);
      expect(await cache.hexists("h", "z")).toBe(0);
    });

    it("should hincrby", async () => {
      await cache.hset("h", "count", "5");
      expect(await cache.hincrby("h", "count", 3)).toBe(8);
    });

    it("should hincrby on non-existing field", async () => {
      expect(await cache.hincrby("h", "new", 10)).toBe(10);
    });

    it("should hlen", async () => {
      await cache.hset("h", "a", "1");
      await cache.hset("h", "b", "2");
      expect(await cache.hlen("h")).toBe(2);
    });

    it("should hlen return 0 for missing key", async () => {
      expect(await cache.hlen("nope")).toBe(0);
    });
  });

  // =============================================
  // SET OPS
  // =============================================

  describe("set operations", () => {
    it("should sadd and smembers", async () => {
      await cache.sadd("s", "a", "b", "c");
      const members = await cache.smembers("s");
      expect(members).toHaveLength(3);
      expect(members).toContain("a");
      expect(members).toContain("b");
      expect(members).toContain("c");
    });

    it("should not add duplicate members", async () => {
      await cache.sadd("s", "a", "a", "b");
      expect(await cache.scard("s")).toBe(2);
    });

    it("should srem", async () => {
      await cache.sadd("s", "a", "b");
      expect(await cache.srem("s", "a")).toBe(1);
      expect(await cache.scard("s")).toBe(1);
    });

    it("should sismember", async () => {
      await cache.sadd("s", "a");
      expect(await cache.sismember("s", "a")).toBe(1);
      expect(await cache.sismember("s", "z")).toBe(0);
    });

    it("should scard", async () => {
      await cache.sadd("s", "a", "b");
      expect(await cache.scard("s")).toBe(2);
    });

    it("should scard return 0 for missing key", async () => {
      expect(await cache.scard("nope")).toBe(0);
    });
  });

  // =============================================
  // SORTED SET OPS
  // =============================================

  describe("sorted set operations", () => {
    it("should zadd and zrange", async () => {
      await cache.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
        { member: "c", score: 3 },
      ]);
      const result = await cache.zrange("z", 0, -1);
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should zadd with NX option", async () => {
      await cache.zadd("z", [{ member: "a", score: 1 }]);
      const added = await cache.zadd("z", [{ member: "a", score: 5 }], {
        nx: true,
      });
      expect(added).toBe(0);
      expect(await cache.zscore("z", "a")).toBe("1");
    });

    it("should zadd with XX option", async () => {
      const added = await cache.zadd("z", [{ member: "new", score: 1 }], {
        xx: true,
      });
      expect(added).toBe(0);
    });

    it("should zrevrange", async () => {
      await cache.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
        { member: "c", score: 3 },
      ]);
      const result = await cache.zrevrange("z", 0, -1);
      expect(result).toEqual(["c", "b", "a"]);
    });

    it("should zrange with WITHSCORES", async () => {
      await cache.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
      ]);
      const result = await cache.zrange("z", 0, -1, { withScores: true });
      expect(result).toEqual([
        { member: "a", score: 1 },
        { member: "b", score: 2 },
      ]);
    });

    it("should zrevrange with WITHSCORES", async () => {
      await cache.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
      ]);
      const result = await cache.zrevrange("z", 0, -1, { withScores: true });
      expect(result).toEqual([
        { member: "b", score: 2 },
        { member: "a", score: 1 },
      ]);
    });

    it("should zrem", async () => {
      await cache.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
      ]);
      expect(await cache.zrem("z", "a")).toBe(1);
      expect(await cache.zcard("z")).toBe(1);
    });

    it("should zscore", async () => {
      await cache.zadd("z", [{ member: "a", score: 42 }]);
      expect(await cache.zscore("z", "a")).toBe("42");
      expect(await cache.zscore("z", "missing")).toBeNull();
    });

    it("should zrank", async () => {
      await cache.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
        { member: "c", score: 3 },
      ]);
      expect(await cache.zrank("z", "a")).toBe(0);
      expect(await cache.zrank("z", "c")).toBe(2);
      expect(await cache.zrank("z", "missing")).toBeNull();
    });

    it("should zcard", async () => {
      await cache.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
      ]);
      expect(await cache.zcard("z")).toBe(2);
    });

    it("should zcard return 0 for missing key", async () => {
      expect(await cache.zcard("nope")).toBe(0);
    });

    it("should zincrby", async () => {
      await cache.zadd("z", [{ member: "a", score: 10 }]);
      const newScore = await cache.zincrby("z", 5, "a");
      expect(newScore).toBe("15");
    });

    it("should zincrby on non-existing member", async () => {
      const score = await cache.zincrby("z", 7, "new");
      expect(score).toBe("7");
    });
  });

  // =============================================
  // LIST OPS
  // =============================================

  describe("list operations", () => {
    it("should lpush and lrange", async () => {
      await cache.lpush("list", "a", "b", "c");
      const items = await cache.lrange("list", 0, -1);
      expect(items).toEqual(["c", "b", "a"]);
    });

    it("should lrange return empty for missing key", async () => {
      expect(await cache.lrange("nope", 0, -1)).toEqual([]);
    });

    it("should lpush returns list length", async () => {
      expect(await cache.lpush("list", "a")).toBe(1);
      expect(await cache.lpush("list", "b")).toBe(2);
    });
  });

  // =============================================
  // SCHEMA MANAGEMENT
  // =============================================

  describe("schema management", () => {
    it("should register and get schema", () => {
      const schema = {
        name: "test-schema",
        key: (params: { id: string }) => `test:${params.id}`,
        structure: "STRING" as const,
        ttl: 3600,
        operations: {},
      };
      cache.registerSchema(schema);
      expect(cache.getSchema("test-schema")).toBe(schema);
    });

    it("should return undefined for missing schema", () => {
      expect(cache.getSchema("missing")).toBeUndefined();
    });

    it("should list schemas", () => {
      cache.registerSchema({
        name: "a",
        key: () => "a",
        structure: "STRING",
        ttl: 100,
        operations: {},
      });
      cache.registerSchema({
        name: "b",
        key: () => "b",
        structure: "HASH",
        ttl: 200,
        operations: {},
      });
      expect(cache.listSchemas()).toEqual(["a", "b"]);
    });
  });

  // =============================================
  // EXECUTE
  // =============================================

  describe("execute", () => {
    it("should execute an operation with buildArgs and parseResult", async () => {
      await cache.set("k", "hello");
      const op: CacheOperation<{ key: string }, string | null> = {
        command: "GET",
        buildArgs: (params) => [params.key],
        parseResult: (r) => r as string | null,
      };
      const result = await cache.execute(op, { key: "k" });
      expect(result).toBe("hello");
    });

    it("should retry on failure", async () => {
      let attempts = 0;
      const op: CacheOperation<Record<string, unknown>, string> = {
        command: "GET",
        buildArgs: () => {
          attempts++;
          throw new Error("fail");
        },
      };

      // The operation will fail because buildArgs throws on every attempt
      await expect(
        cache.execute(op, {}, { retries: 2, throwOnError: true }),
      ).rejects.toThrow();
    });

    it("should return undefined when throwOnError is false", async () => {
      const op: CacheOperation<Record<string, unknown>, string> = {
        command: "NONEXISTENT" as any,
        buildArgs: () => ["k"],
      };
      const result = await cache.execute(
        op,
        {},
        { throwOnError: false, retries: 0 },
      );
      expect(result).toBeUndefined();
    });

    it("should call onError callback", async () => {
      const onError = vi.fn();
      const op: CacheOperation<Record<string, unknown>, string> = {
        command: "NONEXISTENT" as any,
        buildArgs: () => ["k"],
      };
      await cache.execute(op, {}, { throwOnError: false, retries: 0, onError });
      expect(onError).toHaveBeenCalled();
    });
  });

  // =============================================
  // EXECUTE WRAPPED
  // =============================================

  describe("executeWrapped", () => {
    it("should return success result", async () => {
      await cache.set("k", "val");
      const op: CacheOperation<{ key: string }, string | null> = {
        command: "GET",
        buildArgs: (p) => [p.key],
        parseResult: (r) => r as string | null,
      };
      const result = await cache.executeWrapped(op, { key: "k" });
      expect(result.success).toBe(true);
      expect(result.data).toBe("val");
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should return failure result", async () => {
      const op: CacheOperation<Record<string, unknown>, string> = {
        command: "NONEXISTENT" as any,
        buildArgs: () => ["k"],
      };
      const result = await cache.executeWrapped(op, {}, { retries: 0 });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // =============================================
  // PIPELINE
  // =============================================

  describe("pipeline", () => {
    it("should execute pipeline with fallback", async () => {
      const setOp: CacheOperation<any, any> = {
        command: "SET",
        buildArgs: (p: any) => [p.key, p.value],
      };
      const getOp: CacheOperation<any, any> = {
        command: "GET",
        buildArgs: (p: any) => [p.key],
      };

      const result = await cache.pipeline([
        { operation: setOp, params: { key: "pkey", value: "pval" } },
        { operation: getOp, params: { key: "pkey" } },
      ]);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // =============================================
  // TRANSACTION
  // =============================================

  describe("transaction", () => {
    it("should execute transaction via memory adapter", async () => {
      const setOp: CacheOperation<any, any> = {
        command: "SET",
        buildArgs: (p: any) => [p.key, p.value],
      };

      const result = await cache.transaction([
        { operation: setOp, params: { key: "tkey", value: "tval" } },
      ]);

      expect(result.success).toBe(true);
      expect(result.committed).toBe(true);
    });
  });

  // =============================================
  // PUB/SUB
  // =============================================

  describe("pub/sub", () => {
    it("should throw for unsupported publish", async () => {
      // MemoryAdapter doesn't have publish
      const adapterWithoutPubSub = new MemoryAdapter({ checkInterval: 0 });
      const c = new Cachyer({
        adapter: adapterWithoutPubSub,
        autoConnect: false,
      });
      await c.connect();

      await expect(c.publish("ch", "msg")).rejects.toThrow(CacheError);
      await c.disconnect();
    });

    it("should throw for unsupported subscribe", async () => {
      const adapterWithoutPubSub = new MemoryAdapter({ checkInterval: 0 });
      const c = new Cachyer({
        adapter: adapterWithoutPubSub,
        autoConnect: false,
      });
      await c.connect();

      await expect(c.subscribe("ch", () => {})).rejects.toThrow(CacheError);
      await c.disconnect();
    });
  });

  // =============================================
  // METRICS
  // =============================================

  describe("metrics", () => {
    it("should track metrics", async () => {
      await cache.set("m", "v");
      await cache.get("m");
      const metrics = cache.getMetrics();
      expect(metrics.totalOperations).toBeGreaterThan(0);
      expect(metrics.successfulOperations).toBeGreaterThan(0);
    });

    it("should reset metrics", async () => {
      await cache.set("m", "v");
      cache.resetMetrics();
      const metrics = cache.getMetrics();
      expect(metrics.totalOperations).toBe(0);
    });

    it("should get stats", async () => {
      const stats = await cache.getStats();
      expect(stats).not.toBeNull();
      expect(stats!.size).toBeGreaterThanOrEqual(0);
    });
  });

  // =============================================
  // SCAN
  // =============================================

  describe("scan", () => {
    it("should scan keys", async () => {
      await cache.set("a", "1");
      await cache.set("b", "2");
      const result = await cache.scan(0);
      expect(result.keys.length).toBeGreaterThan(0);
      expect(typeof result.cursor).toBe("number");
    });

    it("should scan with match pattern", async () => {
      await cache.set("user:1", "a");
      await cache.set("user:2", "b");
      await cache.set("post:1", "c");
      const result = await cache.scan(0, { match: "user:*", count: 100 });
      for (const key of result.keys) {
        expect(key).toMatch(/^user:/);
      }
    });
  });

  // =============================================
  // ADAPTER ACCESS
  // =============================================

  describe("adapter access", () => {
    it("should expose underlying adapter", () => {
      expect(cache.adapter).toBe(adapter);
    });

    it("should access adapter without key prefixing", async () => {
      await cache.adapter.set("raw:key", "value");
      expect(await cache.adapter.get("raw:key")).toBe("value");
      // Should not be accessible via prefixed path
      expect(await cache.get("raw:key")).toBeNull();
    });
  });
});
