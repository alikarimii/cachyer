import { describe, it, expect } from "vitest";
import {
  createKeyBuilder,
  createStaticKey,
  parseKey,
  validateKey,
  createKeyPattern,
  createKeyPatterns,
  withPrefix,
  stripPrefix,
  CommonPatterns,
} from "../src/utils/key-patterns";

describe("key-patterns", () => {
  // =============================================
  // createKeyBuilder
  // =============================================

  describe("createKeyBuilder", () => {
    it("should build key from pattern with single param", () => {
      const builder = createKeyBuilder<{ userId: string }>("user:{userId}");
      expect(builder({ userId: "123" })).toBe("user:123");
    });

    it("should build key from pattern with multiple params", () => {
      const builder = createKeyBuilder<{ domain: string; id: string }>(
        "{domain}:data:{id}"
      );
      expect(builder({ domain: "user", id: "456" })).toBe("user:data:456");
    });

    it("should apply prefix from config", () => {
      const builder = createKeyBuilder<{ id: string }>("item:{id}", {
        prefix: "app",
      });
      expect(builder({ id: "1" })).toBe("app:item:1");
    });

    it("should use custom separator", () => {
      const builder = createKeyBuilder<{ id: string }>("item:{id}", {
        prefix: "app",
        separator: "/",
      });
      expect(builder({ id: "1" })).toBe("app/item:1");
    });

    it("should throw for missing required param when validate is true", () => {
      const builder = createKeyBuilder<{ id: string }>("item:{id}", {
        validate: true,
      });
      expect(() => builder({} as any)).toThrow("Missing required parameter: id");
    });

    it("should not throw when validate is false", () => {
      const builder = createKeyBuilder<{ id: string }>("item:{id}", {
        validate: false,
      });
      expect(builder({} as any)).toBe("item:");
    });

    it("should handle pattern with no placeholders", () => {
      const builder = createKeyBuilder<Record<string, unknown>>("static:key");
      expect(builder({})).toBe("static:key");
    });

    it("should work without config (defaults)", () => {
      const builder = createKeyBuilder<{ x: string }>("{x}:data");
      expect(builder({ x: "test" })).toBe("test:data");
    });
  });

  // =============================================
  // createStaticKey
  // =============================================

  describe("createStaticKey", () => {
    it("should create a static key builder", () => {
      const key = createStaticKey("config:global");
      expect(key()).toBe("config:global");
    });

    it("should apply prefix", () => {
      const key = createStaticKey("settings", { prefix: "app" });
      expect(key()).toBe("app:settings");
    });

    it("should use custom separator", () => {
      const key = createStaticKey("settings", { prefix: "app", separator: "/" });
      expect(key()).toBe("app/settings");
    });

    it("should return same value on repeated calls", () => {
      const key = createStaticKey("fixed");
      expect(key()).toBe(key());
    });
  });

  // =============================================
  // parseKey
  // =============================================

  describe("parseKey", () => {
    it("should parse domain, type, and ids", () => {
      const result = parseKey("user:profile:123");
      expect(result).toEqual({
        domain: "user",
        type: "profile",
        ids: ["123"],
      });
    });

    it("should parse key with multiple ids", () => {
      const result = parseKey("post:comment:456:789");
      expect(result).toEqual({
        domain: "post",
        type: "comment",
        ids: ["456", "789"],
      });
    });

    it("should parse key with no ids", () => {
      const result = parseKey("global:config");
      expect(result).toEqual({
        domain: "global",
        type: "config",
        ids: [],
      });
    });

    it("should parse single-part key", () => {
      const result = parseKey("single");
      expect(result).toEqual({
        domain: "single",
        type: "",
        ids: [],
      });
    });

    it("should use custom separator", () => {
      const result = parseKey("user/profile/123", "/");
      expect(result).toEqual({
        domain: "user",
        type: "profile",
        ids: ["123"],
      });
    });
  });

  // =============================================
  // validateKey
  // =============================================

  describe("validateKey", () => {
    it("should validate key matches domain", () => {
      expect(validateKey("user:profile:123", "user")).toBe(true);
    });

    it("should reject key with wrong domain", () => {
      expect(validateKey("post:data:1", "user")).toBe(false);
    });

    it("should reject empty key", () => {
      expect(validateKey("", "user")).toBe(false);
    });
  });

  // =============================================
  // createKeyPattern
  // =============================================

  describe("createKeyPattern", () => {
    it("should create pattern with domain only", () => {
      expect(createKeyPattern("user")).toBe("user:*");
    });

    it("should create pattern with domain and type", () => {
      expect(createKeyPattern("user", "profile")).toBe("user:profile:*");
    });

    it("should use custom separator", () => {
      expect(createKeyPattern("user", "profile", "/")).toBe("user/profile/*");
    });
  });

  // =============================================
  // createKeyPatterns
  // =============================================

  describe("createKeyPatterns", () => {
    it("should create key pattern factory", () => {
      const keys = createKeyPatterns({
        user: {
          profile: { pattern: "user:profile:{userId}" },
          settings: "user:settings:global",
        },
      });

      expect(keys.user.profile({ userId: "123" })).toBe(
        "user:profile:123"
      );
      expect(keys.user.settings()).toBe("user:settings:global");
    });

    it("should apply config prefix", () => {
      const keys = createKeyPatterns(
        {
          data: {
            item: { pattern: "data:{id}" },
          },
        },
        { prefix: "app" }
      );

      expect(keys.data.item({ id: "1" })).toBe("app:data:1");
    });

    it("should handle nested definitions", () => {
      const keys = createKeyPatterns({
        user: {
          profile: { pattern: "user:{userId}:profile" },
          feed: { pattern: "user:{userId}:feed" },
        },
        post: {
          data: { pattern: "post:{postId}:data" },
        },
      });

      expect(keys.user.profile({ userId: "1" })).toBe("user:1:profile");
      expect(keys.post.data({ postId: "42" })).toBe("post:42:data");
    });
  });

  // =============================================
  // withPrefix / stripPrefix
  // =============================================

  describe("withPrefix", () => {
    it("should add prefix to key", () => {
      expect(withPrefix("mykey", "app")).toBe("app:mykey");
    });

    it("should return key unchanged if prefix is empty", () => {
      expect(withPrefix("mykey", "")).toBe("mykey");
    });
  });

  describe("stripPrefix", () => {
    it("should remove prefix from key", () => {
      expect(stripPrefix("app:mykey", "app")).toBe("mykey");
    });

    it("should return key unchanged if no prefix match", () => {
      expect(stripPrefix("other:mykey", "app")).toBe("other:mykey");
    });

    it("should return key unchanged if prefix is empty", () => {
      expect(stripPrefix("mykey", "")).toBe("mykey");
    });
  });

  // =============================================
  // CommonPatterns
  // =============================================

  describe("CommonPatterns", () => {
    it("should have expected patterns", () => {
      expect(CommonPatterns.USER_ALL).toBe("user:*");
      expect(CommonPatterns.USER_PROFILE).toBe("user:profile:*");
      expect(CommonPatterns.POST_ALL).toBe("post:*");
      expect(CommonPatterns.RATE_LIMIT_ALL).toBe("ratelimit:*");
      expect(CommonPatterns.SESSION_ALL).toBe("session:*");
      expect(CommonPatterns.LOCK_ALL).toBe("lock:*");
      expect(CommonPatterns.METRICS_ALL).toBe("metrics:*");
    });
  });
});
