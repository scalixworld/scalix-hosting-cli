#!/usr/bin/env node

/**
 * Scalix CLI
 * Command-line interface for Scalix Hosting
 */

import { Command } from 'commander';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { deployCommand } from './commands/deploy';
import { listCommand } from './commands/list';
import { logsCommand } from './commands/logs';
import { statusCommand } from './commands/status';
import { configCommand } from './commands/config';
import { deleteCommand } from './commands/delete';
import { updateCommand } from './commands/update';
import { rollbackCommand } from './commands/rollback';
import { registerDbCommand } from './commands/db';

// Get version from package.json
function getVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const pkgPath = path.join(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

const version = getVersion();

const program = new Command();

program
  .name('scalix')
  .description('Scalix Hosting CLI - Deploy and manage applications')
  .version(version);

// Authentication
program
  .command('login')
  .description('Authenticate with Scalix Hosting')
  .option('--token <token>', 'Use existing token')
  .option('--api-key', 'Log in by entering an API key manually')
  .option('--browser', 'Log in via browser OAuth2 flow (default)')
  .action(loginCommand);

program
  .command('logout')
  .description('Log out and clear stored authentication token')
  .action(logoutCommand);

// Deployment
program
  .command('deploy')
  .description('Deploy an application')
  .option('-d, --dir <directory>', 'Directory to deploy', '.')
  .option('-n, --name <name>', 'Application name')
  .option('--env <file>', 'Environment variables file (.env)')
  .option('--env-var <key=value>', 'Environment variable (can be used multiple times)', (val: string, prev: string[]) => {
    prev.push(val);
    return prev;
  }, [] as string[])
  .action(deployCommand);

// List deployments
program
  .command('list')
  .alias('ls')
  .description('List all deployments')
  .option('--status <status>', 'Filter by status')
  .action(listCommand);

// View logs
program
  .command('logs')
  .description('View deployment logs')
  .argument('<deployment-id>', 'Deployment ID')
  .option('-f, --follow', 'Follow log output')
  .option('--tail <lines>', 'Number of lines to show', '100')
  .action(logsCommand);

// Check status
program
  .command('status')
  .description('Check deployment status')
  .argument('<deployment-id>', 'Deployment ID')
  .action(statusCommand);

// Configuration
program
  .command('config')
  .description('Manage CLI configuration')
  .option('--set <key=value>', 'Set configuration value')
  .option('--get <key>', 'Get configuration value')
  .option('--list', 'List all configuration')
  .action(configCommand);

// Delete deployment
program
  .command('delete')
  .alias('rm')
  .description('Delete a deployment')
  .argument('<deployment-id>', 'Deployment ID')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(deleteCommand);

// Update deployment
program
  .command('update')
  .description('Update an existing deployment')
  .argument('<deployment-id>', 'Deployment ID')
  .option('-d, --dir <directory>', 'Directory to deploy', '.')
  .option('--env <file>', 'Environment variables file (.env)')
  .option('--env-var <key=value>', 'Environment variable (can be used multiple times)', (val: string, prev: string[]) => {
    prev.push(val);
    return prev;
  }, [] as string[])
  .action(updateCommand);

// Rollback deployment
program
  .command('rollback')
  .description('Rollback a deployment to a previous version')
  .argument('<deployment-id>', 'Deployment ID')
  .option('-v, --version <version>', 'Version to rollback to')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(rollbackCommand);

// Database management (ScalixDB)
registerDbCommand(program);

// Parse arguments
program.parse();
