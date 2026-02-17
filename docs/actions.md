# CacheAction — Multi-Step Workflows

A **define-once, execute-many** workflow abstraction for multi-step cache operations. When a single user action triggers multiple cache writes (increment counters, add to sets, update scores, fan-out to followers), CacheAction handles orchestration, pipeline batching, dependency resolution, and error handling.

## Quick Example

```typescript
import { defineAction, pipelineEntry } from "cachyer";

const postLiked = defineAction<{ postId: string; userId: string; followerIds: string[] }>("post-liked")
  // Batch 1: independent steps run in a single pipeline
  .step("incrementLikes", {
    operation: postStatsSchema.operations.incrementField,
    params: (input) => ({ postId: input.postId, field: "likes", amount: 1 }),
  })
  .step("addToLikers", {
    operation: postLikersSchema.operations.add,
    params: (input) => ({ postId: input.postId, member: input.userId }),
  })
  // Batch 2: depends on incrementLikes
  .compute("score", {
    dependsOn: ["incrementLikes"] as const,
    fn: async (input, deps) => Math.log10(deps.incrementLikes + 1) * 10,
  })
  // Batch 3: depends on score
  .fanOut("notifyFollowers", {
    dependsOn: ["score"] as const,
    generate: (input, deps) =>
      input.followerIds.map((fid) =>
        pipelineEntry(feedSchema.operations.add, {
          userId: fid,
          member: `post:${input.postId}`,
          score: deps.score,
        }),
      ),
  })
  .onError("skip-dependents")
  .build();

const result = await postLiked.run(cache, {
  postId: "post-123",
  userId: "user-42",
  followerIds: ["user-1", "user-2"],
});

result.success;        // true if all steps succeeded
result.results.score;  // typed as number
result.errors;         // StepError[]
result.batches;        // 3
```

## Step Types

| Type | What it does | Round-trips |
|------|-------------|-------------|
| `.step()` | Executes a `CacheOperation` via `cache.execute()` or batched into `cache.pipeline()` | 1 per batch |
| `.compute()` | Arbitrary async logic with access to input, deps, and cache | 0 |
| `.fanOut()` | Generates N pipeline entries from input/deps | 1 per fan-out |

Steps within the same batch (no mutual dependencies) run in parallel. Multiple operation steps in the same batch are combined into a single pipeline call.

### Operation Step

```typescript
.step("setFlag", {
  operation: mySchema.operations.set,
  params: (input) => ({ key: input.userId, value: "1" }),
})

// With dependencies
.step("updateScore", {
  dependsOn: ["computedScore"] as const,
  operation: scoreSchema.operations.set,
  params: (input, deps) => ({ key: input.id, value: String(deps.computedScore) }),
})
```

### Compute Step

```typescript
.compute("derived", {
  dependsOn: ["rawCount"] as const,
  fn: async (input, deps, cache) => {
    const extra = await cache.get(`extra:${input.id}`);
    return deps.rawCount * 2 + Number(extra);
  },
})
```

### Fan-Out Step

```typescript
.fanOut("notifyFollowers", {
  dependsOn: ["score"] as const,
  generate: (input, deps) =>
    input.followerIds.map((fid) =>
      pipelineEntry(feedOp, { userId: fid, score: deps.score }),
    ),
  parseResults: (results) => results.length, // optional transform
})
```

## Error Handling Strategies

Set on the builder or override per-execution:

```typescript
const action = defineAction<Input>("name")
  .step(...)
  .onError("skip-dependents") // builder default
  .build();

// Override at execution time
await action.run(cache, input, { errorStrategy: "abort" });
```

| Strategy | Behavior |
|----------|----------|
| `"abort"` | Stop on first error. Remaining batches skipped. |
| `"skip-dependents"` | Failed step's dependents skipped, independent steps continue. **(default)** |
| `"continue"` | All steps run. Failed deps resolve to `undefined`. |

## Per-Step Retry

Steps can retry automatically before being declared as failed:

```typescript
const action = defineAction<{ key: string }>("with-retries")
  .step("flaky", {
    operation: externalApiOp,
    params: (i) => ({ key: i.key }),
    retries: 3,        // retry up to 3 times
    retryDelay: 200,   // 200ms between attempts
  })
  .step("reliable", {
    operation: localOp,
    params: (i) => ({ key: i.key }),
    // No per-step retry — uses global default
  })
  .build();

// Global default: retry all steps up to 1 time
await action.run(cache, { key: "k1" }, {
  retries: 1,
  retryDelay: 100,
});
```

Per-step values override global defaults. When multiple operation steps are batched into a single pipeline and the pipeline fails, each step falls back to individual execution with retries.

Set `stepTimeout` to limit each attempt:

```typescript
await action.run(cache, input, {
  retries: 2,
  stepTimeout: 5000, // each attempt times out after 5s
});
```

## Rollback / Undo

Steps can define an `undo` handler — a compensation function that reverses side effects. When the action fails and `rollbackOnFailure: true` is set, undo handlers run in **reverse completion order**.

```typescript
const transferFunds = defineAction<{ from: string; to: string; amount: number }>("transfer")
  .compute("debit", {
    fn: async (input, _deps, cache) => {
      await cache.adapter.decrby(`balance:${input.from}`, input.amount);
      return input.amount;
    },
    undo: async (input, _result, cache) => {
      await cache.adapter.incrby(`balance:${input.from}`, input.amount);
    },
  })
  .compute("credit", {
    dependsOn: ["debit"] as const,
    fn: async (input, deps, cache) => {
      await cache.adapter.incrby(`balance:${input.to}`, deps.debit);
      return deps.debit;
    },
    undo: async (input, result, cache) => {
      await cache.adapter.decrby(`balance:${input.to}`, result);
    },
  })
  .build();

const result = await transferFunds.run(
  cache,
  { from: "alice", to: "bob", amount: 100 },
  { rollbackOnFailure: true },
);

result.rolledBack;      // true if rollback was attempted
result.rollbackErrors;  // errors from undo handlers (best-effort)
```

Key points:
- **Opt-in** — `rollbackOnFailure` defaults to `false`
- **Best-effort** — undo errors are collected, not thrown; other undos still run
- **Reverse order** — last completed step is undone first
- Each undo receives `(input, stepResult, cache)`

## Build-Time Validation

`.build()` validates the action definition:
- **Duplicate step names** — `Duplicate step name: "x"`
- **Unknown dependencies** — `Step "x" depends on unknown step "y"`
- **Cycles** — `Cycle detected in action steps: a -> b` (Kahn's algorithm)

## Type Safety

The builder accumulates step result types via TypeScript intersection:

```typescript
defineAction<{ id: string }>("example")       // CacheActionBuilder<Input, {}>
  .step("a", { ... })                          // { a: number }
  .compute("b", {
    dependsOn: ["a"] as const,
    fn: (input, deps) => {
      deps.a; // typed as number
      return "hello";
    },
  })                                           // { a: number } & { b: string }
```

- Duplicate step names produce a `never` type error at compile time
- `dependsOn` requires `as const` for typed `deps`
- `ActionResult.results` is typed as `Partial<TSteps>`
