# Pipeline vs Transaction vs Lua Script

When working with Redis through cachyer, three execution primitives are available
for running multiple commands together. Choosing the wrong one is a common source
of bugs — partial state, race conditions, or unnecessary complexity. This document
explains what each primitive guarantees and when to use it.

---

## The Three Primitives

### 1. Pipeline

A pipeline batches multiple commands into a single network round-trip. Commands
are sent together and execute in order, but **other Redis clients can interleave
between them**. Individual commands within a pipeline can fail independently —
a failed ZADD does not prevent the EXPIRE that follows it from executing.

```typescript
await adapter.executePipeline([
  pipelineEntry(schema.operations.sortedSetAdd, { member: postId, score }),
  pipelineEntry(schema.operations.sortedSetRemoveOldest, { count: maxSize }),
  pipelineEntry(schema.operations.expire, {}),
])
```

**What it guarantees:**
- All commands are sent in one network round-trip (performance)
- Commands execute in the order they were added
- Results are returned as an array, one per command

**What it does NOT guarantee:**
- Atomicity — another client can read intermediate state between commands
- All-or-nothing — if command 2 fails, commands 1 and 3 may still succeed
- Rollback — there is no undo

**Use when:** commands are independent and brief inconsistency is acceptable.
This covers the vast majority of cache operations: feed population, trending
updates, batch writes. Cache data is always an approximation — brief transient
state between commands is harmless and self-corrects on the next write.

---

### 2. Transaction (`MULTI/EXEC`)

A transaction queues commands inside a `MULTI/EXEC` block. Redis executes the
entire block atomically — no other client can interleave between the queued
commands. The block is sent as a unit and executed as a unit.

```typescript
await adapter.executeTransaction([
  pipelineEntry(schema.operations.remove, { member: postId, fromKey: 'old' }),
  pipelineEntry(schema.operations.add, { member: postId, toKey: 'new' }),
])
```

**What it guarantees:**
- No other client observes intermediate state
- Commands run in sequence with no interleaving from other clients

**What it does NOT guarantee:**
- Rollback — Redis does not roll back on command error. If command 1 succeeds
  and command 2 returns a type error, command 1 stays committed. `MULTI/EXEC`
  is about execution order isolation, not ACID rollback.
- Decisions based on read values — you cannot read a value inside `MULTI/EXEC`
  and use it to decide what to write next. All commands must be decided before
  `EXEC` is called.

**The critical limitation:** this makes transactions unsuitable for
read-modify-write patterns. If you need to read a counter and increment it only
if it is below a threshold, a transaction alone cannot do this.

**Use when:** you need to guarantee that no other client sees the intermediate
state between two or more writes. Real examples:

```
# Move a post between two sorted sets atomically
MULTI
ZREM feed:old postId
ZADD feed:new score postId
EXEC

# Atomic swap of two values
MULTI
SET key:a valueB
SET key:b valueA
EXEC
```

---

### 3. Lua Script

A Lua script runs entirely inside the Redis process. Redis is single-threaded;
while a script is executing, **nothing else runs**. Scripts can read values,
apply logic, and write based on those reads — all as a single atomic operation.

```typescript
await cachyer.executeScript(myScript, [key], [threshold, increment])
```

The Lua script itself:
```lua
local current = redis.call('GET', KEYS[1])
if current == false or tonumber(current) < tonumber(ARGV[1]) then
  return redis.call('INCRBY', KEYS[1], ARGV[2])
end
return false
```

**What it guarantees:**
- True atomicity — read + decide + write happen with no interleaving, ever
- Can branch on read values — unlike transactions, the script sees the data
  before deciding what to write
- Exactly-once semantics for complex operations

**What it does NOT guarantee:**
- Rollback — if the script errors mid-execution, partial writes may have occurred
- Long-running scripts are safe but block all other Redis operations while running

**Use when:** you need to read a value and conditionally write based on it, and
the decision logic must be atomic. This is the correct tool for:

- Rate limiting (read count → check limit → increment if allowed)
- Conditional score updates (update only if new score is higher)
- Token bucket / sliding window algorithms
- Any "check-and-set" pattern

Lua scripts are also more efficient than `WATCH + MULTI/EXEC` (optimistic
locking) for read-modify-write, because they never need to retry on conflict.

---

## Decision Guide

```
Do you need to combine multiple commands?
│
├─ No → single cachyer.execute() call
│
└─ Yes
   │
   ├─ Do you need to READ a value and decide what to WRITE based on it?
   │  │
   │  └─ Yes → Lua Script
   │            (rate limiting, conditional update, check-and-set)
   │
   ├─ Do other clients reading intermediate state cause a real problem?
   │  │
   │  ├─ Yes → Transaction (MULTI/EXEC)
   │  │         (atomic move between keys, swap operations)
   │  │
   │  └─ No  → Pipeline
   │            (batch cache writes, feed seeding, trending updates)
   │
   └─ Is this purely for performance (fewer round-trips)?
      └─ Yes → Pipeline
```

---

## Common Scenarios

| Scenario | Primitive | Reason |
|---|---|---|
| Seed 200 posts into a home feed | Pipeline | Independent writes, performance |
| Add post + trim set + refresh TTL | Pipeline | Cache writes, brief inconsistency acceptable |
| Move post from draft feed to live feed | Transaction | No client should see post in neither feed |
| Rate limiting (10 req/min per user) | Lua Script | Must read count before deciding to allow |
| Update trending score only if higher | `ZADD GT` flag | Redis natively supports this without a script |
| Increment upvote count + emit event | Single `ZINCRBY` + NATS | Keep Redis and messaging concerns separate |
| Sliding window request counter | Lua Script | Read + prune + count + check is one atomic op |
| Populate multiple category feeds at once | Pipeline | Batch writes, order not critical |

---

## What "Atomicity" Actually Means in Redis

Redis uses the word "atomic" in two related but distinct ways:

1. **Single-command atomicity** — every Redis command is atomic by itself.
   `INCR`, `ZADD`, `HSET` cannot be interrupted mid-execution.

2. **Multi-command atomicity** — achieved via `MULTI/EXEC` or Lua scripts.
   No other client can observe state between the commands.

Pipelines provide neither form of multi-command atomicity. They provide
**batching** (one round-trip) and **ordered delivery** (commands arrive in
sequence), but not isolation from other clients.

---

## Practical Notes for cachyer

### Pipeline via adapter directly

```typescript
const adapter = this.cachyer.adapter
if (!adapterSupports(adapter, 'executePipeline')) {
  throw new Error('Adapter does not support pipeline operations')
}
await adapter.executePipeline([
  pipelineEntry(schema.operations.add, params1),
  pipelineEntry(schema.operations.expire, params2),
])
```

### Transaction via adapter directly

```typescript
const adapter = this.cachyer.adapter
if (!adapterSupports(adapter, 'executeTransaction')) {
  throw new Error('Adapter does not support transactions')
}
await adapter.executeTransaction([
  pipelineEntry(schema.operations.remove, paramsA),
  pipelineEntry(schema.operations.add, paramsB),
])
```

### Lua script via cachyer

```typescript
import { defineScript } from 'cachyer'

const myScript = defineScript({
  script: `
    local val = redis.call('GET', KEYS[1])
    if val == false then return 0 end
    if tonumber(val) >= tonumber(ARGV[1]) then return 0 end
    return redis.call('INCR', KEYS[1])
  `,
  parseResult: (r) => Number(r),
})

const result = await cachyer.executeScript(myScript, [key], [limit])
```

Scripts are cached by SHA hash after the first `EVAL` call. Subsequent calls
use `EVALSHA` automatically, avoiding re-sending the script body to Redis.
