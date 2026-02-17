// =============================================
// CACHYER - ACTION EXECUTOR
// =============================================
// Executes multi-step cache workflows with
// topological batching, retry, rollback, and error handling
// =============================================

import type { Cachyer } from "../core/cachyer";
import type { AnyPipelineEntry } from "../types/operation.types";
import type {
  ActionExecuteOptions,
  ActionResult,
  RegisteredStep,
  StepError,
} from "./action.types";
import type { CacheAction } from "./action-builder";

// =============================================
// TOPOLOGICAL SORT INTO BATCHES
// =============================================

/**
 * Sort steps into parallel batches using Kahn's algorithm.
 * Steps within the same batch have no mutual dependencies and can run concurrently.
 */
export function buildBatches(steps: readonly RegisteredStep[]): RegisteredStep[][] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const stepMap = new Map<string, RegisteredStep>();

  for (const step of steps) {
    inDegree.set(step.name, 0);
    adjacency.set(step.name, []);
    stepMap.set(step.name, step);
  }

  for (const step of steps) {
    for (const dep of step.dependsOn) {
      adjacency.get(dep)!.push(step.name);
      inDegree.set(step.name, (inDegree.get(step.name) ?? 0) + 1);
    }
  }

  const batches: RegisteredStep[][] = [];
  let queue: string[] = [];

  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  while (queue.length > 0) {
    const batch: RegisteredStep[] = queue.map((name) => stepMap.get(name)!);
    batches.push(batch);

    const nextQueue: string[] = [];
    for (const name of queue) {
      for (const neighbor of adjacency.get(name)!) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) nextQueue.push(neighbor);
      }
    }
    queue = nextQueue;
  }

  return batches;
}

// =============================================
// DEPENDENCY RESOLUTION
// =============================================

function resolveDeps(
  step: RegisteredStep,
  results: Map<string, unknown>,
): Record<string, unknown> {
  const deps: Record<string, unknown> = {};
  for (const depName of step.dependsOn) {
    deps[depName] = results.get(depName);
  }
  return deps;
}

// =============================================
// RETRY HELPER
// =============================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve the retry count for a step, falling back to global options.
 */
function getRetries(step: RegisteredStep, options?: ActionExecuteOptions): number {
  return step.retries > 0 ? step.retries : (options?.retries ?? 0);
}

/**
 * Resolve the retry delay for a step, falling back to global options.
 */
function getRetryDelay(step: RegisteredStep, options?: ActionExecuteOptions): number {
  return step.retries > 0 ? step.retryDelay : (options?.retryDelay ?? 100);
}

/**
 * Wrap a step execution function with retry logic.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  retryDelay: number,
  stepTimeout?: number,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (stepTimeout && stepTimeout > 0) {
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Step timed out")), stepTimeout),
          ),
        ]);
        return result;
      }
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        await delay(retryDelay);
      }
    }
  }

  throw lastError!;
}

// =============================================
// COMPLETED STEP TRACKING (for rollback)
// =============================================

interface CompletedStep {
  readonly name: string;
  readonly result: unknown;
  readonly step: RegisteredStep;
}

// =============================================
// EXECUTOR
// =============================================

/**
 * Execute a CacheAction against a Cachyer instance.
 */
export async function executeAction<
  TInput,
  TSteps extends Record<string, unknown>,
>(
  action: CacheAction<TInput, TSteps>,
  cache: Cachyer,
  input: TInput,
  options?: ActionExecuteOptions,
): Promise<ActionResult<TSteps>> {
  const startTime = Date.now();
  const errorStrategy = options?.errorStrategy ?? action.errorStrategy;
  const results = new Map<string, unknown>();
  const errors: StepError[] = [];
  const failedSteps = new Set<string>();
  const skippedSteps = new Set<string>();
  const completedSteps: CompletedStep[] = [];

  const batches = buildBatches(action.steps);

  for (const batch of batches) {
    if (errorStrategy === "abort" && errors.length > 0) {
      break;
    }

    // Filter out steps that should be skipped
    const runnableSteps = batch.filter((step) => {
      if (errorStrategy === "skip-dependents") {
        for (const dep of step.dependsOn) {
          if (failedSteps.has(dep) || skippedSteps.has(dep)) {
            skippedSteps.add(step.name);
            return false;
          }
        }
      }
      if (errorStrategy === "abort" && errors.length > 0) {
        return false;
      }
      return true;
    });

    if (runnableSteps.length === 0) continue;

    // Separate steps by kind for optimal batching
    const operationSteps = runnableSteps.filter((s) => s.kind === "operation");
    const computeSteps = runnableSteps.filter((s) => s.kind === "compute");
    const fanOutSteps = runnableSteps.filter((s) => s.kind === "fanOut");

    const promises: Promise<void>[] = [];

    // Batch operation steps into a single pipeline if multiple
    if (operationSteps.length > 1) {
      promises.push(
        executePipelineBatch(operationSteps, cache, input, results, errors, failedSteps, completedSteps, options),
      );
    } else if (operationSteps.length === 1) {
      promises.push(
        executeSingleOperation(operationSteps[0]!, cache, input, results, errors, failedSteps, completedSteps, options),
      );
    }

    // Execute compute steps in parallel
    for (const step of computeSteps) {
      promises.push(
        executeComputeStep(step, cache, input, results, errors, failedSteps, completedSteps, options),
      );
    }

    // Execute fan-out steps in parallel
    for (const step of fanOutSteps) {
      promises.push(
        executeFanOutStep(step, cache, input, results, errors, failedSteps, completedSteps, options),
      );
    }

    await Promise.all(promises);
  }

  const success = errors.length === 0;

  // Rollback on failure if requested
  let rolledBack = false;
  const rollbackErrors: StepError[] = [];

  if (!success && options?.rollbackOnFailure) {
    rolledBack = true;
    // Run undo handlers in reverse completion order
    const undoableSteps = [...completedSteps].reverse().filter((cs) => cs.step.undo);

    for (const cs of undoableSteps) {
      try {
        await cs.step.undo!(input, cs.result, cache);
      } catch (err) {
        rollbackErrors.push({ stepName: cs.name, error: err as Error });
      }
    }
  }

  return {
    success,
    results: Object.fromEntries(results) as Partial<TSteps>,
    errors,
    executionTimeMs: Date.now() - startTime,
    batches: batches.length,
    rolledBack,
    rollbackErrors,
  };
}

// =============================================
// STEP EXECUTORS
// =============================================

async function executePipelineBatch(
  steps: RegisteredStep[],
  cache: Cachyer,
  input: unknown,
  results: Map<string, unknown>,
  errors: StepError[],
  failedSteps: Set<string>,
  completedSteps: CompletedStep[],
  options?: ActionExecuteOptions,
): Promise<void> {
  const entries: AnyPipelineEntry[] = [];
  const stepOrder: RegisteredStep[] = [];

  for (const step of steps) {
    try {
      const deps = resolveDeps(step, results);
      const params = step.config.params(input, deps);
      entries.push({
        operation: step.config.operation,
        params,
      });
      stepOrder.push(step);
    } catch (err) {
      errors.push({ stepName: step.name, error: err as Error });
      failedSteps.add(step.name);
    }
  }

  if (entries.length === 0) return;

  try {
    const pipelineResult = await cache.pipeline(entries);

    for (let i = 0; i < stepOrder.length; i++) {
      const step = stepOrder[i]!;
      const result = pipelineResult.results[i];

      if (result?.success) {
        results.set(step.name, result.data);
        completedSteps.push({ name: step.name, result: result.data, step });
      } else {
        const error = result?.error ?? new Error(`Pipeline step "${step.name}" failed`);
        errors.push({ stepName: step.name, error });
        failedSteps.add(step.name);
      }
    }
  } catch {
    // Pipeline failed as a whole — fall back to individual execution with retries
    for (const step of stepOrder) {
      await executeSingleOperation(step, cache, input, results, errors, failedSteps, completedSteps, options);
    }
  }
}

async function executeSingleOperation(
  step: RegisteredStep,
  cache: Cachyer,
  input: unknown,
  results: Map<string, unknown>,
  errors: StepError[],
  failedSteps: Set<string>,
  completedSteps: CompletedStep[],
  options?: ActionExecuteOptions,
): Promise<void> {
  const retries = getRetries(step, options);
  const retryDelay = getRetryDelay(step, options);

  try {
    const result = await withRetry(
      async () => {
        const deps = resolveDeps(step, results);
        const params = step.config.params(input, deps);
        return cache.execute(step.config.operation, params);
      },
      retries,
      retryDelay,
      options?.stepTimeout,
    );
    results.set(step.name, result);
    completedSteps.push({ name: step.name, result, step });
  } catch (err) {
    errors.push({ stepName: step.name, error: err as Error });
    failedSteps.add(step.name);
  }
}

async function executeComputeStep(
  step: RegisteredStep,
  cache: Cachyer,
  input: unknown,
  results: Map<string, unknown>,
  errors: StepError[],
  failedSteps: Set<string>,
  completedSteps: CompletedStep[],
  options?: ActionExecuteOptions,
): Promise<void> {
  const retries = getRetries(step, options);
  const retryDelay = getRetryDelay(step, options);

  try {
    const result = await withRetry(
      async () => {
        const deps = resolveDeps(step, results);
        return step.config.fn(input, deps, cache);
      },
      retries,
      retryDelay,
      options?.stepTimeout,
    );
    results.set(step.name, result);
    completedSteps.push({ name: step.name, result, step });
  } catch (err) {
    errors.push({ stepName: step.name, error: err as Error });
    failedSteps.add(step.name);
  }
}

async function executeFanOutStep(
  step: RegisteredStep,
  cache: Cachyer,
  input: unknown,
  results: Map<string, unknown>,
  errors: StepError[],
  failedSteps: Set<string>,
  completedSteps: CompletedStep[],
  options?: ActionExecuteOptions,
): Promise<void> {
  const retries = getRetries(step, options);
  const retryDelay = getRetryDelay(step, options);

  try {
    const result = await withRetry(
      async () => {
        const deps = resolveDeps(step, results);
        const fanEntries = step.config.generate(input, deps);

        if (fanEntries.length === 0) {
          return [];
        }

        const pipelineResult = await cache.pipeline(fanEntries);
        const rawResults = pipelineResult.results.map((r) => r.data);

        if (step.config.parseResults) {
          return step.config.parseResults(rawResults);
        }
        return rawResults;
      },
      retries,
      retryDelay,
      options?.stepTimeout,
    );
    results.set(step.name, result);
    completedSteps.push({ name: step.name, result, step });
  } catch (err) {
    errors.push({ stepName: step.name, error: err as Error });
    failedSteps.add(step.name);
  }
}
