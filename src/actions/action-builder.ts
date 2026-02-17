// =============================================
// CACHYER - ACTION BUILDER
// =============================================
// Fluent builder for defining multi-step cache workflows
// =============================================

import type { Cachyer } from "../core/cachyer";
import type { CacheOperation, AnyPipelineEntry } from "../types/operation.types";
import type {
  ActionErrorStrategy,
  ActionExecuteOptions,
  ActionResult,
  RegisteredStep,
} from "./action.types";
import { executeAction } from "./action-executor";

// =============================================
// CACHE ACTION (immutable, executable)
// =============================================

/**
 * An immutable, reusable multi-step cache workflow.
 * Created via `defineAction().step(...).build()`.
 */
export class CacheAction<
  TInput,
  TSteps extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: string;
  /** @internal */
  readonly steps: readonly RegisteredStep[];
  /** @internal */
  readonly errorStrategy: ActionErrorStrategy;

  constructor(
    name: string,
    steps: readonly RegisteredStep[],
    errorStrategy: ActionErrorStrategy,
  ) {
    this.name = name;
    this.steps = steps;
    this.errorStrategy = errorStrategy;
  }

  /**
   * Execute this action against a Cachyer instance.
   */
  async run(
    cache: Cachyer,
    input: TInput,
    options?: ActionExecuteOptions,
  ): Promise<ActionResult<TSteps>> {
    return executeAction(this, cache, input, options);
  }
}

// =============================================
// BUILDER
// =============================================

/**
 * Fluent builder for CacheAction.
 * Accumulates step types via intersection pattern.
 */
export class CacheActionBuilder<
  TInput,
  TSteps extends Record<string, unknown> = {},
> {
  private readonly actionName: string;
  private readonly registeredSteps: RegisteredStep[] = [];
  private errorStrat: ActionErrorStrategy = "skip-dependents";

  constructor(name: string) {
    this.actionName = name;
  }

  /**
   * Add an operation step that executes a CacheOperation.
   */
  step<
    TName extends string,
    TResult,
    TDeps extends readonly (keyof TSteps & string)[] | undefined = undefined,
  >(
    name: TName extends keyof TSteps ? never : TName,
    config: {
      readonly operation: CacheOperation<any, TResult>;
      readonly params: TDeps extends readonly (keyof TSteps & string)[]
        ? (input: TInput, deps: Pick<TSteps, TDeps[number]>) => Record<string, unknown>
        : (input: TInput) => Record<string, unknown>;
      readonly dependsOn?: TDeps;
      readonly retries?: number;
      readonly retryDelay?: number;
      readonly undo?: (input: TInput, result: TResult, cache: Cachyer) => Promise<void>;
    },
  ): CacheActionBuilder<TInput, TSteps & { [K in TName]: TResult }> {
    this.registeredSteps.push({
      name,
      kind: "operation",
      dependsOn: (config.dependsOn as readonly string[]) ?? [],
      config: { ...config, kind: "operation" },
      retries: config.retries ?? 0,
      retryDelay: config.retryDelay ?? 100,
      undo: config.undo as RegisteredStep["undo"],
    });
    return this as unknown as CacheActionBuilder<TInput, TSteps & { [K in TName]: TResult }>;
  }

  /**
   * Add a compute step with arbitrary async logic.
   */
  compute<
    TName extends string,
    TResult,
    TDeps extends readonly (keyof TSteps & string)[] | undefined = undefined,
  >(
    name: TName extends keyof TSteps ? never : TName,
    config: {
      readonly fn: TDeps extends readonly (keyof TSteps & string)[]
        ? (input: TInput, deps: Pick<TSteps, TDeps[number]>, cache: Cachyer) => Promise<TResult> | TResult
        : (input: TInput, deps: Record<string, never>, cache: Cachyer) => Promise<TResult> | TResult;
      readonly dependsOn?: TDeps;
      readonly retries?: number;
      readonly retryDelay?: number;
      readonly undo?: (input: TInput, result: TResult, cache: Cachyer) => Promise<void>;
    },
  ): CacheActionBuilder<TInput, TSteps & { [K in TName]: TResult }> {
    this.registeredSteps.push({
      name,
      kind: "compute",
      dependsOn: (config.dependsOn as readonly string[]) ?? [],
      config: { ...config, kind: "compute" },
      retries: config.retries ?? 0,
      retryDelay: config.retryDelay ?? 100,
      undo: config.undo as RegisteredStep["undo"],
    });
    return this as unknown as CacheActionBuilder<TInput, TSteps & { [K in TName]: TResult }>;
  }

  /**
   * Add a fan-out step that generates N pipeline entries.
   */
  fanOut<
    TName extends string,
    TResult = unknown[],
    TDeps extends readonly (keyof TSteps & string)[] | undefined = undefined,
  >(
    name: TName extends keyof TSteps ? never : TName,
    config: {
      readonly generate: TDeps extends readonly (keyof TSteps & string)[]
        ? (input: TInput, deps: Pick<TSteps, TDeps[number]>) => AnyPipelineEntry[]
        : (input: TInput) => AnyPipelineEntry[];
      readonly parseResults?: (results: unknown[]) => TResult;
      readonly dependsOn?: TDeps;
      readonly retries?: number;
      readonly retryDelay?: number;
      readonly undo?: (input: TInput, result: TResult, cache: Cachyer) => Promise<void>;
    },
  ): CacheActionBuilder<TInput, TSteps & { [K in TName]: TResult }> {
    this.registeredSteps.push({
      name,
      kind: "fanOut",
      dependsOn: (config.dependsOn as readonly string[]) ?? [],
      config: { ...config, kind: "fanOut" },
      retries: config.retries ?? 0,
      retryDelay: config.retryDelay ?? 100,
      undo: config.undo as RegisteredStep["undo"],
    });
    return this as unknown as CacheActionBuilder<TInput, TSteps & { [K in TName]: TResult }>;
  }

  /**
   * Set the error handling strategy.
   */
  onError(strategy: ActionErrorStrategy): this {
    this.errorStrat = strategy;
    return this;
  }

  /**
   * Validate and build an immutable CacheAction.
   */
  build(): CacheAction<TInput, TSteps> {
    this.validate();
    return new CacheAction<TInput, TSteps>(
      this.actionName,
      [...this.registeredSteps],
      this.errorStrat,
    );
  }

  private validate(): void {
    const names = new Set(this.registeredSteps.map((s) => s.name));

    // Check for duplicate names
    if (names.size !== this.registeredSteps.length) {
      const seen = new Set<string>();
      for (const step of this.registeredSteps) {
        if (seen.has(step.name)) {
          throw new Error(`Duplicate step name: "${step.name}"`);
        }
        seen.add(step.name);
      }
    }

    // Check for unknown dependencies
    for (const step of this.registeredSteps) {
      for (const dep of step.dependsOn) {
        if (!names.has(dep)) {
          throw new Error(
            `Step "${step.name}" depends on unknown step "${dep}"`,
          );
        }
      }
    }

    // Check for cycles
    detectCycles(this.registeredSteps);
  }
}

// =============================================
// CYCLE DETECTION (Kahn's algorithm)
// =============================================

/**
 * Detect cycles in the step dependency graph using Kahn's algorithm.
 * Throws if a cycle is found.
 */
export function detectCycles(steps: readonly RegisteredStep[]): void {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const step of steps) {
    inDegree.set(step.name, 0);
    adjacency.set(step.name, []);
  }

  for (const step of steps) {
    for (const dep of step.dependsOn) {
      adjacency.get(dep)!.push(step.name);
      inDegree.set(step.name, (inDegree.get(step.name) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    for (const neighbor of adjacency.get(current)!) {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (processed !== steps.length) {
    const cycleNodes = steps
      .filter((s) => (inDegree.get(s.name) ?? 0) > 0)
      .map((s) => s.name);
    throw new Error(
      `Cycle detected in action steps: ${cycleNodes.join(" → ")}`,
    );
  }
}

// =============================================
// FACTORY
// =============================================

/**
 * Create a new CacheAction builder.
 *
 * @example
 * ```typescript
 * const action = defineAction<{ userId: string }>("my-action")
 *   .step("fetch", { operation: myOp, params: (input) => ({ key: input.userId }) })
 *   .compute("transform", { dependsOn: ["fetch"] as const, fn: async (input, deps) => deps.fetch * 2 })
 *   .build();
 *
 * const result = await action.run(cache, { userId: "123" });
 * ```
 */
export function defineAction<TInput>(name: string): CacheActionBuilder<TInput> {
  return new CacheActionBuilder<TInput>(name);
}
