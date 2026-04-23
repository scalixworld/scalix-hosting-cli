# Scalix Hosting CLI

Command-line interface for Scalix Hosting - Deploy and manage static site applications from the terminal.

## Installation

```bash
npm install -g @scalix-world/cli
```

Or using yarn:

```bash
yarn global add @scalix-world/cli
```

## Authentication

### Browser Login (default)

The easiest way to authenticate is through your browser:

```bash
scalix login
```

This opens your default browser to the Scalix login page. After you sign in, the CLI receives a token automatically through a local callback server and stores it at `~/.scalix/token` (with `0600` permissions). No copy-pasting required.

You can also explicitly request browser login:

```bash
scalix login --browser
```

### API Key Login

If you prefer to enter an API key manually (useful for CI/CD or headless environments):

```bash
scalix login --api-key
```

You will be prompted to enter your Scalix API key, which you can generate at https://scalix.world/settings/api-keys.

### Direct Token

You can also pass a token directly:

```bash
scalix login --token <your-api-key>
```

### Logout

To log out (removes the stored token):

```bash
scalix logout
```

## Usage

### Deploy an Application

```bash
# Deploy current directory
scalix deploy

# Deploy specific directory
scalix deploy --dir ./my-app

# Deploy with app name
scalix deploy --name my-awesome-app

# Deploy with environment variables
scalix deploy --env .env
scalix deploy --env-var NODE_ENV=production --env-var API_KEY=secret
```

The deploy command packages the directory into a ZIP (excluding `node_modules` and hidden files other than `.env`), uploads it to the Scalix Hosting API, and polls for deployment completion.

### List Deployments

```bash
# List all deployments
scalix list

# Filter by status
scalix list --status ready
```

### View Logs

```bash
# View logs for a deployment
scalix logs <deployment-id>

# Follow logs
scalix logs <deployment-id> --follow

# Show last 50 lines
scalix logs <deployment-id> --tail 50
```

### Check Status

```bash
scalix status <deployment-id>
```

### Update Deployment

```bash
# Update an existing deployment
scalix update <deployment-id>

# Update with new environment variables
scalix update <deployment-id> --env .env.production
```

### Rollback Deployment

```bash
# Rollback to previous version (interactive)
scalix rollback <deployment-id>

# Rollback to specific version
scalix rollback <deployment-id> --version v1.2.3

# Rollback without confirmation
scalix rollback <deployment-id> --force
```

### Configuration

```bash
# List configuration
scalix config --list

# Get configuration value
scalix config --get API_URL

# Set configuration value
scalix config --set API_URL=https://api.scalix.world
```

### ScalixDB Database Management

Manage ScalixDB databases directly from the CLI.

#### Databases

```bash
# List all databases
scalix db list

# Create a new database
scalix db create --name my-db
scalix db create --name my-db --plan pro --region us-east-1

# Show database details
scalix db info <database-id>

# Delete a database (with confirmation)
scalix db delete <database-id>
scalix db delete <database-id> --force
```

#### Querying & Tables

```bash
# Execute a SQL query
scalix db query <database-id> --sql "SELECT * FROM users LIMIT 10"

# List tables
scalix db tables <database-id>
```

#### Monitoring

```bash
# Show database metrics (CPU, memory, connections, storage)
scalix db metrics <database-id>

# Show connection string
scalix db connection <database-id>

# Show database logs
scalix db logs <database-id>

# Show connection pooling status
scalix db pooling <database-id>

# List installed extensions
scalix db extensions <database-id>
```

#### Backups

```bash
# List backups
scalix db backup list <database-id>

# Create a backup
scalix db backup create <database-id>
scalix db backup create <database-id> --name "pre-migration"

# Restore from a backup
scalix db backup restore <database-id> <backup-id>
```

#### Branches

```bash
# List database branches
scalix db branches <database-id>

# Create a branch
scalix db branch create <database-id> --name staging
```

## API Endpoints

All requests go to `https://api.scalix.world` (override with `SCALIX_API_URL` env var).

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/me` | Current user info |
| POST | `/api/auth/exchange-auth-code` | Exchange auth code for token |
| GET | `/api/cli/auth/verify` | Verify CLI token |
| GET | `/api/cli/auth/callback?state={state}` | OAuth callback polling |

### Hosting

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/hosting/deploy` | Deploy application |
| GET | `/api/hosting/deployments` | List deployments |
| GET | `/api/hosting/deployments/{id}` | Get deployment status |
| PUT | `/api/hosting/deployments/{id}` | Update deployment |
| DELETE | `/api/hosting/deployments/{id}` | Delete deployment |
| POST | `/api/hosting/deployments/{id}/rollback` | Rollback deployment |
| GET | `/api/hosting/deployments/{id}/health` | Deployment health check |
| GET | `/api/hosting/logs` | Deployment logs |
| GET/POST/DELETE | `/api/hosting/domains` | Domain management |
| GET/POST/DELETE | `/api/hosting/environment` | Environment variables |

### ScalixDB

| Method | Endpoint | Description |
|--------|----------|-------------|
| * | `/api/scalixdb/databases/*` | Database management |

## Environment Variables

- `SCALIX_API_URL`: Override the API base URL (default: `https://api.scalix.world`)
- `SCALIX_TOKEN`: Can also be set as an environment variable instead of using `scalix login`

## Limitations

- The `delete` command is not yet functional (the Cloud API endpoint does not exist yet).
- Deployment size is limited to 100 MB.

## Support

For issues and questions, visit: https://scalix.world/support
