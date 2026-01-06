// =============================================
// EXAMPLE: Social Media Platform Types
// =============================================
// This example demonstrates how to extend Cachyer's generic types
// for a social media/community platform use case
// =============================================

import type {
  BaseParams,
  WithPagination,
  WithScore,
  WithTimestamp,
  WithUserId,
} from "../src/types/params.types";

// =============================================
// DOMAIN-SPECIFIC ID PARAMS
// =============================================

export interface WithPostId extends BaseParams {
  postId: string;
}

export interface WithCommunityId extends BaseParams {
  communityId: string;
}

export interface WithCategoryId extends BaseParams {
  categoryId: string;
}

// =============================================
// FEED TYPES
// =============================================

export type FeedType =
  | "home"
  | "timeline"
  | "trending"
  | "community"
  | "category"
  | "discovery"
  | "user";

export interface FeedParams extends WithUserId {
  feedType: FeedType;
}

export interface FeedAddParams extends WithUserId, WithPostId, WithScore {
  feedType: FeedType;
}

export interface FeedGetParams extends WithUserId, WithPagination {
  feedType: FeedType;
}

export interface FeedCursorValue {
  lastPostId: string;
  lastScore: number;
  offset: number;
  timestamp: number;
  feedVersion?: number;
}

export interface FeedCursorParams extends WithUserId {
  feedType: FeedType;
  cursor?: FeedCursorValue;
}

// =============================================
// ENGAGEMENT TYPES
// =============================================

export type EngagementAction = "like" | "unlike" | "comment" | "share" | "view";

export interface EngagementParams extends WithPostId, WithUserId {
  action: EngagementAction;
  timestamp?: number;
}

export interface EngagementStats {
  likes: number;
  comments: number;
  shares: number;
  views: number;
  uniqueViewers?: number;
}

// =============================================
// ACTIVITY TYPES
// =============================================

export type ActivityType =
  | "like"
  | "comment"
  | "share"
  | "follow"
  | "unfollow"
  | "post"
  | "mention"
  | "join_community"
  | "leave_community"
  | "donation"
  | "volunteer";

export interface ActivityParams extends WithUserId, WithTimestamp {
  activityType: ActivityType;
  actorId: string;
  objectId: string;
  objectType: string;
  metadata?: Record<string, unknown>;
}

// =============================================
// LOCK TYPES
// =============================================

export type LockType =
  | "feed_generation"
  | "post_creation"
  | "profile_update"
  | "transaction"
  | "custom";

export interface LockParams extends BaseParams {
  lockName: string;
  lockType: LockType;
  ttlMs: number;
  ownerId?: string;
}

export interface LockResult {
  acquired: boolean;
  lockId?: string;
  expiresAt?: number;
}

// =============================================
// SESSION TYPES
// =============================================

export type UserType = "individual" | "npo" | "admin";

export interface SessionData {
  userId: string;
  userType: UserType;
  email: string;
  roles: string[];
  createdAt: number;
  expiresAt: number;
  deviceId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionParams extends BaseParams {
  token: string;
  sessionData?: SessionData;
}

// =============================================
// METRICS TYPES
// =============================================

export interface WithDate extends BaseParams {
  date: string; // YYYY-MM-DD format
}

export type MetricField =
  | "totalRequests"
  | "cacheHits"
  | "cacheMisses"
  | "avgResponseTime"
  | "p95ResponseTime"
  | "p99ResponseTime"
  | "errors";

export interface MetricsParams extends WithDate {
  metric?: MetricField;
  value?: number;
}
