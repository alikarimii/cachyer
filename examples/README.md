# Cachyer Examples

This directory contains complete, working examples showing how to use Cachyer for real-world use cases.

## Available Examples

### 1. Social Media Platform (`social-media-cache.ts`)

A comprehensive example demonstrating how to build a caching layer for a social media platform. Includes:

- **User profiles** - Caching user data with TTL
- **Feed management** - Home feeds, timelines, trending feeds using sorted sets
- **Engagement tracking** - Likes, comments, shares, views with counters
- **Activity streams** - User activity tracking with Redis streams
- **Follower/Following** - Social graph using sets

**Key Patterns Demonstrated:**

- Type-safe key building with `createKeyPatterns`
- Schema definitions with `CacheSchemaBuilder`
- Sorted sets for ranked feeds
- Hash fields for engagement counters
- Sets for social graphs
- Streams for activity feeds

**Run the example:**

```bash
# Install dependencies first
npm install

# Run with ts-node
npx ts-node examples/social-media-cache.ts
```

### 2. Domain-Specific Types (`social-media-types.ts`)

Shows how to extend Cachyer's generic types for your domain. This file demonstrates:

- Extending base interfaces (`WithUserId`, `WithPagination`, etc.)
- Creating domain-specific enums (`FeedType`, `ActivityType`, `EngagementAction`)
- Building complex parameter types by composing base types
- Type utilities for working with cache parameters

**Key Takeaway:** Cachyer provides generic building blocks - you create your own domain types by extending them.

## Creating Your Own Examples

When building your cache layer:

1. **Define your domain types** by extending Cachyer's base types
2. **Create key patterns** using `createKeyPatterns` for type-safe keys
3. **Build schemas** using `CacheSchemaBuilder` for operation validation
4. **Implement service layer** that encapsulates cache operations

### Template Structure

```typescript
// 1. Import Cachyer types
import type { BaseParams, WithUserId } from "cachyer";

// 2. Define your domain types
export interface YourDomainParams extends WithUserId {
  // your fields
}

// 3. Create key patterns
const patterns = createKeyPatterns({
  entity: {
    detail: { pattern: "entity:{id}" },
  },
});

// 4. Build service
export class YourCacheService {
  private cachyer: Cachyer;

  // implement your methods
}
```

## Common Use Cases

- **E-commerce**: Product catalogs, shopping carts, inventory, pricing
- **Social Media**: Feeds, profiles, notifications, activity streams
- **Analytics**: Metrics, counters, time-series data, aggregations
- **Gaming**: Leaderboards, player stats, session data, matchmaking
- **Content Platforms**: Articles, comments, likes, trending content
- **API Layer**: Rate limiting, request caching, response caching

## Contributing Examples

Have a great example? PRs welcome! Please ensure:

- Complete, runnable code
- Clear comments explaining patterns
- README section documenting the example
- No production credentials or sensitive data
