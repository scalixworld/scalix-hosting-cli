# Scalix CLI - Deployment Guide

## Publishing to npm

### Prerequisites

1. npm account with access to `@scalix-world/cli` package
2. npm authentication configured (`npm login`)

### Build & Test

```bash
# Ensure all tests pass
npm run test

# Build the project
npm run build

# Verify build output
ls -la dist/
```

### Version Management

Update version in `package.json`:

```json
{
  "version": "1.0.1"
}
```

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features (backward compatible)
- **PATCH** (1.0.0 → 1.0.1): Bug fixes

### Publishing

```bash
# This will automatically:
# 1. Run prepublish script (build + test)
# 2. Publish to npm
npm publish --access public
```

Or use npm version command:

```bash
# Bump patch version (1.0.0 → 1.0.1)
npm version patch

# Bump minor version (1.0.0 → 1.1.0)
npm version minor

# Bump major version (1.0.0 → 2.0.0)
npm version major

# Then publish
npm publish --access public
```

### Post-Publication

After publishing, verify installation:

```bash
# Test global installation
npm install -g @scalix-world/cli

# Verify CLI works
scalix --version

# Test a command
scalix login
```

## Installation Instructions for Users

Users can install the CLI via npm:

```bash
npm install -g @scalix-world/cli
```

Or using yarn:

```bash
yarn global add @scalix-world/cli
```

## Distribution

The CLI is distributed via:
- **npm registry**: Primary distribution method
- **GitHub Releases**: For alternative installation methods (future)

## CI/CD Integration

For automated publishing, set up GitHub Actions workflow:

```yaml
name: Publish to npm
on:
  release:
    types: [created]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{secrets.NPM_TOKEN}}
```

---

*Deployment guide for Scalix CLI v1.0.0*

