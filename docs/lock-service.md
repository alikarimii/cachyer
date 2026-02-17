# Distributed Lock Service

Redis-backed distributed locking using SET NX PX with Lua scripts for safe release and extension.

## Setup

```typescript
import { createLockService } from "cachyer";

const lockService = createLockService(adapter, {
  keyPrefix: "lock",           // default: "lock"
  defaultTtlMs: 10000,        // default: 10s
  defaultTimeoutMs: 5000,     // default: 5s (acquire timeout)
  defaultRetryIntervalMs: 100, // default: 100ms
});
```

## withLock (Recommended)

Automatically acquires, executes, and releases:

```typescript
const result = await lockService.withLock(
  "feed-generation:user-42",
  async () => {
    const feed = await generateFeed(userId);
    return feed;
  },
  {
    ttlMs: 30000,
    timeoutMs: 10000,
    retryIntervalMs: 200,
  },
);
```

Throws if the lock cannot be acquired within the timeout.

## Manual Lock Management

### acquireLock

```typescript
const result = await lockService.acquireLock("order:123");

if (result.acquired) {
  // Do work...
  await lockService.releaseLock("order:123", result.ownerId);
}
```

### releaseLock

Uses a Lua script to ensure only the lock owner can release:

```typescript
const released = await lockService.releaseLock("order:123", ownerId);
// true if released, false if owned by someone else
```

### extendLock

Extend TTL for long-running operations:

```typescript
const extended = await lockService.extendLock("order:123", 15000, ownerId);
// true if extended, false if expired or wrong owner
```

## When to Use

- Preventing concurrent feed generation for the same user
- Ensuring only one worker processes a job at a time
- Coordinating access to shared resources across instances
