// =============================================
// CACHYER - ACTION TYPES
// =============================================
// Type definitions for multi-step cache workflows
// =============================================

import type { Cachyer } from "../core/cachyer";
import type { CacheOperation, AnyPipelineEntry } from "../types/operation.types";

// =============================================
// STEP TYPES
// =============================================

/**
 * Operation step — wraps a CacheOperation with a params builder.
 * Executed via cache.execute() or batched into cache.pipeline().
 */
export interface OperationStepConfig<
  TInput,
  TSteps extends Record<string, unknown>,
  TDeps extends readonly (keyof TSteps)[] | undefined,
  TResult,
> {
  readonly kind?: "operation";
  readonly operation: CacheOperation<any, TResult>;
  readonly params: TDeps extends readonly (keyof TSteps)[]
    ? (input: TInput, deps: Pick<TSteps, TDeps[number]>) => Record<string, unknown>
    : (input: TInput) => Record<string, unknown>;
  readonly dependsOn?: TDeps;
}

/**
 * Compute step — arbitrary async logic with access to input and dependencies.
 */
export interface ComputeStepConfig<
  TInput,
  TSteps extends Record<string, unknown>,
  TDeps extends readonly (keyof TSteps)[] | undefined,
  TResult,
> {
  readonly kind: "compute";
  readonly fn: TDeps extends readonly (keyof TSteps)[]
    ? (input: TInput, deps: Pick<TSteps, TDeps[number]>, cache: Cachyer) => Promise<TResult> | TResult
    : (input: TInput, deps: Record<string, never>, cache: Cachyer) => Promise<TResult> | TResult;
  readonly dependsOn?: TDeps;
}

/**
 * Fan-out step — generates N pipeline entries from input and dependencies.
 */
export interface FanOutStepConfig<
  TInput,
  TSteps extends Record<string, unknown>,
  TDeps extends readonly (keyof TSteps)[] | undefined,
  TResult,
> {
  readonly kind: "fanOut";
  readonly generate: TDeps extends readonly (keyof TSteps)[]
    ? (input: TInput, deps: Pick<TSteps, TDeps[number]>) => AnyPipelineEntry[]
    : (input: TInput) => AnyPipelineEntry[];
  readonly parseResults?: (results: unknown[]) => TResult;
  readonly dependsOn?: TDeps;
}

// =============================================
// REGISTERED STEP (internal)
// =============================================

export type StepKind = "operation" | "compute" | "fanOut";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RegisteredStep {
  readonly name: string;
  readonly kind: StepKind;
  readonly dependsOn: readonly string[];
  /** Step config — typed loosely here since discrimination happens via `kind` at runtime */
  readonly config: Record<string, any>;
  /** Number of retry attempts before declaring failure (default: 0) */
  readonly retries: number;
  /** Delay in ms between retry attempts (default: 100) */
  readonly retryDelay: number;
  /** Compensation handler called during rollback */
  readonly undo?: (input: unknown, result: unknown, cache: Cachyer) => Promise<void>;
}

// =============================================
// ACTION RESULT
// =============================================

export interface StepError {
  readonly stepName: string;
  readonly error: Error;
}

/**
 * Result of executing a CacheAction.
 */
export interface ActionResult<TSteps extends Record<string, unknown>> {
  readonly success: boolean;
  readonly results: Partial<TSteps>;
  readonly errors: StepError[];
  readonly executionTimeMs: number;
  readonly batches: number;
  /** Whether rollback was attempted after failure */
  readonly rolledBack: boolean;
  /** Errors from undo handlers during rollback (best-effort) */
  readonly rollbackErrors: StepError[];
}

// =============================================
// OPTIONS
// =============================================

/**
 * Error handling strategy for action execution.
 *
 * - "abort": Stop on first error. Remaining batches skipped.
 * - "skip-dependents": Failed step's dependents are skipped. Independent steps continue. (default)
 * - "continue": All independent steps run. Failed deps are undefined.
 */
export type ActionErrorStrategy = "abort" | "skip-dependents" | "continue";

/**
 * Options for action execution.
 */
export interface ActionExecuteOptions {
  readonly errorStrategy?: ActionErrorStrategy;
  readonly stepTimeout?: number;
  /** Global default retry count for all steps (default: 0) */
  readonly retries?: number;
  /** Global default retry delay in ms (default: 100) */
  readonly retryDelay?: number;
  /** Trigger undo handlers on failure in reverse completion order (default: false) */
  readonly rollbackOnFailure?: boolean;
}
