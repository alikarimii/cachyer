import { describe, expect, it } from "vitest";
import {
  TypedOperationBuilder,
  createCounterSchema,
  createHashSchema,
  createKeyValueSchema,
  createSetSchema,
  createSortedSetSchema,
  createTypedSchema,
} from "../src/schemas/schema-builder";
import { createKeyBuilder } from "../src/utils/key-patterns";

type TestKeyParams = { userId: string };

describe("TypedSchemaBuilder", () => {
  // =============================================
  // BUILDER CHAINING
  // =============================================

  describe("chaining", () => {
    it("should build a complete schema", () => {
      const schema = createTypedSchema<TestKeyParams>()
        .name("user-profile")
        .keyPattern("user:{userId}:profile")
        .structure("STRING")
        .ttl(3600)
        .operations((ops) => ops.addGet().addSet())
        .build();

      expect(schema.name).toBe("user-profile");
      expect(schema.structure).toBe("STRING");
      expect(schema.ttl).toBe(3600);
      expect(schema.operations.get).toBeDefined();
      expect(schema.operations.set).toBeDefined();
    });

    it("should support optional fields", () => {
      const schema = createTypedSchema<TestKeyParams>()
        .name("test")
        .keyPattern("test:{userId}")
        .structure("HASH")
        .ttl(100)
        .maxSize(1000)
        .description("Test schema")
        .namespace("test-ns")
        .version(2)
        .tags("tag1", "tag2")
        .operations((ops) => ops.addGet())
        .build();

      expect(schema.maxSize).toBe(1000);
      expect(schema.description).toBe("Test schema");
      expect(schema.namespace).toBe("test-ns");
      expect(schema.version).toBe(2);
      expect(schema.tags).toEqual(["tag1", "tag2"]);
    });

    it("should generate key from params", () => {
      const schema = createTypedSchema<TestKeyParams>()
        .name("test")
        .keyPattern("user:{userId}:data")
        .structure("STRING")
        .ttl(100)
        .operations((ops) => ops.addGet())
        .build();

      expect(schema.key({ userId: "123" })).toBe("user:123:data");
    });
  });

  // =============================================
  // VALIDATION
  // =============================================

  describe("validation", () => {
    it("should throw when name is missing", () => {
      expect(() =>
        createTypedSchema<TestKeyParams>()
          .keyPattern("k:{userId}")
          .structure("STRING")
          .ttl(100)
          .operations((ops) => ops.addGet())
          .build(),
      ).toThrow("Schema name is required");
    });

    it("should throw when keyPattern is missing", () => {
      expect(() =>
        createTypedSchema<TestKeyParams>()
          .name("test")
          .structure("STRING")
          .ttl(100)
          .operations((ops) => ops.addGet())
          .build(),
      ).toThrow("Must set keyPattern before configuring operations");
    });

    it("should throw when structure is missing", () => {
      expect(() =>
        createTypedSchema<TestKeyParams>()
          .name("test")
          .keyPattern("k:{userId}")
          .ttl(100)
          .operations((ops) => ops.addGet())
          .build(),
      ).toThrow("Structure is required");
    });

    it("should throw when ttl is missing", () => {
      expect(() =>
        createTypedSchema<TestKeyParams>()
          .name("test")
          .keyPattern("k:{userId}")
          .structure("STRING")
          .operations((ops) => ops.addGet())
          .build(),
      ).toThrow("TTL is required");
    });
  });

  // =============================================
  // TYPED OPERATION BUILDER
  // =============================================

  describe("TypedOperationBuilder", () => {
    const keyBuilder = createKeyBuilder<TestKeyParams>("user:{userId}");

    describe("string operations", () => {
      it("should addGet", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addGet().getOperations();
        expect(ops.get.command).toBe("GET");
        expect(ops.get.buildArgs({ userId: "1" })).toEqual(["user:1"]);
      });

      it("should addGet with custom name", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addGet("fetchUser").getOperations();
        expect(ops.fetchUser).toBeDefined();
        expect(ops.fetchUser.command).toBe("GET");
      });

      it("should addGet with custom parseResult", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder
          .addGet("parsed", (r) => JSON.parse(r as string))
          .getOperations();
        expect(ops.parsed.parseResult!('{"a":1}')).toEqual({ a: 1 });
      });

      it("should addSet", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSet().getOperations();
        expect(ops.set.command).toBe("SET");
        expect(ops.set.buildArgs({ userId: "1", value: "hello" })).toEqual([
          "user:1",
          "hello",
        ]);
      });

      it("should addSet with TTL", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSet(undefined, 300).getOperations();
        expect(ops.set.command).toBe("SETEX");
        expect(ops.set.buildArgs({ userId: "1", value: "hi" })).toEqual([
          "user:1",
          "hi",
          "EX",
          300,
        ]);
      });

      it("should addDelete", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addDelete().getOperations();
        expect(ops.delete.command).toBe("DEL");
        expect(ops.delete.buildArgs({ userId: "1" })).toEqual(["user:1"]);
        expect(ops.delete.parseResult!(1)).toBe(true);
        expect(ops.delete.parseResult!(0)).toBe(false);
      });

      it("should addExists", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addExists().getOperations();
        expect(ops.exists.command).toBe("EXISTS");
        expect(ops.exists.parseResult!(1)).toBe(true);
        expect(ops.exists.parseResult!(0)).toBe(false);
      });

      it("should addTtl", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addTtl().getOperations();
        expect(ops.ttl.command).toBe("TTL");
        expect(ops.ttl.parseResult!(42)).toBe(42);
      });

      it("should addExpire", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addExpire().getOperations();
        expect(ops.expire.command).toBe("EXPIRE");
        expect(ops.expire.buildArgs({ userId: "1", ttl: 500 })).toEqual([
          "user:1",
          500,
        ]);
      });

      it("should addExpire with default TTL", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addExpire(undefined, 7200).getOperations();
        expect(ops.expire.buildArgs({ userId: "1" })).toEqual(["user:1", 7200]);
      });

      it("should addIncrement", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addIncrement().getOperations();
        expect(ops.increment.command).toBe("INCR");
      });

      it("should addIncrementBy", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addIncrementBy().getOperations();
        expect(ops.incrementBy.command).toBe("INCRBY");
        expect(ops.incrementBy.buildArgs({ userId: "1", amount: 5 })).toEqual([
          "user:1",
          5,
        ]);
      });
    });

    describe("hash operations", () => {
      it("should addHashGetAll", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addHashGetAll().getOperations();
        expect(ops.hashGetAll.command).toBe("HGETALL");
        expect(ops.hashGetAll.buildArgs({ userId: "1" })).toEqual(["user:1"]);
      });

      it("should addHashGet", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addHashGet().getOperations();
        expect(ops.hashGetField.command).toBe("HGET");
        expect(
          ops.hashGetField.buildArgs({ userId: "1", field: "name" }),
        ).toEqual(["user:1", "name"]);
      });

      it("should addHashSet", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addHashSet().getOperations();
        expect(ops.hashSet.command).toBe("HSET");
        expect(
          ops.hashSet.buildArgs({
            userId: "1",
            field: "name",
            value: "Ali",
          }),
        ).toEqual(["user:1", "name", "Ali"]);
      });

      it("should addHashSetMultiple", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addHashSetMultiple().getOperations();
        expect(ops.hashSetMultiple.command).toBe("HMSET");
      });
    });

    describe("sorted set operations", () => {
      it("should addSortedSetAdd", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSortedSetAdd().getOperations();
        expect(ops.sortedSetAdd.command).toBe("ZADD");
        expect(
          ops.sortedSetAdd.buildArgs({
            userId: "1",
            member: "item",
            score: 10,
          }),
        ).toEqual(["user:1", 10, "item"]);
      });

      it("should addSortedSetGetRange", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSortedSetGetRange().getOperations();
        expect(ops.sortedSetGetRange.command).toBe("ZREVRANGE");
        expect(
          ops.sortedSetGetRange.buildArgs({ userId: "1", start: 0, stop: 9 }),
        ).toEqual(["user:1", 0, 9]);
      });

      it("should addSortedSetGetRange with scores", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder
          .addSortedSetGetRange("withScores", true)
          .getOperations();
        expect(
          ops.withScores.buildArgs({ userId: "1", start: 0, stop: 9 }),
        ).toEqual(["user:1", 0, 9, "WITHSCORES"]);
      });

      it("should addSortedSetRemove", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSortedSetRemove().getOperations();
        expect(ops.sortedSetRemove.command).toBe("ZREM");
        expect(
          ops.sortedSetRemove.buildArgs({ userId: "1", member: "item" }),
        ).toEqual(["user:1", "item"]);
      });

      it("should addSortedSetCount", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSortedSetCount().getOperations();
        expect(ops.sortedSetCount.command).toBe("ZCARD");
      });

      it("should addSortedSetGetScore", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSortedSetGetScore().getOperations();
        expect(ops.sortedSetGetScore.command).toBe("ZSCORE");
        expect(ops.sortedSetGetScore.parseResult!("42")).toBe(42);
        expect(ops.sortedSetGetScore.parseResult!(null)).toBeNull();
      });

      it("should addSortedSetGetRank", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSortedSetGetRank().getOperations();
        expect(ops.sortedSetGetRank.command).toBe("ZREVRANK");
        expect(ops.sortedSetGetRank.parseResult!(3)).toBe(3);
        expect(ops.sortedSetGetRank.parseResult!(null)).toBeNull();
      });

      it("should addSortedSetIncrementBy", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSortedSetIncrementBy().getOperations();
        expect(ops.sortedSetIncrementBy.command).toBe("ZINCRBY");
        expect(
          ops.sortedSetIncrementBy.buildArgs({
            userId: "1",
            member: "item",
            amount: 5,
          }),
        ).toEqual(["user:1", 5, "item"]);
        expect(ops.sortedSetIncrementBy.parseResult!("15")).toBe(15);
      });

      it("should addSortedSetHasMember", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSortedSetHasMember().getOperations();
        expect(ops.sortedSetHasMember.command).toBe("ZSCORE");
        expect(ops.sortedSetHasMember.parseResult!("10")).toBe(true);
        expect(ops.sortedSetHasMember.parseResult!(null)).toBe(false);
      });

      it("should addSortedSetGetTopMembers", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSortedSetGetTopMembers().getOperations();
        expect(ops.sortedSetGetTopMembers.command).toBe("ZREVRANGE");
        expect(
          ops.sortedSetGetTopMembers.buildArgs({ userId: "1", topN: 5 }),
        ).toEqual(["user:1", 0, 4, "WITHSCORES"]);
      });

      it("should addSortedSetRemoveOldest", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSortedSetRemoveOldest().getOperations();
        expect(ops.sortedSetRemoveOldest.command).toBe("ZREMRANGEBYRANK");
        expect(
          ops.sortedSetRemoveOldest.buildArgs({ userId: "1", count: 3 }),
        ).toEqual(["user:1", 0, 2]);
      });

      it("should addSortedSetCountInRange", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSortedSetCountInRange().getOperations();
        expect(ops.sortedSetCountInRange.command).toBe("ZCOUNT");
        expect(
          ops.sortedSetCountInRange.buildArgs({
            userId: "1",
            min: 0,
            max: 100,
          }),
        ).toEqual(["user:1", 0, 100]);
      });
    });

    describe("set operations", () => {
      it("should addSetAdd", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSetAdd().getOperations();
        expect(ops.setAdd.command).toBe("SADD");
        expect(ops.setAdd.buildArgs({ userId: "1", member: "tag1" })).toEqual([
          "user:1",
          "tag1",
        ]);
      });

      it("should addSetAddMultiple", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSetAddMultiple().getOperations();
        expect(ops.setAddMultiple.command).toBe("SADD");
        expect(
          ops.setAddMultiple.buildArgs({ userId: "1", members: ["a", "b"] }),
        ).toEqual(["user:1", "a", "b"]);
      });

      it("should addSetGetAll", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSetGetAll().getOperations();
        expect(ops.setGetAll.command).toBe("SMEMBERS");
      });

      it("should addSetHasMember", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSetHasMember().getOperations();
        expect(ops.setHasMember.command).toBe("SISMEMBER");
        expect(ops.setHasMember.parseResult!(1)).toBe(true);
        expect(ops.setHasMember.parseResult!(0)).toBe(false);
      });

      it("should addSetRemove", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSetRemove().getOperations();
        expect(ops.setRemove.command).toBe("SREM");
      });

      it("should addSetCount", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSetCount().getOperations();
        expect(ops.setCount.command).toBe("SCARD");
      });

      it("should addSetGetRandom", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addSetGetRandom().getOperations();
        expect(ops.setGetRandom.command).toBe("SRANDMEMBER");
      });
    });

    describe("list operations", () => {
      it("should addListPush", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addListPush().getOperations();
        expect(ops.listPush.command).toBe("LPUSH");
        expect(ops.listPush.buildArgs({ userId: "1", value: "item" })).toEqual([
          "user:1",
          "item",
        ]);
      });

      it("should addListGetRange", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addListGetRange().getOperations();
        expect(ops.listGetRange.command).toBe("LRANGE");
        expect(
          ops.listGetRange.buildArgs({ userId: "1", start: 0, stop: 9 }),
        ).toEqual(["user:1", 0, 9]);
      });

      it("should addListLength", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addListLength().getOperations();
        expect(ops.listLength.command).toBe("LLEN");
      });

      it("should addListPop", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addListPop().getOperations();
        expect(ops.listPop.command).toBe("LPOP");
      });

      it("should addListTrim", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addListTrim().getOperations();
        expect(ops.listTrim.command).toBe("LTRIM");
      });

      it("should addListGetByIndex", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addListGetByIndex().getOperations();
        expect(ops.listGetByIndex.command).toBe("LINDEX");
        expect(ops.listGetByIndex.buildArgs({ userId: "1", index: 2 })).toEqual(
          ["user:1", 2],
        );
      });

      it("should addListSet", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addListSet().getOperations();
        expect(ops.listSet.command).toBe("LSET");
      });

      it("should addListRemove", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addListRemove().getOperations();
        expect(ops.listRemove.command).toBe("LREM");
      });

      it("should addListIndexOf", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addListIndexOf().getOperations();
        expect(ops.listIndexOf.command).toBe("LPOS");
      });

      it("should addListInsert", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder.addListInsert().getOperations();
        expect(ops.listInsert.command).toBe("LINSERT");
        expect(
          ops.listInsert.buildArgs({
            userId: "1",
            before: true,
            pivot: "x",
            value: "y",
          }),
        ).toEqual(["user:1", "BEFORE", "x", "y"]);
      });
    });

    describe("custom operations", () => {
      it("should addCustomOperation", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder
          .addCustomOperation("myOp", {
            command: "GET",
            buildArgs: (params: { key: string }) => [params.key],
            parseResult: (r) => r as string,
          })
          .getOperations();
        expect(ops.myOp.command).toBe("GET");
      });
    });

    describe("operation naming", () => {
      it("should support custom names for all operations", () => {
        const builder = new TypedOperationBuilder<TestKeyParams>(keyBuilder);
        const ops = builder
          .addGet("myGet")
          .addSet("mySet")
          .addDelete("myDel")
          .addExists("myExists")
          .getOperations();

        expect(ops.myGet).toBeDefined();
        expect(ops.mySet).toBeDefined();
        expect(ops.myDel).toBeDefined();
        expect(ops.myExists).toBeDefined();
      });
    });
  });

  // =============================================
  // TEMPLATE FUNCTIONS
  // =============================================

  describe("template functions", () => {
    it("should createKeyValueSchema", () => {
      const schema = createKeyValueSchema<TestKeyParams>(
        "user-data",
        "user:{userId}:data",
        3600,
      );
      expect(schema.name).toBe("user-data");
      expect(schema.structure).toBe("STRING");
      expect(schema.ttl).toBe(3600);
      expect(schema.operations.get).toBeDefined();
      expect(schema.operations.set).toBeDefined();
      expect(schema.operations.delete).toBeDefined();
      expect(schema.operations.exists).toBeDefined();
      expect(schema.operations.ttl).toBeDefined();
    });

    it("should createHashSchema", () => {
      const schema = createHashSchema<TestKeyParams>(
        "user-profile",
        "user:{userId}:profile",
        7200,
      );
      expect(schema.name).toBe("user-profile");
      expect(schema.structure).toBe("HASH");
      expect(schema.operations.hashGetAll).toBeDefined();
      expect(schema.operations.hashGetField).toBeDefined();
      expect(schema.operations.hashSet).toBeDefined();
      expect(schema.operations.hashSetMultiple).toBeDefined();
      expect(schema.operations.delete).toBeDefined();
      expect(schema.operations.exists).toBeDefined();
      expect(schema.operations.expire).toBeDefined();
      expect(schema.operations.ttl).toBeDefined();
    });

    it("should createSortedSetSchema", () => {
      const schema = createSortedSetSchema<TestKeyParams>(
        "leaderboard",
        "board:{userId}",
        3600,
        100,
      );
      expect(schema.name).toBe("leaderboard");
      expect(schema.structure).toBe("SORTED_SET");
      expect(schema.operations.sortedSetAdd).toBeDefined();
      expect(schema.operations.sortedSetGetRange).toBeDefined();
      expect(schema.operations.getRangeWithScores).toBeDefined();
      expect(schema.operations.delete).toBeDefined();
    });

    it("should createSortedSetSchema without maxSize", () => {
      const schema = createSortedSetSchema<TestKeyParams>(
        "feed",
        "feed:{userId}",
        3600,
      );
      expect(schema.maxSize).toBeUndefined();
    });

    it("should createSetSchema", () => {
      const schema = createSetSchema<TestKeyParams>(
        "tags",
        "tags:{userId}",
        3600,
      );
      expect(schema.name).toBe("tags");
      expect(schema.structure).toBe("SET");
      expect(schema.operations.setAdd).toBeDefined();
      expect(schema.operations.setGetAll).toBeDefined();
      expect(schema.operations.setHasMember).toBeDefined();
      expect(schema.operations.delete).toBeDefined();
    });

    it("should createCounterSchema", () => {
      const schema = createCounterSchema<TestKeyParams>(
        "view-count",
        "views:{userId}",
        86400,
      );
      expect(schema.name).toBe("view-count");
      expect(schema.structure).toBe("STRING");
      expect(schema.operations.get).toBeDefined();
      expect(schema.operations.increment).toBeDefined();
      expect(schema.operations.incrementBy).toBeDefined();
      expect(schema.operations.delete).toBeDefined();
    });
  });
});
