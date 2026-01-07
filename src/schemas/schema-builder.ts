// =============================================
// CACHYER - SCHEMA BUILDER
// =============================================
// Fluent API for building custom cache schemas
// =============================================

import type { CacheStructure } from "../types/core.types";
import type { CacheOperation, CacheSchema } from "../types/operation.types";
import { createKeyBuilder, type KeyBuilder } from "../utils/key-patterns";

/**
 * Schema builder configuration
 */
export interface SchemaBuilderConfig {
  name: string;
  keyPattern: string;
  structure: CacheStructure;
  ttl: number;
  maxSize?: number;
  description?: string;
  namespace?: string;
  version?: number;
  tags?: string[];
}

/**
 * Operation builder for creating typed operations
 */
export class OperationBuilder<TKeyParams extends Record<string, unknown>> {
  private readonly keyBuilder: KeyBuilder<TKeyParams>;
  private readonly operations: Record<string, CacheOperation<any, any>> = {};

  constructor(keyBuilder: KeyBuilder<TKeyParams>) {
    this.keyBuilder = keyBuilder;
  }

  /**
   * Add a custom operation
   */
  addOperation<TParams extends Record<string, unknown>, TResult>(
    name: string,
    operation: CacheOperation<TParams, TResult>
  ): this {
    this.operations[name] = operation;
    return this;
  }

  /**
   * Add a string GET operation
   */
  addGet<TResult = string | null>(
    name: string = "get",
    parseResult?: (result: unknown) => TResult
  ): this {
    this.operations[name] = {
      command: "GET",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: parseResult ?? ((r) => r as TResult),
      description: `Get value from cache`,
    };
    return this;
  }

  /**
   * Add a string SET operation
   */
  addSet<TValue = string>(name: string = "set", ttl?: number): this {
    const buildArgs = ttl
      ? (params: TKeyParams & { value: TValue }) => [
          this.keyBuilder(params),
          String(params.value),
          "EX",
          ttl,
        ]
      : (params: TKeyParams & { value: TValue }) => [
          this.keyBuilder(params),
          String(params.value),
        ];

    this.operations[name] = {
      command: ttl ? "SETEX" : "SET",
      buildArgs: buildArgs,
      parseResult: (r) => r as "OK",
      description: `Set value in cache${ttl ? ` with ${ttl}s TTL` : ""}`,
    };
    return this;
  }

  /**
   * Add a hash HGETALL operation
   */
  addHashGetAll<TResult = Record<string, string>>(
    name: string = "getAll",
    parseResult?: (result: unknown) => TResult
  ): this {
    this.operations[name] = {
      command: "HGETALL",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: parseResult ?? ((r) => r as TResult),
      description: `Get all hash fields`,
    };
    return this;
  }

  /**
   * Add a hash HGET operation
   */
  addHashGet<TResult = string | null>(
    name: string = "getField",
    parseResult?: (result: unknown) => TResult
  ): this {
    this.operations[name] = {
      command: "HGET",
      buildArgs: (params: TKeyParams & { field: string }) => [
        this.keyBuilder(params),
        params.field,
      ],
      parseResult: parseResult ?? ((r) => r as TResult),
      description: `Get hash field`,
    };
    return this;
  }

  /**
   * Add a hash HSET operation
   */
  addHashSet(name: string = "setField"): this {
    this.operations[name] = {
      command: "HSET",
      buildArgs: (params: TKeyParams & { field: string; value: string }) => [
        this.keyBuilder(params),
        params.field,
        params.value,
      ],
      parseResult: (r) => r as number,
      description: `Set hash field`,
    };
    return this;
  }

  /**
   * Add a hash HMSET operation
   */
  addHashSetMultiple(name: string = "setMultiple"): this {
    this.operations[name] = {
      command: "HMSET",
      buildArgs: (
        params: TKeyParams & { fields: Record<string, string | number> }
      ) => {
        const args: (string | number)[] = [this.keyBuilder(params)];
        for (const [field, value] of Object.entries(params.fields)) {
          args.push(field, value);
        }
        return args;
      },
      parseResult: (r) => r as "OK",
      description: `Set multiple hash fields`,
    };
    return this;
  }

  /**
   * Add a sorted set ZADD operation
   */
  addSortedSetAdd(name: string = "add"): this {
    this.operations[name] = {
      command: "ZADD",
      buildArgs: (params: TKeyParams & { member: string; score: number }) => [
        this.keyBuilder(params),
        params.score,
        params.member,
      ],
      parseResult: (r) => r as number,
      description: `Add to sorted set`,
    };
    return this;
  }

  /**
   * Add a sorted set ZREVRANGE operation
   */
  addSortedSetGetRange<TResult = string[]>(
    name: string = "getRange",
    withScores: boolean = false,
    parseResult?: (result: unknown) => TResult
  ): this {
    const defaultParse = withScores
      ? (result: unknown) => {
          const arr = result as string[];
          const items: Array<{ member: string; score: number }> = [];
          for (let i = 0; i < arr.length; i += 2) {
            items.push({ member: arr[i]!, score: parseFloat(arr[i + 1]!) });
          }
          return items as unknown as TResult;
        }
      : (result: unknown) => result as TResult;

    this.operations[name] = {
      command: "ZREVRANGE",
      buildArgs: (params: TKeyParams & { start: number; stop: number }) => {
        const args: (string | number)[] = [
          this.keyBuilder(params),
          params.start,
          params.stop,
        ];
        if (withScores) args.push("WITHSCORES");
        return args;
      },
      parseResult: parseResult ?? defaultParse,
      description: `Get range from sorted set`,
    };
    return this;
  }

  /**
   * Add a set SADD operation
   */
  addSetAdd(name: string = "add"): this {
    this.operations[name] = {
      command: "SADD",
      buildArgs: (params: TKeyParams & { member: string }) => [
        this.keyBuilder(params),
        params.member,
      ],
      parseResult: (r) => r as number,
      description: `Add to set`,
    };
    return this;
  }

  /**
   * Add a set SMEMBERS operation
   */
  addSetGetAll<TResult = string[]>(
    name: string = "getAll",
    parseResult?: (result: unknown) => TResult
  ): this {
    this.operations[name] = {
      command: "SMEMBERS",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: parseResult ?? ((r) => r as TResult),
      description: `Get all set members`,
    };
    return this;
  }

  /**
   * Add a set SISMEMBER operation
   */
  addSetIsMember(name: string = "has"): this {
    this.operations[name] = {
      command: "SISMEMBER",
      buildArgs: (params: TKeyParams & { member: string }) => [
        this.keyBuilder(params),
        params.member,
      ],
      parseResult: (r) => (r as number) === 1,
      description: `Check if member exists in set`,
    };
    return this;
  }

  /**
   * Add a list LPUSH operation
   */
  addListPush(name: string = "push"): this {
    this.operations[name] = {
      command: "LPUSH",
      buildArgs: (params: TKeyParams & { value: string }) => [
        this.keyBuilder(params),
        params.value,
      ],
      parseResult: (r) => r as number,
      description: `Push to list`,
    };
    return this;
  }

  /**
   * Add a list LRANGE operation
   */
  addListGetRange<TResult = string[]>(
    name: string = "getRange",
    parseResult?: (result: unknown) => TResult
  ): this {
    this.operations[name] = {
      command: "LRANGE",
      buildArgs: (params: TKeyParams & { start: number; stop: number }) => [
        this.keyBuilder(params),
        params.start,
        params.stop,
      ],
      parseResult: parseResult ?? ((r) => r as TResult),
      description: `Get range from list`,
    };
    return this;
  }

  /**
   * Add an INCR operation
   */
  addIncrement(name: string = "increment"): this {
    this.operations[name] = {
      command: "INCR",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => r as number,
      description: `Increment counter`,
    };
    return this;
  }

  /**
   * Add an INCRBY operation
   */
  addIncrementBy(name: string = "incrementBy"): this {
    this.operations[name] = {
      command: "INCRBY",
      buildArgs: (params: TKeyParams & { amount: number }) => [
        this.keyBuilder(params),
        params.amount,
      ],
      parseResult: (r) => r as number,
      description: `Increment counter by amount`,
    };
    return this;
  }

  /**
   * Add an EXPIRE operation
   */
  addExpire(name: string = "expire", defaultTtl?: number): this {
    this.operations[name] = {
      command: "EXPIRE",
      buildArgs: (params: TKeyParams & { ttl?: number }) => [
        this.keyBuilder(params),
        params.ttl ?? defaultTtl ?? 3600,
      ],
      parseResult: (r) => (r as number) === 1,
      description: `Set expiration`,
    };
    return this;
  }

  /**
   * Add a TTL operation
   */
  addTtl(name: string = "ttl"): this {
    this.operations[name] = {
      command: "TTL",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => r as number,
      description: `Get TTL`,
    };
    return this;
  }

  /**
   * Add a DEL operation
   */
  addDelete(name: string = "delete"): this {
    this.operations[name] = {
      command: "DEL",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => (r as number) === 1,
      description: `Delete from cache`,
    };
    return this;
  }

  /**
   * Add an EXISTS operation
   */
  addExists(name: string = "exists"): this {
    this.operations[name] = {
      command: "EXISTS",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => (r as number) === 1,
      description: `Check if key exists`,
    };
    return this;
  }

  /**
   * Get all operations
   */
  getOperations(): Record<string, CacheOperation<any, any>> {
    return { ...this.operations };
  }
}

/**
 * Schema builder class
 */
export class SchemaBuilder<TKeyParams extends Record<string, unknown>> {
  private config: Partial<SchemaBuilderConfig> = {};
  private keyBuilder!: KeyBuilder<TKeyParams>;
  private operationBuilder!: OperationBuilder<TKeyParams>;

  /**
   * Set schema name
   */
  name(name: string): this {
    this.config.name = name;
    return this;
  }

  /**
   * Set key pattern (e.g., 'user:profile:{userId}')
   */
  keyPattern(pattern: string): this {
    this.config.keyPattern = pattern;
    this.keyBuilder = createKeyBuilder<TKeyParams>(pattern);
    this.operationBuilder = new OperationBuilder(this.keyBuilder);
    return this;
  }

  /**
   * Set data structure type
   */
  structure(structure: CacheStructure): this {
    this.config.structure = structure;
    return this;
  }

  /**
   * Set TTL in seconds
   */
  ttl(seconds: number): this {
    this.config.ttl = seconds;
    return this;
  }

  /**
   * Set max size (for lists, sets, sorted sets)
   */
  maxSize(size: number): this {
    this.config.maxSize = size;
    return this;
  }

  /**
   * Set description
   */
  description(desc: string): this {
    this.config.description = desc;
    return this;
  }

  /**
   * Set namespace
   */
  namespace(ns: string): this {
    this.config.namespace = ns;
    return this;
  }

  /**
   * Set version
   */
  version(v: number): this {
    this.config.version = v;
    return this;
  }

  /**
   * Set tags
   */
  tags(...tags: string[]): this {
    this.config.tags = tags;
    return this;
  }

  /**
   * Configure operations
   */
  operations(configure: (builder: OperationBuilder<TKeyParams>) => void): this {
    if (!this.operationBuilder) {
      throw new Error("Must set keyPattern before configuring operations");
    }
    configure(this.operationBuilder);
    return this;
  }

  /**
   * Build the schema
   */
  build(): CacheSchema<TKeyParams, Record<string, CacheOperation<any, any>>> {
    if (!this.config.name) throw new Error("Schema name is required");
    if (!this.config.keyPattern) throw new Error("Key pattern is required");
    if (!this.config.structure) throw new Error("Structure is required");
    if (!this.config.ttl) throw new Error("TTL is required");

    return {
      name: this.config.name,
      key: this.keyBuilder as (params: Partial<TKeyParams>) => string,
      structure: this.config.structure,
      ttl: this.config.ttl,
      maxSize: this.config.maxSize,
      description: this.config.description,
      namespace: this.config.namespace,
      version: this.config.version,
      tags: this.config.tags,
      operations: this.operationBuilder.getOperations(),
    };
  }
}

/**
 * Create a new schema builder
 */
export function createSchema<
  TKeyParams extends Record<string, unknown>,
>(): SchemaBuilder<TKeyParams> {
  return new SchemaBuilder<TKeyParams>();
}

// =============================================
// PRE-BUILT SCHEMA TEMPLATES
// =============================================

/**
 * Create a simple key-value schema
 */
export function createKeyValueSchema<
  TKeyParams extends Record<string, unknown>,
>(name: string, keyPattern: string, ttl: number) {
  return createSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("STRING")
    .ttl(ttl)
    .operations((ops) => {
      ops.addGet().addSet(undefined, ttl).addDelete().addExists().addTtl();
    })
    .build();
}

/**
 * Create a hash schema
 */
export function createHashSchema<TKeyParams extends Record<string, unknown>>(
  name: string,
  keyPattern: string,
  ttl: number
) {
  return createSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("HASH")
    .ttl(ttl)
    .operations((ops) => {
      ops
        .addHashGetAll()
        .addHashGet()
        .addHashSet()
        .addHashSetMultiple()
        .addDelete()
        .addExists()
        .addExpire(undefined, ttl)
        .addTtl();
    })
    .build();
}

/**
 * Create a sorted set schema (for feeds, leaderboards)
 */
export function createSortedSetSchema<
  TKeyParams extends Record<string, unknown>,
>(name: string, keyPattern: string, ttl: number, maxSize?: number) {
  const builder = createSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("SORTED_SET")
    .ttl(ttl);

  if (maxSize !== undefined) {
    builder.maxSize(maxSize);
  }

  return builder
    .operations((ops) => {
      ops
        .addSortedSetAdd()
        .addSortedSetGetRange()
        .addSortedSetGetRange("getRangeWithScores", true)
        .addDelete()
        .addExists()
        .addExpire(undefined, ttl)
        .addTtl();
    })
    .build();
}

/**
 * Create a set schema (for relationships, tags)
 */
export function createSetSchema<TKeyParams extends Record<string, unknown>>(
  name: string,
  keyPattern: string,
  ttl: number
) {
  return createSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("SET")
    .ttl(ttl)
    .operations((ops) => {
      ops
        .addSetAdd()
        .addSetGetAll()
        .addSetIsMember()
        .addDelete()
        .addExists()
        .addExpire(undefined, ttl)
        .addTtl();
    })
    .build();
}

/**
 * Create a counter schema
 */
export function createCounterSchema<TKeyParams extends Record<string, unknown>>(
  name: string,
  keyPattern: string,
  ttl: number
) {
  return createSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("STRING")
    .ttl(ttl)
    .operations((ops) => {
      ops
        .addGet()
        .addIncrement()
        .addIncrementBy()
        .addDelete()
        .addExists()
        .addExpire(undefined, ttl)
        .addTtl();
    })
    .build();
}
