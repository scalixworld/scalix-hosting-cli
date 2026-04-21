# CLI - Architecture Mindmap
> Auto-generated 2026-02-10 | Scalix CLI Tool (`@scalix-world/cli` v1.0.0)

## Overview

The Scalix CLI is a Node.js command-line tool for deploying and managing applications on Scalix Hosting. It provides 10 commands covering authentication, deployment lifecycle, log viewing, configuration management, and rollback capabilities. Built with TypeScript targeting ES2020, compiled to CommonJS, and distributed as an npm package with the `scalix` binary.

**Tech Stack:**
- **Language:** TypeScript 5.9+ (strict mode)
- **Runtime:** Node.js >= 18.0.0
- **Command Parser:** Commander.js 11.x
- **HTTP Client:** Axios 1.x
- **UI/UX:** Chalk 5.x (colors), Ora 7.x (spinners), Inquirer 9.x (prompts)
- **Archiving:** Archiver 7.x (zip deployment packages)
- **Security:** Keytar 7.x (OS keychain token storage)
- **Testing:** Vitest 2.x with V8 coverage
- **Build:** `tsc` (TypeScript Compiler)

## Architecture

### Entry Point
- **`src/index.ts`** -- Main CLI entry point (`#!/usr/bin/env node`)
  - Creates a `Commander.Command` program named `scalix`
  - Reads version dynamically from `package.json`
  - Registers all 10 commands with their options and arguments
  - Calls `program.parse()` to process `process.argv`

### Commands

#### Authentication Commands

- **`scalix login`** (`src/commands/login.ts`)
  - Handler: `loginCommand(options: { token?: string })`
  - Options: `--token <token>` (use existing token directly)
  - Flow:
    1. If `--token` provided: verifies via `GET /api/cli/auth/verify`, saves on success
    2. Otherwise: OAuth2 browser flow
       - Generates random `state` parameter
       - Opens browser to `{API_URL}/api/cli/auth/oauth?state={state}`
       - Polls `GET /api/cli/auth/callback?state={state}` for token (max 60 attempts, 5s interval)
       - Falls back to manual token entry via Inquirer prompt if polling fails
    3. Verifies token via API before saving
  - Dependencies: `inquirer`, `open`, `chalk`, `ora`, `token.saveToken`, `api.apiClient`

- **`scalix logout`** (`src/commands/logout.ts`)
  - Handler: `logoutCommand()`
  - No options or arguments
  - Flow: Checks if token exists, clears it via `token.clearToken()`
  - Dependencies: `chalk`, `ora`, `token.getToken`, `token.clearToken`

#### Deployment Commands

- **`scalix deploy`** (`src/commands/deploy.ts`)
  - Handler: `deployCommand(options: DeployOptions)`
  - Options:
    - `-d, --dir <directory>` (default: `.`)
    - `-n, --name <name>` (app name)
    - `--database <type>` (neon|supabase|scalixdb|none, default: none)
    - `--env <file>` (.env file path)
    - `--env-var <key=value>` (repeatable)
  - Flow:
    1. Auth check via `getToken()`
    2. Resolve and validate deployment directory
    3. Determine app name: explicit > package.json name > directory basename
    4. Validate app name against `APP_NAME_PATTERN` (`/^[a-z0-9-]+$/`)
    5. Validate env var names/values
    6. Create ZIP archive (excludes `.git`, `node_modules`, `.scalix-deploy.zip`; keeps `.env`)
    7. Enforce 100MB size limit (`MAX_DEPLOYMENT_SIZE_BYTES`)
    8. Convert ZIP to base64
    9. If `--database=scalixdb`: provision via `POST /api/scalixdb/databases`, poll for connection string
    10. Deploy via `POST /api/hosting/deploy` with `{ appName, sourceCode, sourceType, environmentVariables }`
    11. Poll deployment status via `GET /api/hosting/deployments/{id}` (max 120 attempts, 5s interval)
  - Dependencies: `fs`, `path`, `archiver`, `chalk`, `ora`, `token`, `api`, `env`, `validation`, `constants`

- **`scalix update`** (`src/commands/update.ts`)
  - Handler: `updateCommand(deploymentId: string, options: UpdateOptions)`
  - Arguments: `<deployment-id>` (required)
  - Options: `-d, --dir`, `--env`, `--env-var` (same as deploy)
  - Flow: Similar to deploy but uses `PUT /api/hosting/deployments/{id}` instead of POST
  - Validates deployment exists first via `GET /api/hosting/deployments/{id}`

- **`scalix delete`** (`src/commands/delete.ts`)
  - Handler: `deleteCommand(deploymentId: string, options: { force?: boolean })`
  - Arguments: `<deployment-id>` (required)
  - Options: `-f, --force` (skip confirmation)
  - Alias: `rm`
  - Flow: Fetches deployment info, prompts for confirmation (unless `--force`), calls `DELETE /api/hosting/deployments/{id}`

- **`scalix rollback`** (`src/commands/rollback.ts`)
  - Handler: `rollbackCommand(deploymentId: string, options: { version?: string; force?: boolean })`
  - Arguments: `<deployment-id>` (required)
  - Options: `-v, --version <version>`, `-f, --force`
  - Flow:
    1. Fetches deployment history via `GET /api/hosting/deployments/{id}/history`
    2. If no `--version`: presents Inquirer list picker for version selection
    3. Confirms rollback (unless `--force`)
    4. Executes via `POST /api/hosting/deployments/{id}/rollback` with `{ version }`

#### Monitoring Commands

- **`scalix list`** (`src/commands/list.ts`)
  - Handler: `listCommand(options: { status?: string })`
  - Options: `--status <status>` (filter by deployment status)
  - Alias: `ls`
  - Flow: Calls `GET /api/hosting/deployments` with optional status param, displays formatted table
  - Color-codes status: green=ready, red=error, yellow=other

- **`scalix logs`** (`src/commands/logs.ts`)
  - Handler: `logsCommand(deploymentId: string, options: { follow?: boolean; tail?: string })`
  - Arguments: `<deployment-id>` (required)
  - Options: `-f, --follow`, `--tail <lines>` (default: 100)
  - Flow: Calls `GET /api/hosting/logs?deploymentId={id}&tail={n}`
  - Follow mode: Polls every 2s (`LOGS_POLL_INTERVAL`), handles SIGINT for graceful exit

- **`scalix status`** (`src/commands/status.ts`)
  - Handler: `statusCommand(deploymentId: string)`
  - Arguments: `<deployment-id>` (required)
  - Flow: Calls `GET /api/hosting/deployments/{id}`, displays name, status, URL, database info, timestamps, errors

#### Configuration Command

- **`scalix config`** (`src/commands/config.ts`)
  - Handler: `configCommand(options: { set?: string; get?: string; list?: boolean })`
  - Options: `--list`, `--get <key>`, `--set <key=value>`
  - Supported keys: `API_URL`
  - Flow:
    - `--list`: Shows API URL and auth status (with masked token preview)
    - `--get`: Reads from env vars (supports `SCALIX_` prefix)
    - `--set`: Validates URL format, sets process env var (session-only)

### Utilities

- **`src/utils/api.ts`** -- API Client
  - Creates Axios instance with base URL from `SCALIX_API_URL` env or `https://app.scalix.com`
  - 5-minute timeout (`API_TIMEOUT = 300000ms`)
  - User-Agent header: `scalix-cli/{version}`
  - Request interceptor: Auto-injects `Bearer {token}` from stored token
  - Response interceptor:
    - 401: Returns auth error messages
    - 5xx/network errors: Retries up to 3 times with exponential backoff (GET/PUT/PATCH/DELETE only, not POST)
    - Network errors: Returns user-friendly "check your connection" message

- **`src/utils/token.ts`** -- Token Management
  - Storage location: `~/.scalix/token` (file-based)
  - `getToken()`: Reads token from file, returns trimmed string or null
  - `saveToken(token)`: Creates `~/.scalix/` dir if needed, writes token to file
  - `clearToken()`: Deletes token file
  - Note: Tests mock `keytar` (OS keychain) but source code uses file-based storage

- **`src/utils/env.ts`** -- Environment Variable Loader
  - `loadEnvFile(filePath)`: Parses `.env` files
  - Supports: KEY=VALUE, quoted values, comments (#), empty lines, multiline values, values with `=`
  - Returns empty object for missing files (ENOENT), throws on other errors

- **`src/utils/validation.ts`** -- Input Validation
  - `validateDeploymentId(id)`: alphanumeric + hyphens/underscores, max 100 chars
  - `validateAppName(name)`: lowercase + digits + hyphens, max 63 chars
  - `validateEnvVarName(name)`: `^[A-Z_][A-Z0-9_]*$`, max 100 chars
  - `validateEnvVarValue(value)`: max 10,000 chars
  - `sanitizeDeploymentId(input)`: strips invalid chars
  - `sanitizeAppName(input)`: lowercases, replaces invalid chars with hyphens

- **`src/utils/constants.ts`** -- Centralized Configuration
  - API: `DEFAULT_API_URL = 'https://app.scalix.com'`, `API_TIMEOUT = 300000`
  - Deployment: `MAX_DEPLOYMENT_SIZE_MB = 100`
  - Polling: `DEPLOYMENT_POLL_INTERVAL = 5000`, `DEPLOYMENT_MAX_ATTEMPTS = 120`
  - Logs: `LOGS_POLL_INTERVAL = 2000`, `LOGS_FOLLOW_TAIL = 1000`
  - OAuth: `OAUTH_POLL_INTERVAL = 5000`, `OAUTH_MAX_ATTEMPTS = 60`
  - Retry: `MAX_RETRIES = 3`, `RETRY_DELAY_BASE = 1000`
  - Validation patterns: `DEPLOYMENT_ID_PATTERN`, `APP_NAME_PATTERN`, `ENV_VAR_NAME_PATTERN`

### Config

- **`tsconfig.json`**: ES2020 target, CommonJS modules, strict mode, declaration + source maps
- **`vitest.config.ts`**: Node environment, 30s test timeout, V8 coverage, inlines native module mocks
- **`.eslintrc.json`**: TypeScript ESLint configuration
- **`package.json`**: Binary entry `scalix` -> `./dist/index.js`

## API Integration

All API calls go through the centralized `apiClient` Axios instance in `src/utils/api.ts`.

### Endpoints Used

| Endpoint | Method | Command | Purpose |
|----------|--------|---------|---------|
| `/api/cli/auth/oauth` | Browser | login | OAuth2 initiation |
| `/api/cli/auth/callback` | GET | login | OAuth2 token polling |
| `/api/cli/auth/verify` | GET | login | Token verification |
| `/api/hosting/deploy` | POST | deploy | Create new deployment |
| `/api/hosting/deployments` | GET | list | List all deployments |
| `/api/hosting/deployments/{id}` | GET | status, deploy, update, delete | Get deployment details |
| `/api/hosting/deployments/{id}` | PUT | update | Update deployment |
| `/api/hosting/deployments/{id}` | DELETE | delete | Delete deployment |
| `/api/hosting/deployments/{id}/history` | GET | rollback | Get deployment versions |
| `/api/hosting/deployments/{id}/rollback` | POST | rollback | Rollback deployment |
| `/api/hosting/logs` | GET | logs | Fetch deployment logs |
| `/api/scalixdb/databases` | POST | deploy | Provision ScalixDB |
| `/api/scalixdb/databases/{id}/connection` | GET | deploy | Get DB connection string |

### Base URL
- Default: `https://app.scalix.com`
- Override: `SCALIX_API_URL` environment variable

## Authentication

- **OAuth2 Browser Flow**: Primary method. Opens browser, polls for token via callback endpoint.
- **Direct Token**: `--token` flag bypasses OAuth2 flow.
- **Manual Entry**: Fallback when browser/polling fails -- user pastes token from Inquirer prompt.
- **Token Storage**: File-based at `~/.scalix/token` (plaintext).
- **Token Injection**: Axios request interceptor auto-adds `Authorization: Bearer {token}` to all API calls.
- **Token Expiry**: 401 responses trigger re-authentication prompt.
- **Retry Logic**: 5xx errors and network failures retry up to 3 times (idempotent methods only).

## Build & Distribution

- **Build**: `npm run build` -> `tsc` -> compiles `src/` to `dist/` with declarations and source maps
- **Binary**: `npm install -g @scalix-world/cli` -> `scalix` command available globally
- **Entry**: `./dist/index.js` (with `#!/usr/bin/env node` shebang)
- **Pre-publish**: Runs build + tests + lint before npm publish
- **Dev Mode**: `npm run dev` -> `tsx watch src/index.ts` (hot-reload)
- **Output**: CommonJS modules in `dist/` with `.js`, `.d.ts`, `.js.map`, `.d.ts.map` files

## Tests

### Framework
- **Vitest 2.x** with `vitest run` (single run) and `vitest` (watch mode)
- **Coverage**: V8 provider, reporters: text, json, html

### Test Structure
```
tests/
  commands/
    login.test.ts      -- 10 tests: token auth, OAuth2 flow, browser open, state param, error handling
    status.test.ts     -- 9 tests: auth, status retrieval, multiple statuses, DB info, errors
    deploy.test.ts     -- 12 tests: auth, directory validation, app name, env vars, ZIP, API call, DB options
    logs.test.ts       -- 9 tests: auth, log fetching, tail values, follow mode, errors
    list.test.ts       -- 9 tests: auth, listing, status filtering, formatting, errors
    config.test.ts     -- 12 tests: list/get/set operations, validation, error handling
  utils/
    env.test.ts        -- 10 tests: .env parsing, comments, quotes, whitespace, ENOENT, complex files
    token.test.ts      -- 11 tests: get/save/clear token, keytar fallback, isAuthenticated
    api.test.ts        -- 9 tests: axios config, request/response interceptors, error handling
```

### Mocking Strategy
- All external dependencies (ora, chalk, inquirer, open, keytar) are fully mocked
- API client is mocked at module level
- Token utilities are mocked per test suite
- `process.exit` is spied on to verify error exits
- File system operations (fs/promises, archiver) are mocked for deploy tests

## Issues Found

1. **Token storage inconsistency**: Source code (`src/utils/token.ts`) uses file-based storage (`~/.scalix/token`) while tests (`tests/utils/token.test.ts`) mock `keytar` (OS keychain) and test `isAuthenticated()` which does not exist in the source. The tests appear to be written for a different version of the token module.

2. **Config command uses `console.log`**: The `config` command `--get` action uses `console.log(value)` (line 29 of config.ts uses `process.stdout.write`) while tests mock `console.log`. This mismatch means the config get test (`consoleSpy`) will never capture output since the source uses `process.stdout.write`.

3. **Session-only config**: The `config --set` command only sets `process.env` variables which are lost when the process exits. The command warns about this but provides no persistent storage mechanism.

4. **Deployment size check is incomplete**: The size check in `deploy.ts` only calculates sizes for files (not recursively for directories added via `archive.directory()`), so directory contents could push the archive past the 100MB limit without triggering the size guard.

5. **Retry logic uses wrong delay calculation**: In `api.ts` line 72, the delay formula `RETRY_DELAY_BASE * (MAX_RETRIES - retryCount)` decreases delay with each retry (3s, 2s, 1s) instead of increasing (exponential backoff). This is the opposite of standard retry strategies.

6. **OAuth state parameter weakness**: The OAuth2 state parameter is generated with `Math.random().toString(36).substring(7)` which produces low-entropy strings (~4-6 chars). For CSRF protection, a cryptographically random string (e.g., `crypto.randomUUID()`) would be more appropriate.

7. **Database option partial deprecation**: The deploy command accepts `neon` and `supabase` as `--database` values but only `scalixdb` actually provisions a database. The other values just print a warning, which may confuse users.
