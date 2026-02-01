# Testing Guide

## Quick Start

```bash
# Run all tests (lint + frontend + backend unit)
npm run test:all
```

## Test Commands

| Command | Scope | Environment |
|---------|-------|-------------|
| `npm run test` | Frontend (React) | Node/JSDOM |
| `npm run test:backend` | Backend Unit Tests | Node |
| `npm run test:all` | All of the above | Node |

### Cloudflare Worker Tests (Optional)

```bash
cd express-SplitEase-app
npm run test:worker
```

> **Note:** Worker tests require Cloudflare Wrangler runtime. They are excluded from `test:all` because they cannot run in standard Node environment.

## Test Structure

```
src/__tests__/           # Frontend tests (React components, utils)
express-SplitEase-app/
  └── test/
      ├── *.spec.ts       # Backend unit tests (run with npm run test)
      ├── routes/         # Route handler tests with mocks
      ├── helpers/        # Test utilities
      ├── integration/    # Cloudflare-only (excluded from unit)
      └── index.spec.ts   # Worker test (excluded from unit)
```

## Why Cloudflare Tests Are Separate

Files importing `cloudflare:workers` or `cloudflare:test` require the Wrangler runtime. These cannot be polyfilled in Node.

**Excluded from unit tests:**
- `test/index.spec.ts`
- `test/integration/**`

## CI/CD

Pre-commit hook runs `./scripts/ci_check.sh` which executes:
1. `npm run lint` - ESLint
2. `npm run test` - Frontend tests
3. `npm run test:backend` - Backend unit tests

Worker integration tests are run manually or in a separate CI job with Wrangler.
