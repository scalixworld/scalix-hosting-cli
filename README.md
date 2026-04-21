# Scalix CLI

Command-line interface for Scalix Hosting - Deploy and manage applications from the terminal.

## Installation

```bash
npm install -g @scalix/cli
```

Or using yarn:

```bash
yarn global add @scalix/cli
```

## Authentication

Before using the CLI, you need to authenticate:

```bash
scalix login
```

This will open your browser for OAuth2 authentication. The CLI will automatically retrieve your token after authentication. Your token will be stored securely.

To log out:

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

# Deploy with database
scalix deploy --database neon

# Deploy with environment variables
scalix deploy --env .env
scalix deploy --env-var NODE_ENV=production --env-var API_KEY=secret
```

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

### Delete Deployment

```bash
# Delete a deployment (with confirmation)
scalix delete <deployment-id>

# Delete without confirmation
scalix delete <deployment-id> --force
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
scalix config --set API_URL=https://api.scalix.com
```

## Security

- Tokens are stored securely using OS keychain
- All API requests use HTTPS
- Short-lived access tokens (24 hours)
- Automatic token refresh
- Token revocation support

## Environment Variables

- `SCALIX_API_URL`: API base URL (default: https://app.scalix.com)
- `SCALIX_TOKEN`: Authentication token (stored securely by default)

## Examples

```bash
# Deploy a Node.js app
scalix deploy --name my-api --database neon

# Deploy with environment variables
scalix deploy --env .env.production --env-var NODE_ENV=production

# Check deployment status
scalix status deploy-123456

# View logs
scalix logs deploy-123456 --follow
```

## Support

For issues and questions, visit: https://scalix.com/support

