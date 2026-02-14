import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryAdapter } from "../src/adapters/memory/memory.adapter";

describe("MemoryAdapter", () => {
  let adapter: MemoryAdapter;

  beforeEach(async () => {
    adapter = new MemoryAdapter({ checkInterval: 0 });
    await adapter.connect();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  // =============================================
  // CONNECTION LIFECYCLE
  // =============================================

  describe("connection", () => {
    it("should connect", () => {
      expect(adapter.isConnected()).toBe(true);
      expect(adapter.status).toBe("ready");
    });

    it("should disconnect", async () => {
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
      expect(adapter.status).toBe("disconnected");
    });

    it("should ping when connected", async () => {
      expect(await adapter.ping()).toBe(true);
    });

    it("should not ping when disconnected", async () => {
      await adapter.disconnect();
      expect(await adapter.ping()).toBe(false);
    });

    it("should have name 'memory'", () => {
      expect(adapter.name).toBe("memory");
    });
  });

  // =============================================
  // STRING OPERATIONS
  // =============================================

  describe("string operations", () => {
    it("should set and get", async () => {
      await adapter.set("key", "value");
      expect(await adapter.get("key")).toBe("value");
    });

    it("should return null for missing key", async () => {
      expect(await adapter.get("nope")).toBeNull();
    });

    it("should overwrite existing value", async () => {
      await adapter.set("k", "v1");
      await adapter.set("k", "v2");
      expect(await adapter.get("k")).toBe("v2");
    });

    it("should set with NX (only if not exists)", async () => {
      await adapter.set("k", "first");
      expect(await adapter.set("k", "second", { nx: true })).toBeNull();
      expect(await adapter.get("k")).toBe("first");
    });

    it("should set with NX on new key", async () => {
      expect(await adapter.set("k", "val", { nx: true })).toBe("OK");
      expect(await adapter.get("k")).toBe("val");
    });

    it("should set with XX (only if exists)", async () => {
      expect(await adapter.set("k", "val", { xx: true })).toBeNull();
    });

    it("should set with XX on existing key", async () => {
      await adapter.set("k", "first");
      expect(await adapter.set("k", "second", { xx: true })).toBe("OK");
      expect(await adapter.get("k")).toBe("second");
    });

    it("should set with EX (expire seconds)", async () => {
      await adapter.set("k", "v", { ex: 100 });
      const ttl = await adapter.ttl("k");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(100);
    });

    it("should set with PX (expire ms)", async () => {
      await adapter.set("k", "v", { px: 50000 });
      const ttl = await adapter.ttl("k");
      expect(ttl).toBeGreaterThan(0);
    });

    it("should set with keepTtl", async () => {
      await adapter.set("k", "v", { ex: 500 });
      await adapter.set("k", "v2", { keepTtl: true });
      const ttl = await adapter.ttl("k");
      expect(ttl).toBeGreaterThan(0);
    });

    it("should mset and mget", async () => {
      await adapter.mset({ a: "1", b: "2", c: "3" });
      const values = await adapter.mget(["a", "b", "c", "missing"]);
      expect(values).toEqual(["1", "2", "3", null]);
    });

    it("should incr", async () => {
      expect(await adapter.incr("counter")).toBe(1);
      expect(await adapter.incr("counter")).toBe(2);
    });

    it("should incrby", async () => {
      await adapter.set("c", "10");
      expect(await adapter.incrby("c", 5)).toBe(15);
    });

    it("should decr", async () => {
      await adapter.set("c", "10");
      expect(await adapter.decr("c")).toBe(9);
    });

    it("should decrby", async () => {
      await adapter.set("c", "10");
      expect(await adapter.decrby("c", 3)).toBe(7);
    });

    it("should incr non-existing key from 0", async () => {
      expect(await adapter.incr("new")).toBe(1);
    });
  });

  // =============================================
  // HASH OPERATIONS
  // =============================================

  describe("hash operations", () => {
    it("should hset and hget", async () => {
      expect(await adapter.hset("h", "f", "v")).toBe(1);
      expect(await adapter.hget("h", "f")).toBe("v");
    });

    it("should hset returns 0 for existing field", async () => {
      await adapter.hset("h", "f", "v1");
      expect(await adapter.hset("h", "f", "v2")).toBe(0);
      expect(await adapter.hget("h", "f")).toBe("v2");
    });

    it("should hmset and hmget", async () => {
      await adapter.hmset("h", { a: "1", b: "2" });
      const vals = await adapter.hmget("h", ["a", "b", "c"]);
      expect(vals).toEqual(["1", "2", null]);
    });

    it("should hgetall", async () => {
      await adapter.hset("h", "x", "1");
      await adapter.hset("h", "y", "2");
      expect(await adapter.hgetall("h")).toEqual({ x: "1", y: "2" });
    });

    it("should hgetall return empty object for missing key", async () => {
      expect(await adapter.hgetall("nope")).toEqual({});
    });

    it("should hdel", async () => {
      await adapter.hset("h", "a", "1");
      await adapter.hset("h", "b", "2");
      expect(await adapter.hdel("h", "a")).toBe(1);
      expect(await adapter.hget("h", "a")).toBeNull();
    });

    it("should hdel return 0 for non-existing field", async () => {
      expect(await adapter.hdel("h", "nope")).toBe(0);
    });

    it("should hexists", async () => {
      await adapter.hset("h", "f", "v");
      expect(await adapter.hexists("h", "f")).toBe(1);
      expect(await adapter.hexists("h", "nope")).toBe(0);
    });

    it("should hincrby", async () => {
      await adapter.hset("h", "c", "10");
      expect(await adapter.hincrby("h", "c", 5)).toBe(15);
    });

    it("should hincrby on non-existing field", async () => {
      expect(await adapter.hincrby("h", "new", 3)).toBe(3);
    });

    it("should hlen", async () => {
      await adapter.hset("h", "a", "1");
      await adapter.hset("h", "b", "2");
      expect(await adapter.hlen("h")).toBe(2);
    });

    it("should hlen return 0 for missing key", async () => {
      expect(await adapter.hlen("nope")).toBe(0);
    });
  });

  // =============================================
  // LIST OPERATIONS
  // =============================================

  describe("list operations", () => {
    it("should lpush and lrange", async () => {
      await adapter.lpush("l", "a", "b", "c");
      expect(await adapter.lrange("l", 0, -1)).toEqual(["c", "b", "a"]);
    });

    it("should rpush", async () => {
      await adapter.rpush("l", "a", "b", "c");
      expect(await adapter.lrange("l", 0, -1)).toEqual(["a", "b", "c"]);
    });

    it("should lpop", async () => {
      await adapter.rpush("l", "a", "b", "c");
      expect(await adapter.lpop("l")).toBe("a");
      expect(await adapter.lrange("l", 0, -1)).toEqual(["b", "c"]);
    });

    it("should lpop return null on empty list", async () => {
      expect(await adapter.lpop("empty")).toBeNull();
    });

    it("should rpop", async () => {
      await adapter.rpush("l", "a", "b", "c");
      expect(await adapter.rpop("l")).toBe("c");
    });

    it("should rpop return null on empty list", async () => {
      expect(await adapter.rpop("empty")).toBeNull();
    });

    it("should llen", async () => {
      await adapter.rpush("l", "a", "b");
      expect(await adapter.llen("l")).toBe(2);
    });

    it("should llen return 0 for missing key", async () => {
      expect(await adapter.llen("nope")).toBe(0);
    });

    it("should ltrim", async () => {
      await adapter.rpush("l", "a", "b", "c", "d");
      await adapter.ltrim("l", 1, 2);
      expect(await adapter.lrange("l", 0, -1)).toEqual(["b", "c"]);
    });

    it("should lindex", async () => {
      await adapter.rpush("l", "a", "b", "c");
      expect(await adapter.lindex("l", 0)).toBe("a");
      expect(await adapter.lindex("l", 2)).toBe("c");
      expect(await adapter.lindex("l", -1)).toBe("c");
    });

    it("should lindex return null for out of range", async () => {
      expect(await adapter.lindex("l", 0)).toBeNull();
    });

    it("should lrange with negative stop", async () => {
      await adapter.rpush("l", "a", "b", "c", "d");
      expect(await adapter.lrange("l", 0, -2)).toEqual(["a", "b", "c"]);
    });

    it("should lpush returns list length", async () => {
      expect(await adapter.lpush("l", "a")).toBe(1);
      expect(await adapter.lpush("l", "b")).toBe(2);
    });

    it("should rpush returns list length", async () => {
      expect(await adapter.rpush("l", "a")).toBe(1);
      expect(await adapter.rpush("l", "b")).toBe(2);
    });
  });

  // =============================================
  // SET OPERATIONS
  // =============================================

  describe("set operations", () => {
    it("should sadd and smembers", async () => {
      expect(await adapter.sadd("s", "a", "b")).toBe(2);
      const members = await adapter.smembers("s");
      expect(members.sort()).toEqual(["a", "b"]);
    });

    it("should sadd returns count of new members", async () => {
      await adapter.sadd("s", "a");
      expect(await adapter.sadd("s", "a", "b")).toBe(1);
    });

    it("should srem", async () => {
      await adapter.sadd("s", "a", "b", "c");
      expect(await adapter.srem("s", "a", "b")).toBe(2);
      expect(await adapter.smembers("s")).toEqual(["c"]);
    });

    it("should srem return 0 for non-existing members", async () => {
      expect(await adapter.srem("s", "nope")).toBe(0);
    });

    it("should sismember", async () => {
      await adapter.sadd("s", "a");
      expect(await adapter.sismember("s", "a")).toBe(1);
      expect(await adapter.sismember("s", "z")).toBe(0);
    });

    it("should scard", async () => {
      await adapter.sadd("s", "a", "b", "c");
      expect(await adapter.scard("s")).toBe(3);
    });

    it("should scard return 0 for missing key", async () => {
      expect(await adapter.scard("nope")).toBe(0);
    });

    it("should sinter", async () => {
      await adapter.sadd("s1", "a", "b", "c");
      await adapter.sadd("s2", "b", "c", "d");
      const result = await adapter.sinter("s1", "s2");
      expect(result.sort()).toEqual(["b", "c"]);
    });

    it("should sinter return empty for no matching sets", async () => {
      expect(await adapter.sinter("nope1", "nope2")).toEqual([]);
    });

    it("should sunion", async () => {
      await adapter.sadd("s1", "a", "b");
      await adapter.sadd("s2", "b", "c");
      const result = await adapter.sunion("s1", "s2");
      expect(result.sort()).toEqual(["a", "b", "c"]);
    });

    it("should sdiff", async () => {
      await adapter.sadd("s1", "a", "b", "c");
      await adapter.sadd("s2", "b", "c", "d");
      const result = await adapter.sdiff("s1", "s2");
      expect(result).toEqual(["a"]);
    });

    it("should sdiff return empty for missing key", async () => {
      expect(await adapter.sdiff("nope")).toEqual([]);
    });

    it("should smembers return empty for missing key", async () => {
      expect(await adapter.smembers("nope")).toEqual([]);
    });
  });

  // =============================================
  // SORTED SET OPERATIONS
  // =============================================

  describe("sorted set operations", () => {
    it("should zadd and zrange", async () => {
      const added = await adapter.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
        { member: "c", score: 3 },
      ]);
      expect(added).toBe(3);
      expect(await adapter.zrange("z", 0, -1)).toEqual(["a", "b", "c"]);
    });

    it("should zadd with NX", async () => {
      await adapter.zadd("z", [{ member: "a", score: 1 }]);
      expect(
        await adapter.zadd("z", [{ member: "a", score: 5 }], { nx: true })
      ).toBe(0);
      expect(await adapter.zscore("z", "a")).toBe("1");
    });

    it("should zadd with XX", async () => {
      expect(
        await adapter.zadd("z", [{ member: "new", score: 1 }], { xx: true })
      ).toBe(0);
      expect(await adapter.zcard("z")).toBe(0);
    });

    it("should zadd with GT", async () => {
      await adapter.zadd("z", [{ member: "a", score: 10 }]);
      await adapter.zadd("z", [{ member: "a", score: 5 }], { gt: true });
      expect(await adapter.zscore("z", "a")).toBe("10");
      await adapter.zadd("z", [{ member: "a", score: 15 }], { gt: true });
      expect(await adapter.zscore("z", "a")).toBe("15");
    });

    it("should zadd with LT", async () => {
      await adapter.zadd("z", [{ member: "a", score: 10 }]);
      await adapter.zadd("z", [{ member: "a", score: 15 }], { lt: true });
      expect(await adapter.zscore("z", "a")).toBe("10");
      await adapter.zadd("z", [{ member: "a", score: 5 }], { lt: true });
      expect(await adapter.zscore("z", "a")).toBe("5");
    });

    it("should zrem", async () => {
      await adapter.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
      ]);
      expect(await adapter.zrem("z", "a")).toBe(1);
      expect(await adapter.zcard("z")).toBe(1);
    });

    it("should zrem return 0 for missing member", async () => {
      expect(await adapter.zrem("z", "nope")).toBe(0);
    });

    it("should zscore", async () => {
      await adapter.zadd("z", [{ member: "a", score: 42 }]);
      expect(await adapter.zscore("z", "a")).toBe("42");
      expect(await adapter.zscore("z", "missing")).toBeNull();
    });

    it("should zrank", async () => {
      await adapter.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
        { member: "c", score: 3 },
      ]);
      expect(await adapter.zrank("z", "a")).toBe(0);
      expect(await adapter.zrank("z", "c")).toBe(2);
    });

    it("should zrank return null for missing member", async () => {
      expect(await adapter.zrank("z", "nope")).toBeNull();
    });

    it("should zrevrank", async () => {
      await adapter.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
        { member: "c", score: 3 },
      ]);
      expect(await adapter.zrevrank("z", "c")).toBe(0);
      expect(await adapter.zrevrank("z", "a")).toBe(2);
    });

    it("should zrevrange", async () => {
      await adapter.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
        { member: "c", score: 3 },
      ]);
      expect(await adapter.zrevrange("z", 0, -1)).toEqual(["c", "b", "a"]);
    });

    it("should zrange with withScores", async () => {
      await adapter.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
      ]);
      const result = await adapter.zrange("z", 0, -1, { withScores: true });
      expect(result).toEqual([
        { member: "a", score: 1 },
        { member: "b", score: 2 },
      ]);
    });

    it("should zrevrange with withScores", async () => {
      await adapter.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
      ]);
      const result = await adapter.zrevrange("z", 0, -1, { withScores: true });
      expect(result).toEqual([
        { member: "b", score: 2 },
        { member: "a", score: 1 },
      ]);
    });

    it("should zcard", async () => {
      await adapter.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
      ]);
      expect(await adapter.zcard("z")).toBe(2);
    });

    it("should zcard return 0 for missing key", async () => {
      expect(await adapter.zcard("nope")).toBe(0);
    });

    it("should zcount", async () => {
      await adapter.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 5 },
        { member: "c", score: 10 },
      ]);
      expect(await adapter.zcount("z", 1, 5)).toBe(2);
      expect(await adapter.zcount("z", "-inf", "+inf")).toBe(3);
    });

    it("should zincrby", async () => {
      await adapter.zadd("z", [{ member: "a", score: 10 }]);
      expect(await adapter.zincrby("z", 5, "a")).toBe("15");
    });

    it("should zincrby on non-existing member", async () => {
      expect(await adapter.zincrby("z", 7, "new")).toBe("7");
    });

    it("should zremrangebyrank", async () => {
      await adapter.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 2 },
        { member: "c", score: 3 },
        { member: "d", score: 4 },
      ]);
      expect(await adapter.zremrangebyrank("z", 0, 1)).toBe(2);
      expect(await adapter.zcard("z")).toBe(2);
    });

    it("should zremrangebyscore", async () => {
      await adapter.zadd("z", [
        { member: "a", score: 1 },
        { member: "b", score: 5 },
        { member: "c", score: 10 },
      ]);
      expect(await adapter.zremrangebyscore("z", 1, 5)).toBe(2);
      expect(await adapter.zcard("z")).toBe(1);
    });
  });

  // =============================================
  // KEY OPERATIONS
  // =============================================

  describe("key operations", () => {
    it("should del single key", async () => {
      await adapter.set("k", "v");
      expect(await adapter.del("k")).toBe(1);
      expect(await adapter.get("k")).toBeNull();
    });

    it("should del multiple keys", async () => {
      await adapter.set("a", "1");
      await adapter.set("b", "2");
      expect(await adapter.del("a", "b")).toBe(2);
    });

    it("should del return 0 for missing keys", async () => {
      expect(await adapter.del("nope")).toBe(0);
    });

    it("should exists", async () => {
      await adapter.set("k", "v");
      expect(await adapter.exists("k")).toBe(1);
      expect(await adapter.exists("nope")).toBe(0);
    });

    it("should exists count multiple keys", async () => {
      await adapter.set("a", "1");
      await adapter.set("b", "2");
      expect(await adapter.exists("a", "b", "c")).toBe(2);
    });

    it("should expire", async () => {
      await adapter.set("k", "v");
      expect(await adapter.expire("k", 100)).toBe(1);
      const ttl = await adapter.ttl("k");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(100);
    });

    it("should expire return 0 for missing key", async () => {
      expect(await adapter.expire("nope", 100)).toBe(0);
    });

    it("should ttl return -2 for missing key", async () => {
      expect(await adapter.ttl("nope")).toBe(-2);
    });

    it("should ttl return -1 for key without expiry", async () => {
      await adapter.set("k", "v");
      expect(await adapter.ttl("k")).toBe(-1);
    });

    it("should pttl", async () => {
      await adapter.set("k", "v", { ex: 100 });
      const pttl = await adapter.pttl("k");
      expect(pttl).toBeGreaterThan(0);
      expect(pttl).toBeLessThanOrEqual(100000);
    });

    it("should persist", async () => {
      await adapter.set("k", "v", { ex: 100 });
      expect(await adapter.persist("k")).toBe(1);
      expect(await adapter.ttl("k")).toBe(-1);
    });

    it("should persist return 0 for key without ttl", async () => {
      await adapter.set("k", "v");
      expect(await adapter.persist("k")).toBe(0);
    });

    it("should rename", async () => {
      await adapter.set("old", "val");
      await adapter.rename("old", "new");
      expect(await adapter.get("old")).toBeNull();
      expect(await adapter.get("new")).toBe("val");
    });

    it("should rename throw for missing key", async () => {
      await expect(adapter.rename("nope", "new")).rejects.toThrow();
    });

    it("should type", async () => {
      await adapter.set("str", "v");
      await adapter.sadd("set", "a");
      await adapter.zadd("zset", [{ member: "a", score: 1 }]);
      await adapter.hset("hash", "f", "v");
      await adapter.lpush("list", "a");

      expect(await adapter.type("str")).toBe("string");
      expect(await adapter.type("set")).toBe("set");
      expect(await adapter.type("zset")).toBe("zset");
      expect(await adapter.type("hash")).toBe("hash");
      expect(await adapter.type("list")).toBe("list");
      expect(await adapter.type("nope")).toBe("none");
    });

    it("should keys with pattern", async () => {
      await adapter.set("user:1", "a");
      await adapter.set("user:2", "b");
      await adapter.set("post:1", "c");
      const result = await adapter.keys("user:*");
      expect(result.sort()).toEqual(["user:1", "user:2"]);
    });

    it("should scan with cursor", async () => {
      await adapter.set("a", "1");
      await adapter.set("b", "2");
      await adapter.set("c", "3");
      const result = await adapter.scan(0, { count: 2 });
      expect(result.keys.length).toBeLessThanOrEqual(2);
      expect(typeof result.cursor).toBe("number");
    });

    it("should scan with match pattern", async () => {
      await adapter.set("user:1", "a");
      await adapter.set("user:2", "b");
      await adapter.set("post:1", "c");
      const result = await adapter.scan(0, { match: "user:*", count: 100 });
      expect(result.keys.every((k) => k.startsWith("user:"))).toBe(true);
    });
  });

  // =============================================
  // TTL & EXPIRATION
  // =============================================

  describe("TTL and expiration", () => {
    it("should expire key after TTL", async () => {
      await adapter.set("k", "v", { px: 50 });
      expect(await adapter.get("k")).toBe("v");
      await new Promise((r) => setTimeout(r, 80));
      expect(await adapter.get("k")).toBeNull();
    });

    it("should keepTtl on overwrite", async () => {
      await adapter.set("k", "v", { ex: 500 });
      const ttlBefore = await adapter.ttl("k");
      await adapter.set("k", "v2", { keepTtl: true });
      const ttlAfter = await adapter.ttl("k");
      expect(ttlAfter).toBeGreaterThan(0);
      expect(ttlAfter).toBeLessThanOrEqual(ttlBefore);
    });

    it("should expireat set absolute expiration", async () => {
      await adapter.set("k", "v");
      const futureTimestamp = Math.floor(Date.now() / 1000) + 1000;
      expect(await adapter.expireat("k", futureTimestamp)).toBe(1);
      const ttl = await adapter.ttl("k");
      expect(ttl).toBeGreaterThan(0);
    });
  });

  // =============================================
  // EVICTION
  // =============================================

  describe("eviction", () => {
    it("should evict entries when maxEntries exceeded", async () => {
      const small = new MemoryAdapter({ maxEntries: 3, checkInterval: 0 });
      await small.connect();

      await small.set("a", "1");
      await small.set("b", "2");
      await small.set("c", "3");
      await small.set("d", "4"); // should trigger eviction

      expect(small.size()).toBeLessThanOrEqual(3);
      await small.disconnect();
    });
  });

  // =============================================
  // METRICS
  // =============================================

  describe("metrics", () => {
    it("should track operation counts", async () => {
      await adapter.set("k", "v");
      await adapter.get("k");
      const metrics = adapter.getMetrics();
      expect(metrics.totalOperations).toBeGreaterThanOrEqual(2);
      expect(metrics.operationCounts["SET"]).toBe(1);
      expect(metrics.operationCounts["GET"]).toBe(1);
    });

    it("should reset metrics", async () => {
      await adapter.set("k", "v");
      adapter.resetMetrics();
      const metrics = adapter.getMetrics();
      expect(metrics.totalOperations).toBe(0);
      expect(metrics.operationCounts).toEqual({});
    });

    it("should get stats", async () => {
      const stats = await adapter.getStats();
      expect(typeof stats.hits).toBe("number");
      expect(typeof stats.misses).toBe("number");
      expect(typeof stats.hitRate).toBe("number");
      expect(typeof stats.size).toBe("number");
    });
  });

  // =============================================
  // HYPERLOGLOG
  // =============================================

  describe("HyperLogLog (simulated)", () => {
    it("should pfadd", async () => {
      expect(await adapter.pfadd("hll", "a", "b", "c")).toBe(1);
      expect(await adapter.pfadd("hll", "a", "b")).toBe(0);
    });

    it("should pfcount", async () => {
      await adapter.pfadd("hll", "a", "b", "c");
      expect(await adapter.pfcount("hll")).toBe(3);
    });

    it("should pfcount multiple keys", async () => {
      await adapter.pfadd("h1", "a", "b");
      await adapter.pfadd("h2", "b", "c");
      expect(await adapter.pfcount("h1", "h2")).toBe(3);
    });

    it("should pfmerge", async () => {
      await adapter.pfadd("h1", "a", "b");
      await adapter.pfadd("h2", "b", "c");
      await adapter.pfmerge("dest", "h1", "h2");
      expect(await adapter.pfcount("dest")).toBe(3);
    });
  });

  // =============================================
  // PIPELINE & TRANSACTIONS
  // =============================================

  describe("pipeline and transactions", () => {
    it("should execute pipeline", async () => {
      const result = await adapter.executePipeline([
        {
          operation: {
            command: "SET",
            buildArgs: () => ["pk", "pv"],
          },
          params: {},
        },
        {
          operation: {
            command: "GET",
            buildArgs: () => ["pk"],
          },
          params: {},
        },
      ]);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[1]!.data).toBe("pv");
    });

    it("should execute transaction", async () => {
      const result = await adapter.executeTransaction([
        {
          operation: {
            command: "SET",
            buildArgs: () => ["tk", "tv"],
          },
          params: {},
        },
      ]);
      expect(result.success).toBe(true);
      expect(result.committed).toBe(true);
    });
  });

  // =============================================
  // UTILITY METHODS
  // =============================================

  describe("utility methods", () => {
    it("should clear all data", async () => {
      await adapter.set("a", "1");
      await adapter.set("b", "2");
      adapter.clear();
      expect(adapter.size()).toBe(0);
    });

    it("should report size", async () => {
      await adapter.set("a", "1");
      await adapter.set("b", "2");
      expect(adapter.size()).toBe(2);
    });
  });
});
