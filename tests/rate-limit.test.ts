import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryAdapter } from "../src/adapters/memory/memory.adapter";
import {
  RateLimitService,
  DefaultRateLimitConfigs,
} from "../src/services/rate-limit.service";

describe("RateLimitService", () => {
  let adapter: MemoryAdapter;
  let service: RateLimitService;

  beforeEach(async () => {
    adapter = new MemoryAdapter({ checkInterval: 0 });
    await adapter.connect();
    service = new RateLimitService(adapter);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  // =============================================
  // CONSTRUCTOR
  // =============================================

  describe("constructor", () => {
    it("should create with default config", () => {
      const svc = new RateLimitService(adapter);
      expect(svc).toBeDefined();
    });

    it("should create with custom config", () => {
      const svc = new RateLimitService(adapter, {
        keyPrefix: "custom",
        defaultConfig: { maxRequests: 50, windowSeconds: 30 },
        endpoints: { api: { maxRequests: 10, windowSeconds: 60 } },
      });
      expect(svc).toBeDefined();
    });
  });

  // =============================================
  // CHECK (Basic / Fixed Window)
  // =============================================

  describe("check()", () => {
    it("should allow requests under the limit", async () => {
      const result = await service.check("user1", "default");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it("should block requests over the limit", async () => {
      const svc = new RateLimitService(adapter, {
        defaultConfig: { maxRequests: 2, windowSeconds: 60 },
      });

      await svc.check("user1", "default");
      await svc.check("user1", "default");
      const result = await svc.check("user1", "default");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should track remaining correctly", async () => {
      const svc = new RateLimitService(adapter, {
        defaultConfig: { maxRequests: 5, windowSeconds: 60 },
      });

      const r1 = await svc.check("user1", "default");
      expect(r1.remaining).toBe(4);

      const r2 = await svc.check("user1", "default");
      expect(r2.remaining).toBe(3);
    });

    it("should use endpoint-specific config", async () => {
      const svc = new RateLimitService(adapter, {
        endpoints: {
          strict: { maxRequests: 1, windowSeconds: 60 },
        },
        defaultConfig: { maxRequests: 100, windowSeconds: 60 },
      });

      await svc.check("user1", "strict");
      const result = await svc.check("user1", "strict");
      expect(result.allowed).toBe(false);
    });

    it("should fall back to default config for unknown endpoint", async () => {
      const result = await service.check("user1", "unknown-endpoint");
      expect(result.allowed).toBe(true);
    });

    it("should provide retryAfter when blocked", async () => {
      const svc = new RateLimitService(adapter, {
        defaultConfig: { maxRequests: 1, windowSeconds: 60 },
      });

      await svc.check("user1", "default");
      const result = await svc.check("user1", "default");
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("should not provide retryAfter when allowed", async () => {
      const result = await service.check("user1", "default");
      expect(result.retryAfter).toBeUndefined();
    });

    it("should have resetAt in the future", async () => {
      const result = await service.check("user1", "default");
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });
  });

  // =============================================
  // CHECK SLIDING WINDOW
  // =============================================

  describe("checkSlidingWindow()", () => {
    it("should allow requests under the limit", async () => {
      const result = await service.checkSlidingWindow("user1", "default");
      expect(result.allowed).toBe(true);
    });

    it("should block when over limit", async () => {
      const svc = new RateLimitService(adapter, {
        defaultConfig: { maxRequests: 2, windowSeconds: 60 },
      });

      await svc.checkSlidingWindow("user1", "default");
      await svc.checkSlidingWindow("user1", "default");
      const result = await svc.checkSlidingWindow("user1", "default");
      // MemoryAdapter falls back to basic check since it has no executeScript
      expect(result.allowed).toBe(false);
    });

    it("should accept custom config", async () => {
      const result = await service.checkSlidingWindow("user1", "default", {
        maxRequests: 50,
        windowSeconds: 120,
      });
      expect(result.allowed).toBe(true);
    });
  });

  // =============================================
  // CHECK IP
  // =============================================

  describe("checkIP()", () => {
    it("should rate limit by IP", async () => {
      const svc = new RateLimitService(adapter);
      const result = await svc.checkIP("192.168.1.1");
      expect(result.allowed).toBe(true);
    });

    it("should block IP over limit", async () => {
      const svc = new RateLimitService(adapter);
      const config = { maxRequests: 2, windowSeconds: 60 };

      await svc.checkIP("10.0.0.1", config);
      await svc.checkIP("10.0.0.1", config);
      const result = await svc.checkIP("10.0.0.1", config);
      expect(result.allowed).toBe(false);
    });

    it("should separate rate limits per IP", async () => {
      const svc = new RateLimitService(adapter);
      const config = { maxRequests: 1, windowSeconds: 60 };

      await svc.checkIP("1.1.1.1", config);
      const result = await svc.checkIP("2.2.2.2", config);
      expect(result.allowed).toBe(true);
    });
  });

  // =============================================
  // RESET
  // =============================================

  describe("reset()", () => {
    it("should reset rate limit counter", async () => {
      const svc = new RateLimitService(adapter, {
        defaultConfig: { maxRequests: 2, windowSeconds: 60 },
      });

      await svc.check("user1", "default");
      await svc.check("user1", "default");
      expect((await svc.check("user1", "default")).allowed).toBe(false);

      await svc.reset("user1", "default");
      const result = await svc.check("user1", "default");
      expect(result.allowed).toBe(true);
    });
  });

  // =============================================
  // GET STATUS
  // =============================================

  describe("getStatus()", () => {
    it("should return current status", async () => {
      const svc = new RateLimitService(adapter, {
        defaultConfig: { maxRequests: 10, windowSeconds: 60 },
      });

      await svc.check("user1", "default");
      await svc.check("user1", "default");

      const status = await svc.getStatus("user1", "default");
      expect(status.count).toBe(2);
      expect(status.remaining).toBe(8);
      expect(status.ttl).toBeGreaterThanOrEqual(0);
    });

    it("should return zero count for new identifier", async () => {
      const status = await service.getStatus("newuser", "default");
      expect(status.count).toBe(0);
      expect(status.remaining).toBe(
        DefaultRateLimitConfigs.default!.maxRequests
      );
    });
  });

  // =============================================
  // HEADERS
  // =============================================

  describe("headers", () => {
    it("should generate correct rate limit headers", async () => {
      const svc = new RateLimitService(adapter, {
        defaultConfig: { maxRequests: 100, windowSeconds: 60 },
      });

      const result = await svc.check("user1", "default");
      expect(result.headers["X-RateLimit-Limit"]).toBe("100");
      expect(result.headers["X-RateLimit-Remaining"]).toBeDefined();
      expect(result.headers["X-RateLimit-Reset"]).toBeDefined();
      expect(result.headers["Retry-After"]).toBeUndefined();
    });

    it("should include Retry-After when blocked", async () => {
      const svc = new RateLimitService(adapter, {
        defaultConfig: { maxRequests: 1, windowSeconds: 60 },
      });

      await svc.check("user1", "default");
      const result = await svc.check("user1", "default");
      expect(result.headers["Retry-After"]).toBeDefined();
    });

    it("should have numeric string values in headers", async () => {
      const result = await service.check("user1", "default");
      expect(Number(result.headers["X-RateLimit-Limit"])).not.toBeNaN();
      expect(Number(result.headers["X-RateLimit-Remaining"])).not.toBeNaN();
      expect(Number(result.headers["X-RateLimit-Reset"])).not.toBeNaN();
    });
  });

  // =============================================
  // DEFAULT CONFIGS
  // =============================================

  describe("DefaultRateLimitConfigs", () => {
    it("should have expected presets", () => {
      expect(DefaultRateLimitConfigs.default).toBeDefined();
      expect(DefaultRateLimitConfigs.strict).toBeDefined();
      expect(DefaultRateLimitConfigs.relaxed).toBeDefined();
      expect(DefaultRateLimitConfigs.default!.maxRequests).toBe(100);
      expect(DefaultRateLimitConfigs.strict!.maxRequests).toBe(10);
      expect(DefaultRateLimitConfigs.relaxed!.maxRequests).toBe(1000);
    });
  });
});
