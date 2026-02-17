// =============================================
// CACHYER - OPERATION TYPES
// =============================================
// Type definitions for cache operations and schemas
// =============================================

import type { CacheCommand, CacheStructure } from "./core.types";

/**
 * Generic cache operation interface
 * Defines how to build arguments and parse results for a single command
 *
 * @template TParams - The parameter type required to execute this operation
 * @template TResult - The expected return type
 */
export interface CacheOperation<
  TParams extends Record<string, unknown>,
  TResult = unknown,
> {
  /** The cache command to execute */
  readonly command: CacheCommand;

  /** Function to build command arguments from typed parameters */
  readonly buildArgs: (params: TParams) => (string | number)[];

  /** Optional function to parse/transform the raw result */
  readonly parseResult?: (result: unknown) => TResult;

  /** Optional description for documentation */
  readonly description?: string;
}

/**
 * Cache schema definition
 * Defines the complete structure for a cache entry including key pattern,
 * structure type, TTL, and all available operations
 *
 * @template TKeyParams - Parameters needed to generate the key
 * @template TOperations - Record of operation names to their definitions
 */
export interface CacheSchema<
  TKeyParams extends Record<string, unknown>,
  TOperations extends Record<string, CacheOperation<any, any>>,
> {
  /** Unique name for this schema */
  readonly name: string;

  /** Function to generate the cache key from parameters */
  readonly key: (params: TKeyParams) => string;

  /** The data structure used for this cache */
  readonly structure: CacheStructure;

  /** Time-to-live in seconds */
  readonly ttl: number;

  /** Maximum number of items to store (for lists, sets, sorted sets) */
  readonly maxSize?: number;

  /** Available operations for this cache */
  readonly operations: TOperations;

  /** Optional description for documentation */
  readonly description?: string;

  /** Cache namespace/prefix */
  readonly namespace?: string;

  /** Version for cache invalidation */
  readonly version?: number;

  /** Tags for grouping related caches */
  readonly tags?: readonly string[];
}

/**
 * Script definition for atomic operations
 */
export interface ScriptDefinition<
  TKeys extends readonly string[] = readonly string[],
  TArgs extends readonly string[] = readonly string[],
  TResult = unknown,
> {
  /** The script content (Lua for Redis, JS for others) */
  readonly script: string;

  /** Script language */
  readonly language: "lua" | "javascript";

  /** Names of keys used in the script (for documentation) */
  readonly keys: TKeys;

  /** Names of arguments used in the script (for documentation) */
  readonly args: TArgs;

  /** Cached hash for script execution */
  hash?: string;

  /** Description of what the script does */
  readonly description?: string;

  /** Parse the raw result */
  readonly parseResult?: (result: unknown) => TResult;
}

/**
 * Pipeline entry for batched operations
 */
export interface PipelineEntry<
  TParams extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown,
> {
  readonly operation: CacheOperation<TParams, TResult>;
  readonly params: TParams;
}

/**
 * Pipeline execution result
 */
export interface PipelineResult<T = unknown> {
  success: boolean;
  results: Array<{
    success: boolean;
    data?: T;
    error?: Error;
  }>;
  executionTimeMs: number;
}

/**
 * Transaction result
 */
export interface TransactionResult<T = unknown> {
  success: boolean;
  committed: boolean;
  results?: T[];
  error?: Error;
  executionTimeMs: number;
}

/**
 * Execution options
 */
export interface ExecuteOptions {
  /** Timeout in milliseconds */
  timeout?: number;

  /** Retry count on failure */
  retries?: number;

  /** Retry delay in milliseconds */
  retryDelay?: number;

  /** Whether to throw on error or return null */
  throwOnError?: boolean;

  /** Custom error handler */
  onError?: (error: Error, operation: string) => void;
}

/**
 * Execution result wrapper
 */
export interface ExecuteResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  executionTimeMs: number;
  retries: number;
}

/**
 * Executor metrics
 */
export interface ExecutorMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalExecutionTimeMs: number;
  avgExecutionTimeMs: number;
  operationCounts: Record<string, number>;
}

// =============================================
// HELPER TYPES
// =============================================

/** Extract parameter type from an operation */
export type OperationParams<T> =
  T extends CacheOperation<infer P, unknown> ? P : never;

/** Extract result type from an operation */
export type OperationResult<T> =
  T extends CacheOperation<Record<string, unknown>, infer R> ? R : never;

/** Extract all operation names from a schema */
export type SchemaOperationNames<T> =
  T extends CacheSchema<Record<string, unknown>, infer O> ? keyof O : never;

/** Extract specific operation from a schema */
export type SchemaOperation<
  T extends CacheSchema<
    Record<string, unknown>,
    Record<string, CacheOperation<Record<string, unknown>, unknown>>
  >,
  K extends keyof T["operations"],
> = T["operations"][K];

/** Extract keys type from a script definition */
export type ScriptKeys<T> =
  T extends ScriptDefinition<infer K, any, any> ? K : never;

/** Extract args type from a script definition */
export type ScriptArgs<T> =
  T extends ScriptDefinition<any, infer A, any> ? A : never;

/** Extract result type from a script definition */
export type ScriptResult<T> =
  T extends ScriptDefinition<any, any, infer R> ? R : never;

// =============================================
// FACTORY FUNCTIONS
// =============================================

/**
 * Create a typed cache operation
 */
export function defineOperation<
  TParams extends Record<string, unknown>,
  TResult = unknown,
>(config: CacheOperation<TParams, TResult>): CacheOperation<TParams, TResult> {
  return config;
}

/**
 * Create a typed cache schema
 */
export function defineSchema<
  TKeyParams extends Record<string, unknown>,
  TOperations extends Record<string, CacheOperation<any, any>>,
>(
  config: CacheSchema<TKeyParams, TOperations>,
): CacheSchema<TKeyParams, TOperations> {
  return config;
}

/**
 * Create a typed script definition
 */
export function defineScript<
  TKeys extends readonly string[],
  TArgs extends readonly string[],
  TResult = unknown,
>(
  config: Omit<ScriptDefinition<TKeys, TArgs, TResult>, "hash">,
): ScriptDefinition<TKeys, TArgs, TResult> {
  return config;
}

/**
 * Type-erased pipeline entry for adapter methods.
 * Guarantees operation and params were matched at creation time via pipelineEntry(),
 * while allowing heterogeneous arrays without `any`.
 */
export interface AnyPipelineEntry {
  readonly operation: CacheOperation<Record<string, unknown>, unknown>;
  readonly params: Record<string, unknown>;
}

/**
 * Create a pipeline entry
 */
export function pipelineEntry<TParams extends Record<string, unknown>, TResult>(
  operation: CacheOperation<TParams, TResult>,
  params: TParams,
): AnyPipelineEntry {
  return { operation, params } as AnyPipelineEntry;
}
