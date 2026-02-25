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

// =============================================
// OPERATION TYPE DEFINITIONS
// =============================================
/**
 * Type for GET operation
 */
export type GetOperation<
  TKeyParams extends Record<string, unknown>,
  TResult = string | null,
> = CacheOperation<TKeyParams, TResult>;

/**
 * Type for SET operation
 */
export type SetOperation<
  TKeyParams extends Record<string, unknown>,
  TValue = string,
> = CacheOperation<TKeyParams & { value: TValue }, "OK">;

/**
 * Type for DELETE operation
 */
export type DeleteOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams, boolean>;

/**
 * Type for EXISTS operation
 */
export type ExistsOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams, boolean>;

/**
 * Type for TTL operation
 */
export type TtlOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams, number>;

/**
 * Type for EXPIRE operation
 */
export type ExpireOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { ttl?: number }, boolean>;

/**
 * Type for INCREMENT operation
 */
export type IncrementOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams, number>;

/**
 * Type for INCREMENT BY operation
 */
export type IncrementByOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { amount: number }, number>;

/**
 * Type for HASH GETALL operation
 */
export type HashGetAllOperation<
  TKeyParams extends Record<string, unknown>,
  TResult = Record<string, string>,
> = CacheOperation<TKeyParams, TResult>;

/**
 * Type for HASH GET operation
 */
export type HashGetOperation<
  TKeyParams extends Record<string, unknown>,
  TResult = string | null,
> = CacheOperation<TKeyParams & { field: string }, TResult>;

/**
 * Type for HASH SET operation
 */
export type HashSetOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { field: string; value: string }, number>;

/**
 * Type for HASH SET MULTIPLE operation
 */
export type HashSetMultipleOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<
  TKeyParams & { fields: Record<string, string | number> },
  "OK"
>;

/**
 * Type for SORTED SET ADD operation
 */
export type SortedSetAddOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { member: string; score: number }, number>;

/**
 * Type for SORTED SET GET RANGE operation
 */
export type SortedSetGetRangeOperation<
  TKeyParams extends Record<string, unknown>,
  TResult = string[],
> = CacheOperation<TKeyParams & { start: number; stop: number }, TResult>;

/**
 * Type for SORTED SET GET RANGE WITH SCORES operation
 */
export type SortedSetGetRangeWithScoresOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<
  TKeyParams & { start: number; stop: number },
  Array<{ member: string; score: number }>
>;

/**
 * Type for SORTED SET REMOVE operation
 */
export type SortedSetRemoveOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { member: string }, number>;

/**
 * Type for SORTED SET COUNT operation
 */
export type SortedSetCountOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams, number>;

/**
 * Type for SORTED SET SCORE operation
 */
export type SortedSetScoreOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { member: string }, number | null>;

/**
 * Type for SORTED SET RANK operation
 */
export type SortedSetRankOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { member: string }, number | null>;

/**
 * Type for SORTED SET INCREMENT BY operation
 */
export type SortedSetIncrementByOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { member: string; amount: number }, number>;

/**
 * Type for SORTED SET REMOVE OLDEST operation
 */
export type SortedSetRemoveOldestOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { count: number }, number>;

export type SortedSetCountInRangeOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { min: number; max: number }, number>;

export type SortedSetHasMemberOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { member: string }, boolean>;

export type SortedSetGetTopMembersOperation<
  TKeyParams extends Record<string, unknown>,
  TResult = Array<{ member: string; score: number }>,
> = CacheOperation<TKeyParams & { topN: number }, TResult>;

export type ListIndexOfOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { value: string }, number>;

export type ListInsertOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<
    TKeyParams & { before: boolean; pivot: string; value: string },
    number
  >;
/**
 * Type for SET ADD operation
 */
export type SetAddOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { member: string }, number>;

export type SetAddMultipleOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { members: string[] }, number>;

/**
 * Type for SET GET ALL operation
 */
export type SetGetAllOperation<
  TKeyParams extends Record<string, unknown>,
  TResult = string[],
> = CacheOperation<TKeyParams, TResult>;

/**
 * Type for SET IS MEMBER operation
 */
export type SetIsMemberOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { member: string }, boolean>;

export type SetRemoveOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { member: string }, number>;

export type SetCountOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams, number>;

export type SetGetRandomOperation<
  TKeyParams extends Record<string, unknown>,
  TResult = string | null,
> = CacheOperation<TKeyParams, TResult>;

/**
 * Type for LIST PUSH operation
 */
export type ListPushOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { value: string }, number>;

/**
 * Type for LIST GET RANGE operation
 */
export type ListGetRangeOperation<
  TKeyParams extends Record<string, unknown>,
  TResult = string[],
> = CacheOperation<TKeyParams & { start: number; stop: number }, TResult>;

/**
 * Type for LIST LENGTH operation
 */
export type ListLengthOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams, number>;

/**
 * Type for LIST POP operation
 */
export type ListPopOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams, string | null>;

/**
 * Type for LIST TRIM operation
 */
export type ListTrimOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { start: number; stop: number }, "OK">;

/**
 * Type for LIST SET operation
 */
export type ListSetOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { index: number; value: string }, "OK">;

/**
 * Type for LIST REMOVE operation
 */
export type ListRemoveOperation<TKeyParams extends Record<string, unknown>> =
  CacheOperation<TKeyParams & { count: number; value: string }, number>;

/**
 * Type for LIST GET BY INDEX operation
 */
export type ListGetByIndexOperation<
  TKeyParams extends Record<string, unknown>,
  TResult = string | null,
> = CacheOperation<TKeyParams & { index: number }, TResult>;

// =============================================
// HYPERLOGLOG TYPES
// =============================================

export type HyperLogLogAddOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { members: string[] }, number>;

export type HyperLogLogCountOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams, number>;

export type HyperLogLogMergeOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { sourceKeys: string[] }, "OK">;

// =============================================
// BLOOM FILTER OPERATION TYPE DEFINITIONS
// =============================================

export type BloomFilterAddOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { item: string }, boolean>;

export type BloomFilterMultiAddOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { items: string[] }, boolean[]>;

export type BloomFilterExistsOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { item: string }, boolean>;

export type BloomFilterMultiExistsOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { items: string[] }, boolean[]>;

export type BloomFilterReserveOperation<
  TKeyParams extends Record<string, unknown>,
> = CacheOperation<TKeyParams & { errorRate: number; capacity: number }, "OK">;

// =============================================
// TYPED OPERATION BUILDER
// =============================================
/**
 * Typed Operation builder that accumulates operation types
 * Each add* method returns a new builder with the operation added to TOperations
 */
export class TypedOperationBuilder<
  TKeyParams extends Record<string, unknown>,
  TOperations extends Record<string, CacheOperation<any, any>> = {},
> {
  private readonly keyBuilder: KeyBuilder<TKeyParams>;
  private readonly operations: Record<string, CacheOperation<any, any>> = {};

  constructor(
    keyBuilder: KeyBuilder<TKeyParams>,
    existingOps: Record<string, CacheOperation<any, any>> = {},
  ) {
    this.keyBuilder = keyBuilder;
    this.operations = { ...existingOps };
  }

  private withOperation<
    TName extends string,
    TOp extends CacheOperation<any, any>,
  >(
    name: TName,
    operation: TOp,
  ): TypedOperationBuilder<TKeyParams, TOperations & { [K in TName]: TOp }> {
    this.operations[name] = operation;
    return this as unknown as TypedOperationBuilder<
      TKeyParams,
      TOperations & { [K in TName]: TOp }
    >;
  }

  /**
   * Add a string GET operation
   */
  addGet<TName extends string = "get", TResult = string | null>(
    name?: TName,
    parseResult?: (result: unknown) => TResult,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: GetOperation<TKeyParams, TResult> }
  > {
    const opName = (name ?? "get") as TName;
    const operation: GetOperation<TKeyParams, TResult> = {
      command: "GET",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: parseResult ?? ((r) => r as TResult),
      description: `Get value from cache`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a string SET operation
   */
  addSet<TName extends string = "set", TValue = string>(
    name?: TName,
    ttl?: number,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SetOperation<TKeyParams, TValue> }
  > {
    const opName = (name ?? "set") as TName;
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

    const operation: SetOperation<TKeyParams, TValue> = {
      command: ttl ? "SETEX" : "SET",
      buildArgs: buildArgs,
      parseResult: (r) => r as "OK",
      description: `Set value in cache${ttl ? ` with ${ttl}s TTL` : ""}`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a DEL operation
   */
  addDelete<TName extends string = "delete">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: DeleteOperation<TKeyParams> }
  > {
    const opName = (name ?? "delete") as TName;
    const operation: DeleteOperation<TKeyParams> = {
      command: "DEL",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => (r as number) === 1,
      description: `Delete from cache`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add an EXISTS operation
   */
  addExists<TName extends string = "exists">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ExistsOperation<TKeyParams> }
  > {
    const opName = (name ?? "exists") as TName;
    const operation: ExistsOperation<TKeyParams> = {
      command: "EXISTS",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => (r as number) === 1,
      description: `Check if key exists`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a TTL operation
   */
  addTtl<TName extends string = "ttl">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: TtlOperation<TKeyParams> }
  > {
    const opName = (name ?? "ttl") as TName;
    const operation: TtlOperation<TKeyParams> = {
      command: "TTL",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => r as number,
      description: `Get TTL`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add an EXPIRE operation
   */
  addExpire<TName extends string = "expire">(
    name?: TName,
    defaultTtl?: number,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ExpireOperation<TKeyParams> }
  > {
    const opName = (name ?? "expire") as TName;
    const operation: ExpireOperation<TKeyParams> = {
      command: "EXPIRE",
      buildArgs: (params: TKeyParams & { ttl?: number }) => [
        this.keyBuilder(params),
        params.ttl ?? defaultTtl ?? 3600,
      ],
      parseResult: (r) => (r as number) === 1,
      description: `Set expiration`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add an INCR operation
   */
  addIncrement<TName extends string = "increment">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: IncrementOperation<TKeyParams> }
  > {
    const opName = (name ?? "increment") as TName;
    const operation: IncrementOperation<TKeyParams> = {
      command: "INCR",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => r as number,
      description: `Increment counter`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add an INCRBY operation
   */
  addIncrementBy<TName extends string = "incrementBy">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: IncrementByOperation<TKeyParams> }
  > {
    const opName = (name ?? "incrementBy") as TName;
    const operation: IncrementByOperation<TKeyParams> = {
      command: "INCRBY",
      buildArgs: (params: TKeyParams & { amount: number }) => [
        this.keyBuilder(params),
        params.amount,
      ],
      parseResult: (r) => r as number,
      description: `Increment counter by amount`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a hash HGETALL operation
   */
  addHashGetAll<
    TName extends string = "hashGetAll",
    TResult = Record<string, string>,
  >(
    name?: TName,
    parseResult?: (result: unknown) => TResult,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: HashGetAllOperation<TKeyParams, TResult> }
  > {
    const opName = (name ?? "hashGetAll") as TName;
    const operation: HashGetAllOperation<TKeyParams, TResult> = {
      command: "HGETALL",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: parseResult ?? ((r) => r as TResult),
      description: `Get all hash fields`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a hash HGET operation
   */
  addHashGet<TName extends string = "hashGetField", TResult = string | null>(
    name?: TName,
    parseResult?: (result: unknown) => TResult,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: HashGetOperation<TKeyParams, TResult> }
  > {
    const opName = (name ?? "hashGetField") as TName;
    const operation: HashGetOperation<TKeyParams, TResult> = {
      command: "HGET",
      buildArgs: (params: TKeyParams & { field: string }) => [
        this.keyBuilder(params),
        params.field,
      ],
      parseResult: parseResult ?? ((r) => r as TResult),
      description: `Get hash field`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a hash HSET operation
   */
  addHashSet<TName extends string = "hashSet">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: HashSetOperation<TKeyParams> }
  > {
    const opName = (name ?? "hashSet") as TName;
    const operation: HashSetOperation<TKeyParams> = {
      command: "HSET",
      buildArgs: (params: TKeyParams & { field: string; value: string }) => [
        this.keyBuilder(params),
        params.field,
        params.value,
      ],
      parseResult: (r) => r as number,
      description: `Set hash field`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a hash HMSET operation
   */
  addHashSetMultiple<TName extends string = "hashSetMultiple">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: HashSetMultipleOperation<TKeyParams> }
  > {
    const opName = (name ?? "hashSetMultiple") as TName;
    const operation: HashSetMultipleOperation<TKeyParams> = {
      command: "HMSET",
      buildArgs: (
        params: TKeyParams & { fields: Record<string, string | number> },
      ) => {
        return [this.keyBuilder(params), params.fields] as unknown as (
          | string
          | number
        )[];
      },
      parseResult: (r) => r as "OK",
      description: `Set multiple hash fields`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a sorted set ZADD operation
   */
  addSortedSetAdd<TName extends string = "sortedSetAdd">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SortedSetAddOperation<TKeyParams> }
  > {
    const opName = (name ?? "sortedSetAdd") as TName;
    const operation: SortedSetAddOperation<TKeyParams> = {
      command: "ZADD",
      buildArgs: (params: TKeyParams & { member: string; score: number }) => [
        this.keyBuilder(params),
        params.score,
        params.member,
      ],
      parseResult: (r) => r as number,
      description: `Add to sorted set`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a sorted set ZREVRANGE operation
   */
  addSortedSetGetRange<
    TName extends string = "sortedSetGetRange",
    TResult = string[],
  >(
    name?: TName,
    withScores: boolean = false,
    parseResult?: (result: unknown) => TResult,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & {
      [K in TName]: SortedSetGetRangeOperation<TKeyParams, TResult>;
    }
  > {
    const opName = (name ?? "sortedSetGetRange") as TName;
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

    const operation: SortedSetGetRangeOperation<TKeyParams, TResult> = {
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
    return this.withOperation(opName, operation);
  }

  /**
   * Add a sorted set ZREVRANGE operation with scores
   */
  addSortedSetGetRangeWithScores<
    TName extends string = "sortedSetGetRangeWithScores",
  >(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & {
      [K in TName]: SortedSetGetRangeWithScoresOperation<TKeyParams>;
    }
  > {
    const opName = (name ?? "sortedSetGetRangeWithScores") as TName;
    const operation: SortedSetGetRangeWithScoresOperation<TKeyParams> = {
      command: "ZREVRANGE",
      buildArgs: (params: TKeyParams & { start: number; stop: number }) => [
        this.keyBuilder(params),
        params.start,
        params.stop,
        "WITHSCORES",
      ],
      parseResult: (result: unknown) => {
        const arr = result as string[];
        const items: Array<{ member: string; score: number }> = [];
        for (let i = 0; i < arr.length; i += 2) {
          items.push({ member: arr[i]!, score: parseFloat(arr[i + 1]!) });
        }
        return items;
      },
      description: `Get range with scores from sorted set`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a sorted set ZREM operation
   */
  addSortedSetRemove<TName extends string = "sortedSetRemove">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SortedSetRemoveOperation<TKeyParams> }
  > {
    const opName = (name ?? "sortedSetRemove") as TName;
    const operation: SortedSetRemoveOperation<TKeyParams> = {
      command: "ZREM",
      buildArgs: (params: TKeyParams & { member: string }) => [
        this.keyBuilder(params),
        params.member,
      ],
      parseResult: (r) => r as number,
      description: `Remove from sorted set`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a sorted set ZCARD operation
   */
  addSortedSetCount<TName extends string = "sortedSetCount">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SortedSetCountOperation<TKeyParams> }
  > {
    const opName = (name ?? "sortedSetCount") as TName;
    const operation: SortedSetCountOperation<TKeyParams> = {
      command: "ZCARD",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => r as number,
      description: `Get sorted set count`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a sorted set ZSCORE operation
   */
  addSortedSetGetScore<TName extends string = "sortedSetGetScore">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SortedSetScoreOperation<TKeyParams> }
  > {
    const opName = (name ?? "sortedSetGetScore") as TName;
    const operation: SortedSetScoreOperation<TKeyParams> = {
      command: "ZSCORE",
      buildArgs: (params: TKeyParams & { member: string }) => [
        this.keyBuilder(params),
        params.member,
      ],
      parseResult: (r) => (r === null ? null : parseFloat(r as string)),
      description: `Get score of member in sorted set`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a sorted set ZREVRANK operation
   */
  addSortedSetGetRank<TName extends string = "sortedSetGetRank">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SortedSetRankOperation<TKeyParams> }
  > {
    const opName = (name ?? "sortedSetGetRank") as TName;
    const operation: SortedSetRankOperation<TKeyParams> = {
      command: "ZREVRANK",
      buildArgs: (params: TKeyParams & { member: string }) => [
        this.keyBuilder(params),
        params.member,
      ],
      parseResult: (r) => (r === null ? null : (r as number)),
      description: `Get rank of member in sorted set`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a sorted set ZINCRBY operation
   */
  addSortedSetIncrementBy<TName extends string = "sortedSetIncrementBy">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SortedSetIncrementByOperation<TKeyParams> }
  > {
    const opName = (name ?? "sortedSetIncrementBy") as TName;
    const operation: SortedSetIncrementByOperation<TKeyParams> = {
      command: "ZINCRBY",
      buildArgs: (params: TKeyParams & { member: string; amount: number }) => [
        this.keyBuilder(params),
        params.amount,
        params.member,
      ],
      parseResult: (r) => parseFloat(r as string),
      description: `Increment score of member in sorted set`,
    };
    return this.withOperation(opName, operation);
  }
  addSortedSetRemoveOldest<TName extends string = "sortedSetRemoveOldest">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SortedSetRemoveOldestOperation<TKeyParams> }
  > {
    const opName = (name ?? "sortedSetRemoveOldest") as TName;
    const operation: SortedSetRemoveOldestOperation<TKeyParams> = {
      command: "ZREMRANGEBYRANK",
      buildArgs: (params: TKeyParams & { count: number }) => [
        this.keyBuilder(params),
        0,
        // Keep top `count` members: remove ranks [0 .. -(count+1)].
        // Redis resolves negative stop as (cardinality + stop); when
        // cardinality <= count the range is empty and nothing is removed.
        -(params.count + 1),
      ],
      parseResult: (r) => r as number,
      description: `Trim sorted set to keep only the top N (count) members`,
    };
    return this.withOperation(opName, operation);
  }
  addSortedSetCountInRange<TName extends string = "sortedSetCountInRange">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SortedSetCountInRangeOperation<TKeyParams> }
  > {
    const opName = (name ?? "sortedSetCountInRange") as TName;
    const operation: SortedSetCountInRangeOperation<TKeyParams> = {
      command: "ZCOUNT",
      buildArgs: (params: TKeyParams & { min: number; max: number }) => [
        this.keyBuilder(params),
        params.min,
        params.max,
      ],
      parseResult: (r) => r as number,
      description: `Count members in score range in sorted set`,
    };
    return this.withOperation(opName, operation);
  }
  addSortedSetHasMember<TName extends string = "sortedSetHasMember">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SortedSetHasMemberOperation<TKeyParams> }
  > {
    const opName = (name ?? "sortedSetHasMember") as TName;
    const operation: SortedSetHasMemberOperation<TKeyParams> = {
      command: "ZSCORE",
      buildArgs: (params: TKeyParams & { member: string }) => [
        this.keyBuilder(params),
        params.member,
      ],
      parseResult: (r) => r !== null,
      description: `Check if member exists in sorted set`,
    };
    return this.withOperation(opName, operation);
  }
  addSortedSetGetTopMembers<TName extends string = "sortedSetGetTopMembers">(
    name?: TName,
    parseResult?: (result: unknown) => Array<{ member: string; score: number }>,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & {
      [K in TName]: SortedSetGetTopMembersOperation<TKeyParams>;
    }
  > {
    const defaultParse = (result: unknown) => {
      const arr = result as string[];
      const items: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < arr.length; i += 2) {
        items.push({ member: arr[i]!, score: parseFloat(arr[i + 1]!) });
      }
      return items;
    };

    const opName = (name ?? "sortedSetGetTopMembers") as TName;
    const operation: SortedSetGetTopMembersOperation<TKeyParams> = {
      command: "ZREVRANGE",
      buildArgs: (params: TKeyParams & { topN: number }) => [
        this.keyBuilder(params),
        0,
        params.topN - 1,
        "WITHSCORES",
      ],
      parseResult: parseResult ?? defaultParse,
      description: `Get top N members from sorted set`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a set SADD operation
   */
  addSetAdd<TName extends string = "setAdd">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SetAddOperation<TKeyParams> }
  > {
    const opName = (name ?? "setAdd") as TName;
    const operation: SetAddOperation<TKeyParams> = {
      command: "SADD",
      buildArgs: (params: TKeyParams & { member: string }) => [
        this.keyBuilder(params),
        params.member,
      ],
      parseResult: (r) => r as number,
      description: `Add to set`,
    };
    return this.withOperation(opName, operation);
  }
  /**
   * Add a set SADD multiple operation
   */
  addSetAddMultiple<TName extends string = "setAddMultiple">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SetAddMultipleOperation<TKeyParams> }
  > {
    const opName = (name ?? "setAddMultiple") as TName;
    const operation: SetAddMultipleOperation<TKeyParams> = {
      command: "SADD",
      buildArgs: (params: TKeyParams & { members: string[] }) => [
        this.keyBuilder(params),
        ...params.members,
      ],
      parseResult: (r) => r as number,
      description: `Add multiple to set`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a set SMEMBERS operation
   */
  addSetGetAll<TName extends string = "setGetAll", TResult = string[]>(
    name?: TName,
    parseResult?: (result: unknown) => TResult,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SetGetAllOperation<TKeyParams, TResult> }
  > {
    const opName = (name ?? "setGetAll") as TName;
    const operation: SetGetAllOperation<TKeyParams, TResult> = {
      command: "SMEMBERS",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: parseResult ?? ((r) => r as TResult),
      description: `Get all set members`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a set SISMEMBER operation
   */
  addSetHasMember<TName extends string = "setHasMember">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SetIsMemberOperation<TKeyParams> }
  > {
    const opName = (name ?? "setHasMember") as TName;
    const operation: SetIsMemberOperation<TKeyParams> = {
      command: "SISMEMBER",
      buildArgs: (params: TKeyParams & { member: string }) => [
        this.keyBuilder(params),
        params.member,
      ],
      parseResult: (r) => (r as number) === 1,
      description: `Check if member exists in set`,
    };
    return this.withOperation(opName, operation);
  }
  /**
   * Add a set SREM operation
   */
  addSetRemove<TName extends string = "setRemove">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SetRemoveOperation<TKeyParams> }
  > {
    const opName = (name ?? "setRemove") as TName;
    const operation: SetRemoveOperation<TKeyParams> = {
      command: "SREM",
      buildArgs: (params: TKeyParams & { member: string }) => [
        this.keyBuilder(params),
        params.member,
      ],
      parseResult: (result) => result as number,
      description: "Remove member from set",
    };
    return this.withOperation(opName, operation);
  }
  /**
   * Add a set SCARD operation
   */
  addSetCount<TName extends string = "setCount">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SetCountOperation<TKeyParams> }
  > {
    const opName = (name ?? "setCount") as TName;
    const operation: SetCountOperation<TKeyParams> = {
      command: "SCARD",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (result) => result as number,
      description: "Count members in set",
    };
    return this.withOperation(opName, operation);
  }
  addSetGetRandom<TName extends string = "setGetRandom">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: SetGetRandomOperation<TKeyParams> }
  > {
    const opName = (name ?? "setGetRandom") as TName;
    const operation: SetGetRandomOperation<TKeyParams> = {
      command: "SRANDMEMBER",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (result) => result as string | null,
      description: "Get random member from set",
    };
    return this.withOperation(opName, operation);
  }
  /**
   * Add a list LPUSH operation
   */
  addListPush<TName extends string = "listPush">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ListPushOperation<TKeyParams> }
  > {
    const opName = (name ?? "listPush") as TName;
    const operation: ListPushOperation<TKeyParams> = {
      command: "LPUSH",
      buildArgs: (params: TKeyParams & { value: string }) => [
        this.keyBuilder(params),
        params.value,
      ],
      parseResult: (r) => r as number,
      description: `Push to list`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a list LRANGE operation
   */
  addListGetRange<TName extends string = "listGetRange", TResult = string[]>(
    name?: TName,
    parseResult?: (result: unknown) => TResult,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ListGetRangeOperation<TKeyParams, TResult> }
  > {
    const opName = (name ?? "listGetRange") as TName;
    const operation: ListGetRangeOperation<TKeyParams, TResult> = {
      command: "LRANGE",
      buildArgs: (params: TKeyParams & { start: number; stop: number }) => [
        this.keyBuilder(params),
        params.start,
        params.stop,
      ],
      parseResult: parseResult ?? ((r) => r as TResult),
      description: `Get range from list`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a list LSET operation
   */
  addListSet<TName extends string = "listSet">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ListSetOperation<TKeyParams> }
  > {
    const opName = (name ?? "listSet") as TName;
    const operation: ListSetOperation<TKeyParams> = {
      command: "LSET",
      buildArgs: (params: TKeyParams & { index: number; value: string }) => [
        this.keyBuilder(params),
        params.index,
        params.value,
      ],
      parseResult: (r) => r as "OK",
      description: `Set value at index in list`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a list LREM operation
   */
  addListRemove<TName extends string = "listRemove">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ListRemoveOperation<TKeyParams> }
  > {
    const opName = (name ?? "listRemove") as TName;
    const operation: ListRemoveOperation<TKeyParams> = {
      command: "LREM",
      buildArgs: (params: TKeyParams & { count: number; value: string }) => [
        this.keyBuilder(params),
        params.count,
        params.value,
      ],
      parseResult: (r) => r as number,
      description: `Remove from list`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a list LLEN operation
   */
  addListLength<TName extends string = "listLength">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ListLengthOperation<TKeyParams> }
  > {
    const opName = (name ?? "listLength") as TName;
    const operation: ListLengthOperation<TKeyParams> = {
      command: "LLEN",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => r as number,
      description: `Get list length`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a list LPOP operation
   */
  addListPop<TName extends string = "listPop">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ListPopOperation<TKeyParams> }
  > {
    const opName = (name ?? "listPop") as TName;
    const operation: ListPopOperation<TKeyParams> = {
      command: "LPOP",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => r as string | null,
      description: `Pop from list`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a list LTRIM operation
   */
  addListTrim<TName extends string = "listTrim">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ListTrimOperation<TKeyParams> }
  > {
    const opName = (name ?? "listTrim") as TName;
    const operation: ListTrimOperation<TKeyParams> = {
      command: "LTRIM",
      buildArgs: (params: TKeyParams & { start: number; stop: number }) => [
        this.keyBuilder(params),
        params.start,
        params.stop,
      ],
      parseResult: (r) => r as "OK",
      description: `Trim list`,
    };
    return this.withOperation(opName, operation);
  }
  addListIndexOf<TName extends string = "listIndexOf">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ListIndexOfOperation<TKeyParams> }
  > {
    const opName = (name ?? "listIndexOf") as TName;
    const operation: ListIndexOfOperation<TKeyParams> = {
      command: "LPOS",
      buildArgs: (params: TKeyParams & { value: string }) => [
        this.keyBuilder(params),
        params.value,
      ],
      parseResult: (r) => (r === null ? -1 : (r as number)),
      description: `Get index of value in list`,
    };
    return this.withOperation(opName, operation);
  }
  addListInsert<TName extends string = "listInsert">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ListInsertOperation<TKeyParams> }
  > {
    const opName = (name ?? "listInsert") as TName;
    const operation: ListInsertOperation<TKeyParams> = {
      command: "LINSERT",
      buildArgs: (
        params: TKeyParams & {
          before: boolean;
          pivot: string;
          value: string;
        },
      ) => [
        this.keyBuilder(params),
        params.before ? "BEFORE" : "AFTER",
        params.pivot,
        params.value,
      ],
      parseResult: (r) => r as number,
      description: `Insert into list`,
    };
    return this.withOperation(opName, operation);
  }
  /**
   * Add a list LINDEX operation
   */
  addListGetByIndex<
    TName extends string = "listGetByIndex",
    TResult = string | null,
  >(
    name?: TName,
    parseResult?: (result: unknown) => TResult,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: ListGetByIndexOperation<TKeyParams, TResult> }
  > {
    const opName = (name ?? "listGetByIndex") as TName;
    const operation: ListGetByIndexOperation<TKeyParams, TResult> = {
      command: "LINDEX",
      buildArgs: (params: TKeyParams & { index: number }) => [
        this.keyBuilder(params),
        params.index,
      ],
      parseResult: parseResult ?? ((r) => r as TResult),
      description: `Get value by index from list`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a PFADD operation (HyperLogLog add)
   */
  addHyperLogLogAdd<TName extends string = "hyperLogLogAdd">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: HyperLogLogAddOperation<TKeyParams> }
  > {
    const opName = (name ?? "hyperLogLogAdd") as TName;
    const operation: HyperLogLogAddOperation<TKeyParams> = {
      command: "PFADD",
      buildArgs: (params: TKeyParams & { members: string[] }) => [
        this.keyBuilder(params),
        ...params.members,
      ],
      parseResult: (r) => r as number,
      description: `Add to HyperLogLog`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a PFCOUNT operation (HyperLogLog count)
   */
  addHyperLogLogCount<TName extends string = "hyperLogLogCount">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: HyperLogLogCountOperation<TKeyParams> }
  > {
    const opName = (name ?? "hyperLogLogCount") as TName;
    const operation: HyperLogLogCountOperation<TKeyParams> = {
      command: "PFCOUNT",
      buildArgs: (params: TKeyParams) => [this.keyBuilder(params)],
      parseResult: (r) => r as number,
      description: `Count HyperLogLog approximate cardinality`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a PFMERGE operation (HyperLogLog merge)
   */
  addHyperLogLogMerge<TName extends string = "hyperLogLogMerge">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: HyperLogLogMergeOperation<TKeyParams> }
  > {
    const opName = (name ?? "hyperLogLogMerge") as TName;
    const operation: HyperLogLogMergeOperation<TKeyParams> = {
      command: "PFMERGE",
      buildArgs: (params: TKeyParams & { sourceKeys: string[] }) => [
        this.keyBuilder(params),
        ...params.sourceKeys,
      ],
      parseResult: (r) => r as "OK",
      description: `Merge HyperLogLog keys`,
    };
    return this.withOperation(opName, operation);
  }

  // =============================================
  // BLOOM FILTER OPERATIONS
  // =============================================

  /**
   * Add a BF.ADD operation (Bloom filter add single item)
   */
  addBloomFilterAdd<TName extends string = "bloomFilterAdd">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: BloomFilterAddOperation<TKeyParams> }
  > {
    const opName = (name ?? "bloomFilterAdd") as TName;
    const operation: BloomFilterAddOperation<TKeyParams> = {
      command: "BF.ADD",
      buildArgs: (params: TKeyParams & { item: string }) => [
        this.keyBuilder(params),
        params.item,
      ],
      parseResult: (r) => r === 1 || r === true,
      description: `Add item to Bloom filter`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a BF.MADD operation (Bloom filter add multiple items)
   */
  addBloomFilterMultiAdd<TName extends string = "bloomFilterMultiAdd">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: BloomFilterMultiAddOperation<TKeyParams> }
  > {
    const opName = (name ?? "bloomFilterMultiAdd") as TName;
    const operation: BloomFilterMultiAddOperation<TKeyParams> = {
      command: "BF.MADD",
      buildArgs: (params: TKeyParams & { items: string[] }) => [
        this.keyBuilder(params),
        ...params.items,
      ],
      parseResult: (r) =>
        (r as (number | boolean)[]).map((v) => v === 1 || v === true),
      description: `Add multiple items to Bloom filter`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a BF.EXISTS operation (Bloom filter check single item)
   */
  addBloomFilterExists<TName extends string = "bloomFilterExists">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: BloomFilterExistsOperation<TKeyParams> }
  > {
    const opName = (name ?? "bloomFilterExists") as TName;
    const operation: BloomFilterExistsOperation<TKeyParams> = {
      command: "BF.EXISTS",
      buildArgs: (params: TKeyParams & { item: string }) => [
        this.keyBuilder(params),
        params.item,
      ],
      parseResult: (r) => r === 1 || r === true,
      description: `Check if item exists in Bloom filter`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a BF.MEXISTS operation (Bloom filter check multiple items)
   */
  addBloomFilterMultiExists<TName extends string = "bloomFilterMultiExists">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & {
      [K in TName]: BloomFilterMultiExistsOperation<TKeyParams>;
    }
  > {
    const opName = (name ?? "bloomFilterMultiExists") as TName;
    const operation: BloomFilterMultiExistsOperation<TKeyParams> = {
      command: "BF.MEXISTS",
      buildArgs: (params: TKeyParams & { items: string[] }) => [
        this.keyBuilder(params),
        ...params.items,
      ],
      parseResult: (r) =>
        (r as (number | boolean)[]).map((v) => v === 1 || v === true),
      description: `Check if multiple items exist in Bloom filter`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a BF.RESERVE operation (Bloom filter reserve with error rate and capacity)
   */
  addBloomFilterReserve<TName extends string = "bloomFilterReserve">(
    name?: TName,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: BloomFilterReserveOperation<TKeyParams> }
  > {
    const opName = (name ?? "bloomFilterReserve") as TName;
    const operation: BloomFilterReserveOperation<TKeyParams> = {
      command: "BF.RESERVE",
      buildArgs: (
        params: TKeyParams & { errorRate: number; capacity: number },
      ) => [this.keyBuilder(params), params.errorRate, params.capacity],
      parseResult: (r) => r as "OK",
      description: `Reserve a Bloom filter with error rate and capacity`,
    };
    return this.withOperation(opName, operation);
  }

  /**
   * Add a custom operation
   */
  addCustomOperation<
    TName extends string,
    TParams extends Record<string, unknown>,
    TResult,
  >(
    name: TName,
    operation: CacheOperation<TParams, TResult>,
  ): TypedOperationBuilder<
    TKeyParams,
    TOperations & { [K in TName]: CacheOperation<TParams, TResult> }
  > {
    return this.withOperation(name, operation);
  }

  /**
   * Get all operations
   */
  getOperations(): TOperations {
    return this.operations as TOperations;
  }
}

// =============================================
// TYPED SCHEMA BUILDER
// =============================================

/**
 * Typed schema builder that provides full type inference for operations
 * Uses TypedOperationBuilder to accumulate operation types
 */
export class TypedSchemaBuilder<TKeyParams extends Record<string, unknown>> {
  private config: Partial<SchemaBuilderConfig> = {};
  private keyBuilder!: KeyBuilder<TKeyParams>;

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
   * Configure operations with full type inference
   * The callback receives a TypedOperationBuilder and must return it after adding operations
   * This allows TypeScript to infer the exact operations that were added
   */
  operations<TOperations extends Record<string, CacheOperation<any, any>>>(
    configure: (
      builder: TypedOperationBuilder<TKeyParams, {}>,
    ) => TypedOperationBuilder<TKeyParams, TOperations>,
  ): TypedSchemaBuilderWithOperations<TKeyParams, TOperations> {
    if (!this.keyBuilder) {
      throw new Error("Must set keyPattern before configuring operations");
    }
    const builder = new TypedOperationBuilder<TKeyParams, {}>(this.keyBuilder);
    const configuredBuilder = configure(builder);
    return new TypedSchemaBuilderWithOperations<TKeyParams, TOperations>(
      this.config,
      this.keyBuilder,
      configuredBuilder.getOperations(),
    );
  }
}

/**
 * Typed schema builder after operations have been configured
 * This class holds the typed operations and can build the final schema
 */
export class TypedSchemaBuilderWithOperations<
  TKeyParams extends Record<string, unknown>,
  TOperations extends Record<string, CacheOperation<any, any>>,
> {
  private config: Partial<SchemaBuilderConfig>;
  private keyBuilder: KeyBuilder<TKeyParams>;
  private ops: TOperations;

  constructor(
    config: Partial<SchemaBuilderConfig>,
    keyBuilder: KeyBuilder<TKeyParams>,
    operations: TOperations,
  ) {
    this.config = config;
    this.keyBuilder = keyBuilder;
    this.ops = operations;
  }

  /**
   * Build the schema with fully typed operations
   */
  build(): CacheSchema<TKeyParams, TOperations> {
    if (!this.config.name) throw new Error("Schema name is required");
    if (!this.config.keyPattern) throw new Error("Key pattern is required");
    if (!this.config.structure) throw new Error("Structure is required");
    if (!this.config.ttl) throw new Error("TTL is required");

    return {
      name: this.config.name,
      key: this.keyBuilder as (params: TKeyParams) => string,
      structure: this.config.structure,
      ttl: this.config.ttl,
      maxSize: this.config.maxSize,
      description: this.config.description,
      namespace: this.config.namespace,
      version: this.config.version,
      tags: this.config.tags,
      operations: this.ops,
    };
  }
}

/**
 * Create a new typed schema builder with full operation type inference
 *
 * @example
 * ```typescript
 * // Define your key parameters
 * type UserKeyParams = { userId: string };
 *
 * // Create the schema - operations will be fully typed!
 * const userSchema = createTypedSchema<UserKeyParams>()
 *   .name("user-profile")
 *   .keyPattern("user:{userId}:profile")
 *   .structure("STRING")
 *   .ttl(3600)
 *   .operations((ops) => ops
 *     .addGet()
 *     .addSet()
 *     .addDelete()
 *   )
 *   .build();
 *
 * // TypeScript knows exactly which operations exist:
 * userSchema.operations.get    // ✅ Typed as GetOperation
 * userSchema.operations.set    // ✅ Typed as SetOperation
 * userSchema.operations.delete // ✅ Typed as DeleteOperation
 * userSchema.operations.foo    // ❌ Error: Property 'foo' does not exist
 * ```
 */
export function createTypedSchema<
  TKeyParams extends Record<string, unknown>,
>(): TypedSchemaBuilder<TKeyParams> {
  return new TypedSchemaBuilder<TKeyParams>();
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
  return createTypedSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("STRING")
    .ttl(ttl)
    .operations((ops) =>
      ops.addGet().addSet(undefined, ttl).addDelete().addExists().addTtl(),
    )
    .build();
}

/**
 * Create a hash schema
 */
export function createHashSchema<TKeyParams extends Record<string, unknown>>(
  name: string,
  keyPattern: string,
  ttl: number,
) {
  return createTypedSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("HASH")
    .ttl(ttl)
    .operations((ops) =>
      ops
        .addHashGetAll()
        .addHashGet()
        .addHashSet()
        .addHashSetMultiple()
        .addDelete()
        .addExists()
        .addExpire(undefined, ttl)
        .addTtl(),
    )
    .build();
}

/**
 * Create a sorted set schema (for feeds, leaderboards)
 */
export function createSortedSetSchema<
  TKeyParams extends Record<string, unknown>,
>(name: string, keyPattern: string, ttl: number, maxSize?: number) {
  const builder = createTypedSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("SORTED_SET")
    .ttl(ttl);

  if (maxSize !== undefined) {
    builder.maxSize(maxSize);
  }

  return builder
    .operations((ops) =>
      ops
        .addSortedSetAdd()
        .addSortedSetGetRange()
        .addSortedSetGetRange("getRangeWithScores", true)
        .addDelete()
        .addExists()
        .addExpire(undefined, ttl)
        .addTtl(),
    )
    .build();
}

/**
 * Create a set schema (for relationships, tags)
 */
export function createSetSchema<TKeyParams extends Record<string, unknown>>(
  name: string,
  keyPattern: string,
  ttl: number,
) {
  return createTypedSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("SET")
    .ttl(ttl)
    .operations((ops) =>
      ops
        .addSetAdd()
        .addSetGetAll()
        .addSetHasMember()
        .addDelete()
        .addExists()
        .addExpire(undefined, ttl)
        .addTtl(),
    )
    .build();
}

/**
 * Create a counter schema
 */
export function createCounterSchema<TKeyParams extends Record<string, unknown>>(
  name: string,
  keyPattern: string,
  ttl: number,
) {
  return createTypedSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("STRING")
    .ttl(ttl)
    .operations((ops) =>
      ops
        .addGet()
        .addIncrement()
        .addIncrementBy()
        .addDelete()
        .addExists()
        .addExpire(undefined, ttl)
        .addTtl(),
    )
    .build();
}

/**
 * Create a HyperLogLog schema (for unique counting)
 */
export function createHyperLogLogSchema<
  TKeyParams extends Record<string, unknown>,
>(name: string, keyPattern: string, ttl: number) {
  return createTypedSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("STRING")
    .ttl(ttl)
    .operations((ops) =>
      ops
        .addHyperLogLogAdd()
        .addHyperLogLogCount()
        .addDelete()
        .addExists()
        .addExpire(undefined, ttl)
        .addTtl(),
    )
    .build();
}

/**
 * Create a Bloom filter schema (for probabilistic membership testing)
 */
export function createBloomFilterSchema<
  TKeyParams extends Record<string, unknown>,
>(name: string, keyPattern: string, ttl: number) {
  return createTypedSchema<TKeyParams>()
    .name(name)
    .keyPattern(keyPattern)
    .structure("STRING")
    .ttl(ttl)
    .operations((ops) =>
      ops
        .addBloomFilterAdd()
        .addBloomFilterMultiAdd()
        .addBloomFilterExists()
        .addBloomFilterMultiExists()
        .addBloomFilterReserve()
        .addDelete()
        .addExists()
        .addExpire(undefined, ttl)
        .addTtl(),
    )
    .build();
}
