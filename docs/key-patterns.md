# Key Patterns

Type-safe key builders that parse `{placeholder}` tokens and return functions with typed parameters.

## createKeyBuilder

Create a single key builder:

```typescript
import { createKeyBuilder } from "cachyer";

const userKey = createKeyBuilder<{ userId: string }>("user:profile:{userId}");

userKey({ userId: "123" });
// "user:profile:123"
```

## createKeyPatterns

For larger applications, organize all key patterns in one place:

```typescript
import { createKeyPatterns } from "cachyer";

const keys = createKeyPatterns(
  {
    user: {
      profile: { pattern: "user:profile:{userId}" },
      feed: { pattern: "user:feed:{userId}" },
      followers: { pattern: "user:followers:{userId}" },
      settings: { pattern: "user:settings:{userId}:{setting}" },
      allUsers: "user:all", // static key (no parameters)
    },
    post: {
      data: { pattern: "post:{postId}" },
      likes: { pattern: "post:likes:{postId}" },
    },
    session: {
      token: { pattern: "session:token:{token}" },
    },
  },
  { prefix: "myapp" },
);

keys.user.profile({ userId: "123" });
// "myapp:user:profile:123"

keys.user.settings({ userId: "123", setting: "theme" });
// "myapp:user:settings:123:theme"

keys.user.allUsers();
// "myapp:user:all"
```

Benefits:
- Centralized key management
- Full TypeScript autocomplete
- Change patterns in one place
- Supports both parameterized and static keys

## createKeyPattern

Generate glob-style scan patterns:

```typescript
import { createKeyPattern } from "cachyer";

const pattern = createKeyPattern("user", "profile");
// "user:profile:*"
```
