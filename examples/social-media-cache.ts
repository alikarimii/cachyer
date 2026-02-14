// =============================================
// EXAMPLE: Social Media Cache Implementation
// =============================================
// Complete working example showing how to use Cachyer
// for a social media platform with feeds, engagement, and activities
// =============================================

import { createTypedSchema } from "../src";
import { MemoryAdapter } from "../src/adapters/memory/memory.adapter";
import { Cachyer } from "../src/core/cachyer";
import { createKeyPatterns } from "../src/utils/key-patterns";
import type {
  ActivityParams,
  EngagementParams,
  EngagementStats,
  FeedAddParams,
  FeedGetParams,
  FeedParams,
} from "./social-media-types";

// =============================================
// KEY PATTERNS
// =============================================

const patterns = createKeyPatterns({
  user: {
    profile: { pattern: "user:{userId}:profile" },
    settings: { pattern: "user:{userId}:settings" },
    followers: { pattern: "user:{userId}:followers" },
    following: { pattern: "user:{userId}:following" },
  },
  feed: {
    home: { pattern: "feed:{userId}:home" },
    timeline: { pattern: "feed:{userId}:timeline" },
    trending: { pattern: "feed:trending:{date}" },
    community: { pattern: "feed:community:{communityId}" },
  },
  post: {
    detail: { pattern: "post:{postId}" },
    engagement: { pattern: "post:{postId}:engagement" },
    comments: { pattern: "post:{postId}:comments" },
    likes: { pattern: "post:{postId}:likes" },
  },
  activity: {
    user: { pattern: "activity:{userId}" },
    global: { pattern: "activity:global" },
  },
});

// =============================================
// TYPED CACHE SCHEMA EXAMPLE
// =============================================

// Define key params type
type CacheKeyParams = { key: string };

// Create a fully typed schema - operations are inferred!
const cache = createTypedSchema<CacheKeyParams>()
  .name("demo-cache")
  .keyPattern("demo:{key}")
  .structure("STRING")
  .ttl(3600)
  .operations((ops) => ops.addGet().addSet().addDelete().addExists())
  .build();

// Now you get full autocomplete and type checking:
// cache.operations.get    ✅ typed as GetOperation
// cache.operations.set    ✅ typed as SetOperation
// cache.operations.delete ✅ typed as DeleteOperation
// cache.operations.exists ✅ typed as ExistsOperation
// cache.operations.foo    ❌ TypeScript error: Property 'foo' does not exist

// Access operations with full type safety
const getOp = cache.operations.get;
const setOp = cache.operations.set;
const deleteOp = cache.operations.delete;
const existsOp = cache.operations.exists;

// =============================================
// CACHE SERVICE
// =============================================
export class SocialMediaCache {
  private cachyer: Cachyer;

  constructor(adapter?: MemoryAdapter) {
    this.cachyer = new Cachyer({
      adapter: adapter || new MemoryAdapter(),
      keyPrefix: "socialmedia",
      defaultTtl: 3600,
    });
  }

  async connect(): Promise<void> {
    await this.cachyer.connect();
  }

  async disconnect(): Promise<void> {
    await this.cachyer.disconnect();
  }

  // =============================================
  // USER OPERATIONS
  // =============================================

  async getUserProfile(userId: string): Promise<string | null> {
    const key = patterns.user.profile({ userId });
    return await this.cachyer.get(key);
  }

  async setUserProfile(userId: string, profile: unknown): Promise<void> {
    const key = patterns.user.profile({ userId });
    await this.cachyer.set(key, JSON.stringify(profile));
  }

  async addFollower(userId: string, followerId: string): Promise<void> {
    const key = patterns.user.followers({ userId });
    await this.cachyer.sadd(key, followerId);
  }

  async getFollowers(userId: string): Promise<string[]> {
    const key = patterns.user.followers({ userId });
    return await this.cachyer.smembers(key);
  }

  // =============================================
  // FEED OPERATIONS
  // =============================================

  async addToFeed(params: FeedAddParams): Promise<void> {
    const { userId, feedType, postId, score } = params;
    let key: string;

    switch (feedType) {
      case "home":
        key = patterns.feed.home({ userId });
        break;
      case "timeline":
        key = patterns.feed.timeline({ userId });
        break;
      case "community":
        // Would need communityId in params
        throw new Error("Community feed requires communityId");
      default:
        throw new Error(`Unsupported feed type: ${feedType}`);
    }

    await this.cachyer.zadd(key, [{ member: postId, score }]);
  }

  async getFeed(params: FeedGetParams): Promise<string[]> {
    const { userId, feedType, start, stop } = params;
    let key: string;

    switch (feedType) {
      case "home":
        key = patterns.feed.home({ userId });
        break;
      case "timeline":
        key = patterns.feed.timeline({ userId });
        break;
      default:
        throw new Error(`Unsupported feed type: ${feedType}`);
    }

    // Get posts in reverse chronological order (highest scores first)
    const result = await this.cachyer.zrevrange(key, start, stop);
    // The result could be string[] or Array<{member, score}>
    if (Array.isArray(result) && result.length > 0) {
      // Check if it's an array of objects
      if (
        typeof result[0] === "object" &&
        result[0] !== null &&
        "member" in result[0]
      ) {
        return (result as Array<{ member: string; score: number }>).map(
          (item) => item.member,
        );
      }
    }
    return result as string[];
  }

  async removeFeedPost(params: FeedParams & { postId: string }): Promise<void> {
    const { userId, feedType, postId } = params;
    const key =
      feedType === "home"
        ? patterns.feed.home({ userId })
        : patterns.feed.timeline({ userId });

    // Using adapter directly for operations not exposed via Cachyer
    await this.cachyer.adapter.zrem(key, postId);
  }

  // =============================================
  // ENGAGEMENT OPERATIONS
  // =============================================

  async recordEngagement(params: EngagementParams): Promise<void> {
    const { postId, userId, action } = params;
    const engagementKey = patterns.post.engagement({ postId });

    switch (action) {
      case "like":
        // Increment likes count
        await this.cachyer.adapter.hincrby(engagementKey, "likes", 1);
        // Add user to likes set
        const likesKey = patterns.post.likes({ postId });
        await this.cachyer.sadd(likesKey, userId);
        break;

      case "unlike":
        // Decrement likes count
        await this.cachyer.adapter.hincrby(engagementKey, "likes", -1);
        // Remove user from likes set
        const unlikesKey = patterns.post.likes({ postId });
        await this.cachyer.adapter.srem(unlikesKey, userId);
        break;

      case "view":
        // Increment views
        await this.cachyer.adapter.hincrby(engagementKey, "views", 1);
        break;

      case "comment":
        // Increment comments
        await this.cachyer.adapter.hincrby(engagementKey, "comments", 1);
        break;

      case "share":
        // Increment shares
        await this.cachyer.adapter.hincrby(engagementKey, "shares", 1);
        break;
    }
  }

  async getEngagementStats(postId: string): Promise<EngagementStats> {
    const key = patterns.post.engagement({ postId });
    const stats = await this.cachyer.hgetall(key);

    return {
      likes: parseInt(stats.likes as string) || 0,
      comments: parseInt(stats.comments as string) || 0,
      shares: parseInt(stats.shares as string) || 0,
      views: parseInt(stats.views as string) || 0,
    };
  }

  async hasUserLiked(postId: string, userId: string): Promise<boolean> {
    const key = patterns.post.likes({ postId });
    const adapter = (this.cachyer as any).adapter;
    return await adapter.sismember(key, userId);
  }

  // =============================================
  // ACTIVITY STREAM OPERATIONS
  // =============================================

  async addActivity(params: ActivityParams): Promise<void> {
    const { userId, activityType, actorId, objectId, objectType, metadata } =
      params;

    const activity = {
      type: activityType,
      actor: actorId,
      object: objectId,
      objectType,
      timestamp: Date.now().toString(),
      ...metadata,
    };

    const adapter = (this.cachyer as any).adapter;

    // Add to user's activity stream (if adapter supports streams)
    if (typeof adapter.xadd === "function") {
      const userKey = patterns.activity.user({ userId });
      await adapter.xadd(userKey, "*", activity);

      // Add to global activity stream
      const globalKey = patterns.activity.global({});
      await adapter.xadd(globalKey, "*", activity);
    } else {
      // Fallback: use list if streams not supported
      const userKey = patterns.activity.user({ userId });
      await this.cachyer.lpush(userKey, JSON.stringify(activity));
    }
  }

  async getUserActivities(
    userId: string,
    count: number = 50,
  ): Promise<Array<Record<string, unknown>>> {
    const key = patterns.activity.user({ userId });
    const adapter = (this.cachyer as any).adapter;

    if (typeof adapter.xrevrange === "function") {
      // Use streams if supported
      const entries: Array<[string, Record<string, string>]> =
        await adapter.xrevrange(key, "+", "-", count);

      return entries.map(([id, fields]) => ({
        id,
        ...fields,
      }));
    } else {
      // Fallback: use list
      const activities = await this.cachyer.lrange(key, 0, count - 1);
      return activities.map((activity) => JSON.parse(activity));
    }
  }

  // =============================================
  // CACHE MANAGEMENT
  // =============================================

  async clearUserCache(userId: string): Promise<void> {
    const keys = [
      patterns.user.profile({ userId }),
      patterns.user.settings({ userId }),
      patterns.user.followers({ userId }),
      patterns.user.following({ userId }),
      patterns.feed.home({ userId }),
      patterns.feed.timeline({ userId }),
      patterns.activity.user({ userId }),
    ];

    await Promise.all(keys.map((key) => this.cachyer.del(key)));
  }

  async warmUpFeed(userId: string, postIds: string[]): Promise<void> {
    const key = patterns.feed.home({ userId });
    const timestamp = Date.now();

    // Add all posts with current timestamp as score
    const members = postIds.map((postId, index) => ({
      member: postId,
      score: timestamp - index, // Reverse chronological
    }));

    await this.cachyer.zadd(key, members);
  }
}

// =============================================
// USAGE EXAMPLE
// =============================================

async function main() {
  const cache = new SocialMediaCache();
  await cache.connect();

  try {
    // Set user profile
    await cache.setUserProfile("user123", {
      name: "John Doe",
      email: "john@example.com",
      bio: "Software developer",
    });

    // Get user profile
    const profile = await cache.getUserProfile("user123");
    console.log("Profile:", profile);

    // Add posts to home feed
    await cache.addToFeed({
      userId: "user123",
      feedType: "home",
      postId: "post1",
      score: Date.now(),
    });

    await cache.addToFeed({
      userId: "user123",
      feedType: "home",
      postId: "post2",
      score: Date.now(),
    });

    // Get home feed
    const feed = await cache.getFeed({
      userId: "user123",
      feedType: "home",
      start: 0,
      stop: 9,
    });
    console.log("Home feed:", feed);

    // Record engagement
    await cache.recordEngagement({
      postId: "post1",
      userId: "user123",
      action: "like",
    });

    // Get engagement stats
    const stats = await cache.getEngagementStats("post1");
    console.log("Engagement stats:", stats);

    // Add activity
    await cache.addActivity({
      userId: "user123",
      activityType: "like",
      actorId: "user123",
      objectId: "post1",
      objectType: "post",
      timestamp: Date.now(),
    });

    // Get user activities
    const activities = await cache.getUserActivities("user123", 10);
    console.log("Activities:", activities);
  } finally {
    await cache.disconnect();
  }
}

// Uncomment to run:
// main().catch(console.error)
