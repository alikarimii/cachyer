# Publishing Cachyer to NPM

## Pre-Publishing Checklist

### 1. Complete Your Package Metadata

Your `package.json` is already well-configured! ✅

- ✅ Name: `cachyer`
- ✅ Version: `1.0.0`
- ✅ Description
- ✅ Repository URL
- ✅ License: MIT
- ✅ Files to publish: `["dist", "README.md", "LICENSE"]`
- ✅ Build script with `prepublishOnly` hook

### 2. Add Missing Files

Create a LICENSE file (required for MIT license):

```bash
# Create LICENSE file
cat > LICENSE << 'EOF'
MIT License

Copyright (c) 2026 Ali Karimi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF
```

### 3. Build and Test

```bash
# Install dependencies
npm install

# Run TypeScript type checking
npm run typecheck

# Build the package
npm run build

# Check what will be published (dry run)
npm pack --dry-run

# Or create actual tarball to inspect
npm pack
# Then extract and inspect: tar -xzf cachyer-1.0.0.tgz
```

### 4. Test Locally

Test your package locally before publishing:

```bash
# In your cachyer directory
npm pack

# In a test project directory
cd /path/to/test-project
npm install /path/to/cachyer/cachyer-1.0.0.tgz

# Test it
node -e "const { Cachyer } = require('cachyer'); console.log(Cachyer)"
```

## Publishing Steps

### 5. Create NPM Account (if you don't have one)

```bash
# Sign up at https://www.npmjs.com/signup
# Or create from CLI
npm adduser
```

### 6. Login to NPM

```bash
npm login
# Enter your credentials
```

### 7. Check Package Name Availability

```bash
# Check if 'cachyer' is available
npm view cachyer
# If you get "npm ERR! 404 'cachyer' is not in this registry", it's available!
```

### 8. Publish!

```bash
# First time publish
npm publish

# For scoped packages (if name was taken)
# Update package.json: "name": "@yourusername/cachyer"
npm publish --access public
```

## Post-Publishing

### 9. Verify Publication

```bash
# Check your package on npm
npm view cachyer

# Install in a test project
npm install cachyer
```

### 10. Add NPM Badge to README

Add this to your README.md:

```markdown
[![npm version](https://badge.fury.io/js/cachyer.svg)](https://www.npmjs.com/package/cachyer)
[![npm downloads](https://img.shields.io/npm/dm/cachyer.svg)](https://www.npmjs.com/package/cachyer)
```

## Publishing Updates

### Semantic Versioning

- **Patch** (1.0.0 → 1.0.1): Bug fixes, no API changes
- **Minor** (1.0.0 → 1.1.0): New features, backward compatible
- **Major** (1.0.0 → 2.0.0): Breaking changes

```bash
# Update version and publish
npm version patch  # or minor, or major
npm publish

# Or manually
# 1. Update version in package.json
# 2. git commit -am "v1.0.1"
# 3. git tag v1.0.1
# 4. git push && git push --tags
# 5. npm publish
```

## Important Notes

### What Gets Published

Your `package.json` has:

```json
"files": ["dist", "README.md", "LICENSE"]
```

This means ONLY these files/folders will be published. Good! ✅

The following are automatically excluded:

- `node_modules/`
- `.git/`
- `examples/` (not in files array, so excluded)
- `src/` (not in files array, TypeScript source excluded)
- Files in `.gitignore`

### prepublishOnly Hook

Your package has:

```json
"prepublishOnly": "npm run build"
```

This automatically builds before publishing. ✅

### Peer Dependencies

Your package correctly marks `ioredis` as optional peer dependency:

```json
"peerDependencies": {
  "ioredis": "^5.9.0"
},
"peerDependenciesMeta": {
  "ioredis": { "optional": true }
}
```

Users will get a warning if they use Redis adapter without ioredis, but it won't fail. ✅

## Common Issues

### Issue: Package name taken

**Solution**: Use scoped package: `@yourusername/cachyer`

### Issue: "You must verify your email"

**Solution**: Check email from npm and verify

### Issue: "You do not have permission"

**Solution**: Make sure you're logged in: `npm whoami`

### Issue: Build fails

**Solution**: Run `npm run typecheck` first to catch TypeScript errors

### Issue: Package too large

**Solution**: Check with `npm pack` and review `files` in package.json

## Recommended GitHub Actions (CI/CD)

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to NPM

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
          registry-url: "https://registry.npmjs.org"
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{secrets.NPM_TOKEN}}
```

Then publish by creating a GitHub release!

## Quick Reference

```bash
# First time setup
npm login
npm run build
npm publish

# Updates
npm version patch
npm publish

# Check what will be published
npm pack --dry-run
```
