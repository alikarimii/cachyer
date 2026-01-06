// =============================================
// CACHYER - PARAMETER TYPES
// =============================================
// Generic reusable parameter interfaces for cache operations
// =============================================

/**
 * Base interface that all param types must extend
 */
export interface BaseParams {
  [key: string]: unknown;
}

// =============================================
// GENERIC ID PARAMS
// =============================================

export interface WithUserId extends BaseParams {
  userId: string;
}

export interface WithId extends BaseParams {
  id: string;
}

export interface WithSessionId extends BaseParams {
  sessionId: string;
}

// =============================================
// COMMON OPERATION PARAMS
// =============================================

export interface WithPagination extends BaseParams {
  start: number;
  stop: number;
}

export interface WithScore extends BaseParams {
  score: number;
}

export interface WithMember extends BaseParams {
  member: string;
}

export interface WithLimit extends BaseParams {
  limit: number;
}

export interface WithTimestamp extends BaseParams {
  timestamp: number;
}

export interface WithTTL extends BaseParams {
  ttl: number;
}

export interface WithValue<T = string> extends BaseParams {
  value: T;
}

export interface WithField extends BaseParams {
  field: string;
}

export interface WithFields extends BaseParams {
  fields: Record<string, string | number>;
}

export interface WithAmount extends BaseParams {
  amount: number;
}

// =============================================
// RATE LIMIT PARAMS
// =============================================

export interface RateLimitParams extends WithUserId {
  endpoint: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

// =============================================
// TYPE UTILITIES
// =============================================

/**
 * Make specific properties required
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specific properties optional
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

/**
 * Extract only the ID fields from a params interface
 */
export type IdFields<T> = Pick<
  T,
  {
    [K in keyof T]: K extends `${string}Id` ? K : never;
  }[keyof T]
>;

/**
 * Type for params that can be used to build a cache key
 */
export type KeyParams<T> = Partial<IdFields<T>>;

/**
 * Combine multiple param interfaces
 */
export type CombineParams<T extends BaseParams[]> = T extends [
  infer First,
  ...infer Rest,
]
  ? First extends BaseParams
    ? Rest extends BaseParams[]
      ? First & CombineParams<Rest>
      : First
    : never
  : BaseParams;
