import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAdapter } from "../src/adapters/memory/memory.adapter";
import { Cachyer } from "../src/core/cachyer";
import { defineAction, CacheAction, buildBatches } from "../src/actions";
import { defineOperation, pipelineEntry } from "../src/types/operation.types";
import type { RegisteredStep } from "../src/actions";

// =============================================
// TEST OPERATIONS
// =============================================

const setOp = defineOperation<{ key: string; value: string }, string>({
  command: "SET",
  buildArgs: (p) => [p.key, p.value],
  parseResult: () => "OK",
});

const getOp = defineOperation<{ key: string }, string | null>({
  command: "GET",
  buildArgs: (p) => [p.key],
});

const incrOp = defineOperation<{ key: string }, number>({
  command: "INCR",
  buildArgs: (p) => [p.key],
  parseResult: (r) => Number(r),
});

// =============================================
// TESTS
// =============================================

describe("CacheAction", () => {
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
  // BUILDER VALIDATION
  // =============================================

  describe("builder validation", () => {
    it("should throw on duplicate step names", () => {
      expect(() =>
        defineAction<{ x: string }>("dup")
          .step("a", { operation: setOp, params: (i) => ({ key: i.x, value: "1" }) })
          .step("a" as any, { operation: setOp, params: (i) => ({ key: i.x, value: "2" }) })
          .build(),
      ).toThrow('Duplicate step name: "a"');
    });

    it("should throw on unknown dependency", () => {
      expect(() =>
        defineAction<{ x: string }>("unknown-dep")
          .step("a", {
            operation: setOp,
            params: (i) => ({ key: i.x, value: "1" }),
            dependsOn: ["nonexistent"] as any,
          })
          .build(),
      ).toThrow('depends on unknown step "nonexistent"');
    });

    it("should throw on cycle (A → B → A)", () => {
      expect(() =>
        defineAction<{ x: string }>("cycle")
          .compute("a", {
            dependsOn: ["b"] as any,
            fn: async () => 1,
          })
          .compute("b" as any, {
            dependsOn: ["a"] as any,
            fn: async () => 2,
          })
          .build(),
      ).toThrow("Cycle detected");
    });

    it("should throw on self-dependency", () => {
      expect(() =>
        defineAction<{ x: string }>("self-dep")
          .compute("a", {
            dependsOn: ["a"] as any,
            fn: async () => 1,
          })
          .build(),
      ).toThrow("Cycle detected");
    });

    it("should build successfully with valid dependencies", () => {
      const action = defineAction<{ x: string }>("valid")
        .step("a", { operation: setOp, params: (i) => ({ key: i.x, value: "1" }) })
        .compute("b", {
          dependsOn: ["a"] as const,
          fn: async (_input, deps) => deps.a.length,
        })
        .build();

      expect(action).toBeInstanceOf(CacheAction);
      expect(action.name).toBe("valid");
    });
  });

  // =============================================
  // BATCH BUILDING
  // =============================================

  describe("buildBatches", () => {
    it("should put independent steps in the same batch", () => {
      const steps: RegisteredStep[] = [
        { name: "a", kind: "operation", dependsOn: [], config: {} as any },
        { name: "b", kind: "operation", dependsOn: [], config: {} as any },
        { name: "c", kind: "compute", dependsOn: [], config: {} as any },
      ];

      const batches = buildBatches(steps);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(3);
    });

    it("should separate dependent steps into different batches", () => {
      const steps: RegisteredStep[] = [
        { name: "a", kind: "operation", dependsOn: [], config: {} as any },
        { name: "b", kind: "operation", dependsOn: [], config: {} as any },
        { name: "c", kind: "compute", dependsOn: ["a", "b"], config: {} as any },
        { name: "d", kind: "operation", dependsOn: ["c"], config: {} as any },
      ];

      const batches = buildBatches(steps);
      expect(batches).toHaveLength(3);
      expect(batches[0]!.map((s) => s.name).sort()).toEqual(["a", "b"]);
      expect(batches[1]!.map((s) => s.name)).toEqual(["c"]);
      expect(batches[2]!.map((s) => s.name)).toEqual(["d"]);
    });
  });

  // =============================================
  // EXECUTION
  // =============================================

  describe("execution", () => {
    it("should execute a simple action with independent steps", async () => {
      const action = defineAction<{ key1: string; key2: string }>("simple")
        .step("set1", {
          operation: setOp,
          params: (i) => ({ key: i.key1, value: "hello" }),
        })
        .step("set2", {
          operation: setOp,
          params: (i) => ({ key: i.key2, value: "world" }),
        })
        .build();

      const result = await action.run(cache, { key1: "k1", key2: "k2" });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.results.set1).toBe("OK");
      expect(result.results.set2).toBe("OK");
      expect(result.batches).toBe(1);

      // Verify values were actually set
      expect(await cache.get("k1")).toBe("hello");
      expect(await cache.get("k2")).toBe("world");
    });

    it("should resolve dependencies between steps", async () => {
      const action = defineAction<{ key: string }>("with-deps")
        .step("incr", {
          operation: incrOp,
          params: (i) => ({ key: i.key }),
        })
        .compute("doubled", {
          dependsOn: ["incr"] as const,
          fn: async (_input, deps) => deps.incr * 2,
        })
        .build();

      const result = await action.run(cache, { key: "counter" });

      expect(result.success).toBe(true);
      expect(result.results.incr).toBe(1);
      expect(result.results.doubled).toBe(2);
      expect(result.batches).toBe(2);
    });

    it("should execute fan-out steps", async () => {
      const action = defineAction<{ keys: string[] }>("fan-out")
        .fanOut("setAll", {
          generate: (input) =>
            input.keys.map((k) =>
              pipelineEntry(setOp, { key: k, value: `val-${k}` }),
            ),
        })
        .build();

      const result = await action.run(cache, { keys: ["a", "b", "c"] });

      expect(result.success).toBe(true);
      expect(result.batches).toBe(1);

      // Verify values were set
      expect(await cache.get("a")).toBe("val-a");
      expect(await cache.get("b")).toBe("val-b");
      expect(await cache.get("c")).toBe("val-c");
    });

    it("should handle fan-out with dependencies", async () => {
      const action = defineAction<{ prefix: string; keys: string[] }>("fan-out-deps")
        .compute("suffix", {
          fn: async (input) => `-${input.prefix}`,
        })
        .fanOut("setAll", {
          dependsOn: ["suffix"] as const,
          generate: (input, deps) =>
            input.keys.map((k) =>
              pipelineEntry(setOp, { key: k, value: `${k}${deps.suffix}` }),
            ),
        })
        .build();

      const result = await action.run(cache, { prefix: "pfx", keys: ["x", "y"] });

      expect(result.success).toBe(true);
      expect(await cache.get("x")).toBe("x-pfx");
      expect(await cache.get("y")).toBe("y-pfx");
    });

    it("should handle empty fan-out", async () => {
      const action = defineAction<{ keys: string[] }>("empty-fan-out")
        .fanOut("setAll", {
          generate: () => [],
        })
        .build();

      const result = await action.run(cache, { keys: [] });
      expect(result.success).toBe(true);
      expect(result.results.setAll).toEqual([]);
    });

    it("should support compute steps with cache access", async () => {
      // Pre-set a value
      await cache.set("existing", "42");

      const action = defineAction<{ key: string }>("cache-access")
        .compute("fetched", {
          fn: async (input, _deps, c) => {
            const val = await c.get(input.key);
            return Number(val);
          },
        })
        .build();

      const result = await action.run(cache, { key: "existing" });

      expect(result.success).toBe(true);
      expect(result.results.fetched).toBe(42);
    });

    it("should report execution time", async () => {
      const action = defineAction<{}>("timing")
        .compute("wait", {
          fn: async () => {
            await new Promise((r) => setTimeout(r, 10));
            return "done";
          },
        })
        .build();

      const result = await action.run(cache, {});
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(10);
    });
  });

  // =============================================
  // ERROR STRATEGIES
  // =============================================

  describe("error strategies", () => {
    const failOp = defineOperation<{ key: string }, never>({
      command: "INVALID_COMMAND_THAT_DOES_NOT_EXIST" as any,
      buildArgs: (p) => [p.key],
    });

    it('should abort on first error with "abort" strategy', async () => {
      const action = defineAction<{}>("abort-test")
        .compute("fail", {
          fn: async () => { throw new Error("boom"); },
        })
        .compute("after", {
          dependsOn: ["fail"] as const,
          fn: async (_i, deps) => deps.fail,
        })
        .onError("abort")
        .build();

      const result = await action.run(cache, {}, { errorStrategy: "abort" });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.stepName).toBe("fail");
      expect(result.results.after).toBeUndefined();
    });

    it('should skip dependents with "skip-dependents" strategy', async () => {
      const action = defineAction<{}>("skip-deps-test")
        .compute("a", { fn: async () => { throw new Error("a-fail"); } })
        .compute("b", { fn: async () => "b-ok" })
        .compute("c", {
          dependsOn: ["a"] as const,
          fn: async (_i, deps) => `c-${deps.a}`,
        })
        .compute("d", {
          dependsOn: ["b"] as const,
          fn: async (_i, deps) => `d-${deps.b}`,
        })
        .onError("skip-dependents")
        .build();

      const result = await action.run(cache, {});

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.stepName).toBe("a");
      // "c" depends on "a" which failed → skipped
      expect(result.results.c).toBeUndefined();
      // "b" and "d" should succeed
      expect(result.results.b).toBe("b-ok");
      expect(result.results.d).toBe("d-b-ok");
    });

    it('should continue all independent steps with "continue" strategy', async () => {
      const action = defineAction<{}>("continue-test")
        .compute("a", { fn: async () => { throw new Error("a-fail"); } })
        .compute("b", { fn: async () => "b-ok" })
        .compute("c", {
          dependsOn: ["a"] as const,
          fn: async (_i, deps) => `c-${deps.a}`,
        })
        .onError("continue")
        .build();

      const result = await action.run(cache, {}, { errorStrategy: "continue" });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.results.b).toBe("b-ok");
      // "c" runs even though "a" failed; deps.a will be undefined
      expect(result.results.c).toBe("c-undefined");
    });
  });

  // =============================================
  // COMPLEX WORKFLOWS
  // =============================================

  describe("complex workflows", () => {
    it("should handle a multi-step workflow with mixed step types", async () => {
      const action = defineAction<{ userId: string; postId: string }>("post-like")
        .step("incrLikes", {
          operation: incrOp,
          params: (i) => ({ key: `post:${i.postId}:likes` }),
        })
        .step("setFlag", {
          operation: setOp,
          params: (i) => ({ key: `user:${i.userId}:liked:${i.postId}`, value: "1" }),
        })
        .compute("score", {
          dependsOn: ["incrLikes"] as const,
          fn: async (_input, deps) => Math.round(Math.log10(deps.incrLikes + 1) * 100),
        })
        .fanOut("notify", {
          dependsOn: ["score"] as const,
          generate: (input, deps) => [
            pipelineEntry(setOp, {
              key: `notification:${input.userId}`,
              value: `score:${deps.score}`,
            }),
          ],
        })
        .build();

      const result = await action.run(cache, { userId: "u1", postId: "p1" });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.batches).toBe(3); // [incrLikes, setFlag] → [score] → [notify]

      // Verify side effects
      expect(await cache.get("user:u1:liked:p1")).toBe("1");
      const notif = await cache.get("notification:u1");
      expect(notif).toMatch(/^score:\d+$/);
    });
  });

  // =============================================
  // RETRY
  // =============================================

  describe("retry", () => {
    it("should retry a step and succeed on last attempt", async () => {
      let attempts = 0;

      const action = defineAction<{}>("retry-succeed")
        .compute("flaky", {
          retries: 3,
          retryDelay: 10,
          fn: async () => {
            attempts++;
            if (attempts < 3) throw new Error("not yet");
            return "ok";
          },
        })
        .build();

      const result = await action.run(cache, {});

      expect(result.success).toBe(true);
      expect(result.results.flaky).toBe("ok");
      expect(attempts).toBe(3);
    });

    it("should fail after retries exhausted", async () => {
      let attempts = 0;

      const action = defineAction<{}>("retry-fail")
        .compute("alwaysFail", {
          retries: 2,
          retryDelay: 10,
          fn: async () => {
            attempts++;
            throw new Error("permanent");
          },
        })
        .build();

      const result = await action.run(cache, {});

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error.message).toBe("permanent");
      // 1 initial + 2 retries = 3 total
      expect(attempts).toBe(3);
    });

    it("should use per-step retry overriding global", async () => {
      let attemptsA = 0;
      let attemptsB = 0;

      const action = defineAction<{}>("retry-override")
        .compute("a", {
          retries: 5,
          retryDelay: 10,
          fn: async () => {
            attemptsA++;
            if (attemptsA < 4) throw new Error("not yet");
            return "a-ok";
          },
        })
        .compute("b", {
          fn: async () => {
            attemptsB++;
            if (attemptsB < 2) throw new Error("not yet");
            return "b-ok";
          },
        })
        .build();

      // Global retries=1, but step "a" overrides to 5
      const result = await action.run(cache, {}, { retries: 1, retryDelay: 10 });

      expect(result.results.a).toBe("a-ok");
      expect(attemptsA).toBe(4); // step-level retries: 5 (used per-step)

      expect(result.results.b).toBe("b-ok");
      expect(attemptsB).toBe(2); // global retries: 1 (1 initial + 1 retry)
    });

    it("should timeout a step with stepTimeout", async () => {
      const action = defineAction<{}>("timeout-test")
        .compute("slow", {
          fn: async () => {
            await new Promise((r) => setTimeout(r, 500));
            return "done";
          },
        })
        .build();

      const result = await action.run(cache, {}, { stepTimeout: 50 });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error.message).toBe("Step timed out");
    });
  });

  // =============================================
  // ROLLBACK
  // =============================================

  describe("rollback", () => {
    it("should run undo handlers in reverse completion order on failure", async () => {
      const undoOrder: string[] = [];

      const action = defineAction<{ key: string }>("rollback-order")
        .step("set1", {
          operation: setOp,
          params: (i) => ({ key: `${i.key}:1`, value: "v1" }),
          undo: async (_input, _result, _cache) => {
            undoOrder.push("set1");
          },
        })
        .compute("derived", {
          dependsOn: ["set1"] as const,
          fn: async () => "computed",
          undo: async () => {
            undoOrder.push("derived");
          },
        })
        .compute("boom", {
          dependsOn: ["derived"] as const,
          fn: async () => {
            throw new Error("intentional");
          },
        })
        .build();

      const result = await action.run(cache, { key: "rk" }, { rollbackOnFailure: true });

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
      // Reverse completion order: derived completed after set1, so undo derived first
      expect(undoOrder).toEqual(["derived", "set1"]);
    });

    it("should collect undo handler errors in rollbackErrors", async () => {
      const undoOrder: string[] = [];

      const action = defineAction<{}>("rollback-errors")
        .compute("a", {
          fn: async () => "a-result",
          undo: async () => {
            undoOrder.push("a");
            throw new Error("undo-a-fail");
          },
        })
        .compute("b", {
          fn: async () => "b-result",
          undo: async () => {
            undoOrder.push("b");
          },
        })
        .compute("fail", {
          dependsOn: ["a", "b"] as const,
          fn: async () => {
            throw new Error("fail");
          },
        })
        .build();

      const result = await action.run(cache, {}, { rollbackOnFailure: true });

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
      // Both undos should run even though "a" undo throws
      expect(undoOrder).toContain("a");
      expect(undoOrder).toContain("b");
      expect(result.rollbackErrors).toHaveLength(1);
      expect(result.rollbackErrors[0]!.stepName).toBe("a");
      expect(result.rollbackErrors[0]!.error.message).toBe("undo-a-fail");
    });

    it("should skip steps without undo handler during rollback", async () => {
      const undoOrder: string[] = [];

      const action = defineAction<{}>("rollback-skip")
        .compute("noUndo", {
          fn: async () => "no-undo-result",
        })
        .compute("hasUndo", {
          fn: async () => "has-undo-result",
          undo: async () => {
            undoOrder.push("hasUndo");
          },
        })
        .compute("fail", {
          dependsOn: ["noUndo", "hasUndo"] as const,
          fn: async () => {
            throw new Error("fail");
          },
        })
        .build();

      const result = await action.run(cache, {}, { rollbackOnFailure: true });

      expect(result.rolledBack).toBe(true);
      expect(undoOrder).toEqual(["hasUndo"]);
    });

    it("should not trigger rollback when rollbackOnFailure is false (default)", async () => {
      let undoCalled = false;

      const action = defineAction<{}>("no-rollback")
        .compute("a", {
          fn: async () => "ok",
          undo: async () => { undoCalled = true; },
        })
        .compute("fail", {
          dependsOn: ["a"] as const,
          fn: async () => {
            throw new Error("fail");
          },
        })
        .build();

      const result = await action.run(cache, {});

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(false);
      expect(result.rollbackErrors).toEqual([]);
      expect(undoCalled).toBe(false);
    });

    it("should pass correct input and result to undo handler", async () => {
      let undoInput: unknown;
      let undoResult: unknown;

      const action = defineAction<{ key: string }>("undo-args")
        .step("setVal", {
          operation: setOp,
          params: (i) => ({ key: i.key, value: "hello" }),
          undo: async (input, result) => {
            undoInput = input;
            undoResult = result;
          },
        })
        .compute("fail", {
          dependsOn: ["setVal"] as const,
          fn: async () => {
            throw new Error("fail");
          },
        })
        .build();

      await action.run(cache, { key: "mykey" }, { rollbackOnFailure: true });

      expect(undoInput).toEqual({ key: "mykey" });
      expect(undoResult).toBe("OK");
    });
  });
});
