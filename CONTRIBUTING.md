# Contributing to Cachyer

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- Node.js >= 18
- npm
- Redis server (for running integration tests against Redis — the memory adapter works without it)

### Setup

```bash
git clone https://github.com/alikarimii/cachyer.git
cd cachyer
npm install
```

### Verify Everything Works

```bash
npm run typecheck   # TypeScript type checking
npm run lint        # ESLint
npm test            # Vitest test suite
npm run build       # tsup production build
```

All four must pass before submitting a PR.

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feat/my-feature
# or
git checkout -b fix/bug-description
```

### 2. Make Changes

- Write code in `src/`
- Add tests in `tests/`
- Run checks frequently:

```bash
npm run build:watch     # rebuild on save
npm run typecheck       # check types
npx vitest run path/to/file  # run a single test file
```

### 3. Before Committing

```bash
npm run typecheck
npm run lint:fix
npm run format
npm test
npm run build
```

### 4. Commit and Push

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): add new feature
fix(scope): fix bug description
chore(scope): maintenance task
refactor(scope): restructure without behavior change
docs(scope): documentation only
test(scope): add or fix tests
```

Examples from the repo:

```
feat(service): add lockService and rateLimitService
fix(ratelimit): export ratelimit factory
feat(set): add get random member
```

## Project Structure

```
src/
  core/           # Cachyer main class, connection management
  adapters/
    redis/        # Redis adapter (ioredis)
    memory/       # In-memory adapter (testing, no deps)
  schemas/        # Schema builder (~1860 lines, fluent API)
  actions/        # CacheAction multi-step workflow engine
  services/       # Rate limiting, distributed lock
  types/          # Core interfaces (CacheAdapter, operations, errors)
  utils/          # Key patterns, cursor pagination, scoring
  index.ts        # Main exports
tests/            # Vitest test files
docs/             # Per-feature documentation
examples/         # Working example files
```

## Code Guidelines

### TypeScript

- **Strict mode** is enabled with `noUncheckedIndexedAccess` — handle `undefined` from index access
- All public APIs must be fully typed — no `any` in public signatures
- Use `readonly` for interface properties and function parameters where possible
- Use `as const` for tuple types, especially in `dependsOn` arrays

### Architecture Rules

Cachyer uses a **two-layer design** — respect this boundary:

- **Cachyer layer** (`src/core/cachyer.ts`): Core operations with key prefixing + metrics. This is what users interact with for common operations.
- **Adapter layer** (`src/adapters/`): Direct backend access without key prefixing. Used for advanced features (streams, bloom filters, HyperLogLog, geo).

If adding a new operation:
- Common operations (strings, hashes, sorted sets, sets, lists) go on the **Cachyer class**
- Specialized/advanced operations go on the **Adapter interface**
- See [docs/architecture.md](./docs/architecture.md) for the full rationale

### Schema Builder

When adding new operation methods to the schema builder (`src/schemas/schema-builder.ts`):
- Add the method to `TypedOperationBuilder` class
- Follow the existing pattern: `addXxx()` returns `this` for chaining
- The operation must be a valid `CacheOperation<TParams, TResult>` with typed `buildArgs` and `parseResult`
- Add the operation to the relevant pre-built template if applicable
- Update the operation method table in `docs/schema-builder.md`

### CacheAction

When modifying the action system (`src/actions/`):
- `action.types.ts` — type definitions only
- `action-builder.ts` — builder API + validation + `CacheAction` class
- `action-executor.ts` — execution engine (batching, retry, rollback)
- Keep the builder's type accumulation pattern (intersection types) intact
- New step config fields must have sensible defaults

### Style

- No emojis in code or comments
- Minimal comments — only where logic isn't self-evident
- Don't add docstrings to internal/private functions unless they're complex
- Keep functions focused and short
- Prefer `const` over `let`

## Adding a New Adapter

1. Create `src/adapters/yourdb/` with the adapter class implementing `CacheAdapter`
2. All required methods from `CacheAdapter` interface must be implemented
3. Optional methods (streams, bloom, HLL, etc.) — implement what the backend supports
4. Add a factory function: `createYourDbAdapter(config)`
5. Add entry point in `tsup.config.ts` for tree-shakeable import
6. Add tests that cover at least: connect/disconnect, get/set/del, hash ops, sorted set ops, TTL
7. Add documentation in `docs/adapters.md`

## Adding a New Service

1. Create `src/services/your-service.ts`
2. Export a factory function: `createYourService(adapter, config)`
3. Export from `src/services/index.ts`
4. Add to main exports in `src/index.ts`
5. Add tests in `tests/`
6. Add documentation in `docs/`

## Testing

- Test framework: **Vitest**
- Use the **MemoryAdapter** for unit tests — no Redis dependency needed
- Test files go in `tests/` with `.test.ts` extension
- Run a single file: `npx vitest run tests/your-file.test.ts`
- Run with coverage: `npm run test:coverage`

### What to Test

- Happy path for each public API
- Error cases and edge cases
- Type-level behavior where applicable (e.g., builder validation)
- For CacheAction: test each step type, error strategies, retry, and rollback

## Documentation

- Each major feature has its own file in `docs/`
- The main `README.md` is kept concise — it shows basic usage and links to docs
- When adding a feature, add or update the relevant doc file
- Update the documentation table in `README.md` if adding a new doc file

## Pull Request Checklist

Before opening a PR, make sure:

- [ ] All four checks pass: `typecheck`, `lint`, `test`, `build`
- [ ] New code has tests with reasonable coverage
- [ ] Public APIs are fully typed (no `any` in signatures)
- [ ] Documentation is updated (relevant doc file + README if needed)
- [ ] Commit messages follow conventional commits format
- [ ] No unrelated changes are included
- [ ] No secrets, credentials, or `.env` files are committed

## Questions?

Open an issue at [github.com/alikarimii/cachyer/issues](https://github.com/alikarimii/cachyer/issues).
