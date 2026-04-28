#!/usr/bin/env node

import { Command } from 'commander';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { whoamiCommand } from './commands/whoami';
import { deployCommand } from './commands/deploy';
import { listCommand } from './commands/list';
import { logsCommand } from './commands/logs';
import { statusCommand } from './commands/status';
import { inspectCommand } from './commands/inspect';
import { configCommand } from './commands/config';
import { deleteCommand } from './commands/delete';
import { updateCommand } from './commands/update';
import { rollbackCommand } from './commands/rollback';
import { registerDbCommand } from './commands/db';
import { registerDomainCommand } from './commands/domain';
import { registerEnvCommand } from './commands/env';
import { registerHealthCommand } from './commands/health';

function getVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const pkgPath = path.join(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '1.1.0';
  } catch {
    return '1.1.0';
  }
}

const program = new Command();

program
  .name('scalix-hosting')
  .description('Scalix Hosting CLI — deploy and manage applications')
  .version(getVersion())
  .option('--json', 'Output results as JSON')
  .option('-y, --yes', 'Skip confirmation prompts');

// ── Authentication ─────────────────────────────────────────────────────────

program
  .command('login')
  .description('Authenticate with Scalix Hosting')
  .option('--token <token>', 'Use an existing token directly')
  .option('--api-key', 'Log in with an API key')
  .option('--browser', 'Log in via browser OAuth2 flow (default)')
  .action(loginCommand);

program
  .command('logout')
  .description('Clear stored authentication')
  .action(logoutCommand);

program
  .command('whoami')
  .description('Show the currently authenticated user')
  .action((_, cmd) => {
    const opts = cmd.optsWithGlobals();
    return whoamiCommand({ json: opts.json });
  });

// ── Deployments ────────────────────────────────────────────────────────────

program
  .command('deploy')
  .description('Deploy a GitHub repository to Scalix Hosting')
  .option('-d, --dir <directory>', 'Project directory (used to detect git remote)', '.')
  .option('-n, --name <name>', 'Application name')
  .option('-b, --branch <branch>', 'Git branch to deploy (default: current branch)')
  .option('--env <file>', 'Environment variables file (.env)')
  .option('--env-var <key=value>', 'Set an environment variable (repeatable)', (val: string, prev: string[]) => {
    prev.push(val);
    return prev;
  }, [] as string[])
  .action((opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    return deployCommand({ ...opts, json: globals.json, yes: globals.yes });
  });

program
  .command('list')
  .alias('ls')
  .description('List all deployments')
  .option('--status <status>', 'Filter by status (ready, queued, error)')
  .action((opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    return listCommand({ ...opts, json: globals.json });
  });

program
  .command('status')
  .description('Check deployment status')
  .argument('<deployment-id>', 'Deployment ID')
  .action((id, _, cmd) => {
    const globals = cmd.optsWithGlobals();
    return statusCommand(id, { json: globals.json });
  });

program
  .command('inspect')
  .description('Show detailed deployment info including health metrics')
  .argument('<deployment-id>', 'Deployment ID')
  .action((id, _, cmd) => {
    const globals = cmd.optsWithGlobals();
    return inspectCommand(id, { json: globals.json });
  });

program
  .command('logs')
  .description('View deployment logs')
  .argument('<deployment-id>', 'Deployment ID')
  .option('-f, --follow', 'Stream new log output')
  .option('--tail <lines>', 'Number of lines to show', '100')
  .option('--since <duration>', 'Show logs since duration (e.g. 1h, 30m)')
  .action((id, opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    return logsCommand(id, { ...opts, json: globals.json });
  });

program
  .command('delete')
  .alias('rm')
  .description('Delete a deployment')
  .argument('<deployment-id>', 'Deployment ID')
  .option('-f, --force', 'Skip confirmation prompt')
  .action((id, opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    return deleteCommand(id, { ...opts, yes: globals.yes, json: globals.json });
  });

program
  .command('restart')
  .description('Restart a deployment')
  .argument('<deployment-id>', 'Deployment ID')
  .action((id, _, cmd) => {
    const globals = cmd.optsWithGlobals();
    return updateCommand(id, { action: 'restart', json: globals.json });
  });

program
  .command('stop')
  .description('Stop a deployment (scale to zero)')
  .argument('<deployment-id>', 'Deployment ID')
  .action((id, _, cmd) => {
    const globals = cmd.optsWithGlobals();
    return updateCommand(id, { action: 'stop', json: globals.json });
  });

program
  .command('start')
  .description('Start a stopped deployment')
  .argument('<deployment-id>', 'Deployment ID')
  .action((id, _, cmd) => {
    const globals = cmd.optsWithGlobals();
    return updateCommand(id, { action: 'start', json: globals.json });
  });

program
  .command('rollback')
  .description('Rollback to a previous deployment version')
  .argument('<deployment-id>', 'Deployment ID')
  .option('-v, --version <version>', 'Version to rollback to')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(rollbackCommand);

// ── Configuration ──────────────────────────────────────────────────────────

program
  .command('config')
  .description('Manage CLI configuration')
  .option('--set <key=value>', 'Set a configuration value')
  .option('--get <key>', 'Get a configuration value')
  .option('--list', 'List all configuration')
  .action(configCommand);

// ── Subcommand groups ──────────────────────────────────────────────────────

registerDbCommand(program);
registerDomainCommand(program);
registerEnvCommand(program);
registerHealthCommand(program);

program.parse();
