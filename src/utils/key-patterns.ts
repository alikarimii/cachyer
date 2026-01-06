// =============================================
// CACHYER - KEY PATTERN BUILDER
// =============================================
// Utility for building and parsing cache keys
// =============================================

/**
 * Key builder function type
 */
export type KeyBuilder<TParams> = (params: TParams) => string;

/**
 * Static key builder (no parameters)
 */
export type StaticKeyBuilder = () => string;

/**
 * Key pattern configuration
 */
export interface KeyPatternConfig {
  /** Key prefix */
  prefix?: string;
  /** Separator between parts */
  separator?: string;
  /** Whether to validate keys */
  validate?: boolean;
}

const defaultConfig: Required<KeyPatternConfig> = {
  prefix: "",
  separator: ":",
  validate: true,
};

/**
 * Create a key builder function
 */
export function createKeyBuilder<TParams extends Record<string, unknown>>(
  pattern: string,
  config?: KeyPatternConfig
): KeyBuilder<TParams> {
  const { prefix, separator, validate } = { ...defaultConfig, ...config };

  // Parse pattern to extract placeholders
  const placeholderRegex = /\{(\w+)\}/g;
  const placeholders: string[] = [];
  let match;

  while ((match = placeholderRegex.exec(pattern)) !== null) {
    placeholders.push(match[1]!);
  }

  return (params: TParams): string => {
    let key = pattern;

    for (const placeholder of placeholders) {
      const value = params[placeholder];

      if (validate && (value === undefined || value === null)) {
        throw new Error(`Missing required parameter: ${placeholder}`);
      }

      key = key.replace(`{${placeholder}}`, String(value ?? ""));
    }

    return prefix ? `${prefix}${separator}${key}` : key;
  };
}

/**
 * Create a static key builder
 */
export function createStaticKey(
  key: string,
  config?: KeyPatternConfig
): StaticKeyBuilder {
  const { prefix, separator } = { ...defaultConfig, ...config };
  const fullKey = prefix ? `${prefix}${separator}${key}` : key;

  return () => fullKey;
}

/**
 * Parse a key to extract its components
 */
export function parseKey(
  key: string,
  separator: string = ":"
): {
  domain: string;
  type: string;
  ids: string[];
} {
  const parts = key.split(separator);

  return {
    domain: parts[0] ?? "",
    type: parts[1] ?? "",
    ids: parts.slice(2),
  };
}

/**
 * Validate a key matches expected domain
 */
export function validateKey(key: string, expectedDomain: string): boolean {
  return key.startsWith(`${expectedDomain}:`);
}

/**
 * Create a key pattern for scanning
 */
export function createKeyPattern(
  domain: string,
  type?: string,
  separator: string = ":"
): string {
  if (type) {
    return `${domain}${separator}${type}${separator}*`;
  }
  return `${domain}${separator}*`;
}

// =============================================
// KEY PATTERN FACTORY
// =============================================

/**
 * Key pattern definitions
 */
export interface KeyPatterns {
  [domain: string]: Record<string, KeyBuilder<any> | StaticKeyBuilder>;
}

/**
 * Create a key pattern factory
 */
export function createKeyPatterns<
  T extends Record<string, Record<string, any>>,
>(
  definitions: {
    [K in keyof T]: {
      [P in keyof T[K]]: T[K][P] extends () => string
        ? string
        : { pattern: string; params?: Record<string, unknown> };
    };
  },
  config?: KeyPatternConfig
): {
  [K in keyof T]: {
    [P in keyof T[K]]: T[K][P] extends () => string
      ? StaticKeyBuilder
      : KeyBuilder<
          T[K][P] extends { params: infer U } ? U : Record<string, unknown>
        >;
  };
} {
  const result: any = {};

  for (const [domain, patterns] of Object.entries(definitions)) {
    result[domain] = {};

    for (const [name, def] of Object.entries(patterns)) {
      if (typeof def === "string") {
        result[domain][name] = createStaticKey(def, config);
      } else if (
        def &&
        typeof def === "object" &&
        "pattern" in def &&
        typeof def.pattern === "string"
      ) {
        result[domain][name] = createKeyBuilder(def.pattern, config);
      }
    }
  }

  return result;
}

// =============================================
// COMMON KEY PATTERNS
// =============================================

/**
 * Common key pattern strings for scanning
 */
export const CommonPatterns = {
  // User patterns
  USER_ALL: "user:*",
  USER_PROFILE: "user:profile:*",
  USER_FEED: "user:feed:*",
  USER_FOLLOWERS: "user:followers:*",
  USER_FOLLOWING: "user:following:*",

  // Post patterns
  POST_ALL: "post:*",
  POST_DATA: "post:data:*",
  POST_ENGAGEMENT: "post:engagement:*",
  POST_LIKERS: "post:likers:*",

  // Rate limit patterns
  RATE_LIMIT_ALL: "ratelimit:*",
  RATE_LIMIT_API: "ratelimit:api:*",
  RATE_LIMIT_IP: "ratelimit:ip:*",

  // Session patterns
  SESSION_ALL: "session:*",
  SESSION_TOKEN: "session:token:*",
  SESSION_USER: "session:user:*",

  // Lock patterns
  LOCK_ALL: "lock:*",

  // Metrics patterns
  METRICS_ALL: "metrics:*",
} as const;

/**
 * Build a key with prefix
 */
export function withPrefix(key: string, prefix: string): string {
  if (!prefix) return key;
  return `${prefix}:${key}`;
}

/**
 * Strip prefix from key
 */
export function stripPrefix(key: string, prefix: string): string {
  if (!prefix) return key;
  if (key.startsWith(`${prefix}:`)) {
    return key.slice(prefix.length + 1);
  }
  return key;
}
