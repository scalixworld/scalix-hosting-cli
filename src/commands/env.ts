/**
 * Environment Command
 * Manages environment variables for deployments
 */

import chalk from 'chalk';
import ora from 'ora';
import { Command } from 'commander';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { validateDeploymentId, validateEnvVarName, validateEnvVarValue } from '../utils/validation';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireAuth(spinner: ReturnType<typeof ora>): Promise<string> {
  const token = await getToken();
  if (!token) {
    spinner.fail('Not authenticated');
    process.stderr.write(chalk.red('\nPlease run "scalix login" first\n'));
    process.exit(1);
  }
  return token;
}

function handleError(spinner: ReturnType<typeof ora>, error: unknown, action: string): never {
  const err = error as any;
  spinner.fail(`Failed to ${action}`);
  process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
  const detail = err.response?.data?.error;
  if (detail) {
    const msg = typeof detail === 'string' ? detail : (detail.message || JSON.stringify(detail));
    process.stderr.write(chalk.red(`Details: ${msg}\n`));
  }
  process.exit(1);
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, (row[i] || '').length), 0);
    return Math.max(h.length, maxRow);
  });

  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  const separator = widths.map(w => '-'.repeat(w)).join('  ');

  process.stdout.write(`\n${chalk.bold(headerLine)}\n${chalk.gray(separator)}\n`);

  for (const row of rows) {
    const line = row.map((cell, i) => (cell || '').padEnd(widths[i])).join('  ');
    process.stdout.write(`${line}\n`);
  }
  process.stdout.write('\n');
}

// ── Subcommand handlers ─────────────────────────────────────────────────────

async function envList(deploymentId: string): Promise<void> {
  const spinner = ora('Fetching environment variables...').start();
  try {
    await requireAuth(spinner);

    const validation = validateDeploymentId(deploymentId);
    if (!validation.valid) {
      spinner.fail('Invalid deployment ID');
      process.stderr.write(chalk.red(`\n${validation.error}\n`));
      process.exit(1);
    }

    const response = await apiClient.get('/api/hosting/environment', {
      params: { deploymentId }
    });

    if (!response.data.success) {
      spinner.fail('Failed to fetch environment variables');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const vars = response.data.environmentVariables || [];
    spinner.succeed(`Found ${vars.length} environment variable(s)`);

    if (vars.length === 0) {
      process.stdout.write(chalk.gray('\nNo environment variables set. Add one with: scalix env set <deploymentId> <KEY> <value>\n\n'));
      return;
    }

    const rows = vars.map((v: any) => {
      // Mask the value for display (show first 4 chars, mask the rest)
      const maskedValue = v.value && v.value.length > 4
        ? v.value.substring(0, 4) + '*'.repeat(Math.min(v.value.length - 4, 20))
        : v.value || '';
      return [
        v.id,
        v.key,
        maskedValue,
        v.createdAt ? formatDate(v.createdAt) : '-',
      ];
    });

    printTable(['ID', 'Key', 'Value', 'Created'], rows);
    process.stdout.write(chalk.gray('  Values are partially masked for security.\n\n'));
  } catch (error) {
    handleError(spinner, error, 'fetch environment variables');
  }
}

async function envSet(deploymentId: string, key: string, value: string): Promise<void> {
  const spinner = ora(`Setting environment variable "${key}"...`).start();
  try {
    await requireAuth(spinner);

    const depValidation = validateDeploymentId(deploymentId);
    if (!depValidation.valid) {
      spinner.fail('Invalid deployment ID');
      process.stderr.write(chalk.red(`\n${depValidation.error}\n`));
      process.exit(1);
    }

    const keyValidation = validateEnvVarName(key);
    if (!keyValidation.valid) {
      spinner.fail('Invalid environment variable name');
      process.stderr.write(chalk.red(`\n${keyValidation.error}\n`));
      process.exit(1);
    }

    const valueValidation = validateEnvVarValue(value);
    if (!valueValidation.valid) {
      spinner.fail('Invalid environment variable value');
      process.stderr.write(chalk.red(`\n${valueValidation.error}\n`));
      process.exit(1);
    }

    const response = await apiClient.post('/api/hosting/environment', {
      deploymentId,
      key,
      value
    });

    if (!response.data.success) {
      spinner.fail('Failed to set environment variable');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const envVar = response.data.environmentVariable;
    spinner.succeed(`Environment variable "${key}" set`);

    process.stdout.write(chalk.gray('\n  Changes will take effect on next deployment.\n\n'));

    if (envVar) {
      process.stdout.write(`  ${chalk.bold('ID')}    ${envVar.id}\n`);
      process.stdout.write(`  ${chalk.bold('Key')}   ${envVar.key}\n\n`);
    }
  } catch (error) {
    handleError(spinner, error, 'set environment variable');
  }
}

async function envDelete(deploymentId: string, key: string): Promise<void> {
  const spinner = ora(`Deleting environment variable "${key}"...`).start();
  try {
    await requireAuth(spinner);

    const depValidation = validateDeploymentId(deploymentId);
    if (!depValidation.valid) {
      spinner.fail('Invalid deployment ID');
      process.stderr.write(chalk.red(`\n${depValidation.error}\n`));
      process.exit(1);
    }

    // First, find the env var ID by listing and matching
    const listResponse = await apiClient.get('/api/hosting/environment', {
      params: { deploymentId }
    });

    if (!listResponse.data.success) {
      spinner.fail('Failed to fetch environment variables');
      process.stderr.write(chalk.red(`\n${listResponse.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const vars = listResponse.data.environmentVariables || [];
    const target = vars.find((v: any) => v.key === key);
    if (!target) {
      spinner.fail('Environment variable not found');
      process.stderr.write(chalk.red(`\nEnvironment variable "${key}" is not set for this deployment\n`));
      process.exit(1);
    }

    const response = await apiClient.delete(`/api/hosting/environment/${target.id}`);

    if (!response.data.success) {
      spinner.fail('Failed to delete environment variable');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed(`Environment variable "${key}" deleted`);
    process.stdout.write(chalk.gray('\n  Changes will take effect on next deployment.\n\n'));
  } catch (error) {
    handleError(spinner, error, 'delete environment variable');
  }
}

// ── Command registration ────────────────────────────────────────────────────

export function registerEnvCommand(program: Command): void {
  const envCmd = program
    .command('env')
    .description('Manage environment variables for deployments');

  // env list
  envCmd.command('list')
    .alias('ls')
    .description('List environment variables for a deployment')
    .argument('<deploymentId>', 'Deployment ID')
    .action(envList);

  // env set
  envCmd.command('set')
    .description('Set an environment variable')
    .argument('<deploymentId>', 'Deployment ID')
    .argument('<key>', 'Variable name (e.g. DATABASE_URL)')
    .argument('<value>', 'Variable value')
    .action(envSet);

  // env delete
  envCmd.command('delete')
    .alias('rm')
    .description('Delete an environment variable')
    .argument('<deploymentId>', 'Deployment ID')
    .argument('<key>', 'Variable name to delete')
    .action(envDelete);
}
