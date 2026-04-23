/**
 * Domain Command
 * Manages custom domains for deployments
 */

import chalk from 'chalk';
import ora from 'ora';
import { Command } from 'commander';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { validateDeploymentId } from '../utils/validation';

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

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (['verified', 'active', 'provisioned'].includes(s)) return chalk.green(status);
  if (['error', 'failed', 'expired'].includes(s)) return chalk.red(status);
  return chalk.yellow(status);
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

function printKeyValue(pairs: [string, string][]): void {
  const maxKey = pairs.reduce((max, [k]) => Math.max(max, k.length), 0);
  process.stdout.write('\n');
  for (const [key, value] of pairs) {
    process.stdout.write(`  ${chalk.bold(key.padEnd(maxKey))}  ${value}\n`);
  }
  process.stdout.write('\n');
}

// ── Subcommand handlers ─────────────────────────────────────────────────────

async function domainList(deploymentId: string): Promise<void> {
  const spinner = ora('Fetching domains...').start();
  try {
    await requireAuth(spinner);

    const validation = validateDeploymentId(deploymentId);
    if (!validation.valid) {
      spinner.fail('Invalid deployment ID');
      process.stderr.write(chalk.red(`\n${validation.error}\n`));
      process.exit(1);
    }

    const response = await apiClient.get(`/api/hosting/domains`, {
      params: { deploymentId }
    });

    if (!response.data.success) {
      spinner.fail('Failed to fetch domains');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const domains = response.data.domains || [];
    spinner.succeed(`Found ${domains.length} domain(s)`);

    if (domains.length === 0) {
      process.stdout.write(chalk.gray('\nNo custom domains configured. Add one with: scalix domain add <deploymentId> <domain>\n\n'));
      return;
    }

    const rows = domains.map((d: any) => [
      d.id,
      d.domain,
      statusColor(d.status || 'unknown'),
      statusColor(d.sslStatus || 'unknown'),
      d.createdAt ? formatDate(d.createdAt) : '-',
    ]);

    printTable(['ID', 'Domain', 'Status', 'SSL', 'Created'], rows);
  } catch (error) {
    handleError(spinner, error, 'fetch domains');
  }
}

async function domainAdd(deploymentId: string, domain: string): Promise<void> {
  const spinner = ora(`Adding domain "${domain}"...`).start();
  try {
    await requireAuth(spinner);

    const validation = validateDeploymentId(deploymentId);
    if (!validation.valid) {
      spinner.fail('Invalid deployment ID');
      process.stderr.write(chalk.red(`\n${validation.error}\n`));
      process.exit(1);
    }

    if (!domain || !domain.includes('.')) {
      spinner.fail('Invalid domain');
      process.stderr.write(chalk.red('\nPlease provide a valid domain (e.g. example.com or app.example.com)\n'));
      process.exit(1);
    }

    const response = await apiClient.post('/api/hosting/domains', {
      deploymentId,
      domain
    });

    if (!response.data.success) {
      spinner.fail('Failed to add domain');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const d = response.data.domain;
    spinner.succeed(`Domain "${domain}" added`);

    printKeyValue([
      ['ID', d.id],
      ['Domain', d.domain],
      ['Status', statusColor(d.status || 'pending')],
      ['SSL Status', statusColor(d.sslStatus || 'pending')],
    ]);

    if (d.verificationCode) {
      process.stdout.write(chalk.cyan('  To verify ownership, add a DNS TXT record:\n'));
      process.stdout.write(chalk.cyan(`    Host:  _scalix-verify.${d.domain}\n`));
      process.stdout.write(chalk.cyan(`    Value: scalix-verify=${d.verificationCode}\n\n`));
      process.stdout.write(chalk.gray('  Then run: scalix domain verify ' + deploymentId + ' ' + domain + '\n\n'));
    }
  } catch (error) {
    handleError(spinner, error, 'add domain');
  }
}

async function domainDelete(deploymentId: string, domain: string): Promise<void> {
  const spinner = ora(`Deleting domain "${domain}"...`).start();
  try {
    await requireAuth(spinner);

    const validation = validateDeploymentId(deploymentId);
    if (!validation.valid) {
      spinner.fail('Invalid deployment ID');
      process.stderr.write(chalk.red(`\n${validation.error}\n`));
      process.exit(1);
    }

    // First, find the domain ID by listing domains and matching
    const listResponse = await apiClient.get('/api/hosting/domains', {
      params: { deploymentId }
    });

    if (!listResponse.data.success) {
      spinner.fail('Failed to fetch domains');
      process.stderr.write(chalk.red(`\n${listResponse.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const domains = listResponse.data.domains || [];
    const target = domains.find((d: any) => d.domain === domain.toLowerCase());
    if (!target) {
      spinner.fail('Domain not found');
      process.stderr.write(chalk.red(`\nDomain "${domain}" is not configured for this deployment\n`));
      process.exit(1);
    }

    const response = await apiClient.delete(`/api/hosting/domains/${target.id}`);

    if (!response.data.success) {
      spinner.fail('Failed to delete domain');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed(`Domain "${domain}" deleted`);
  } catch (error) {
    handleError(spinner, error, 'delete domain');
  }
}

async function domainVerify(deploymentId: string, domain: string): Promise<void> {
  const spinner = ora(`Verifying domain "${domain}"...`).start();
  try {
    await requireAuth(spinner);

    const validation = validateDeploymentId(deploymentId);
    if (!validation.valid) {
      spinner.fail('Invalid deployment ID');
      process.stderr.write(chalk.red(`\n${validation.error}\n`));
      process.exit(1);
    }

    // First, find the domain ID by listing domains and matching
    const listResponse = await apiClient.get('/api/hosting/domains', {
      params: { deploymentId }
    });

    if (!listResponse.data.success) {
      spinner.fail('Failed to fetch domains');
      process.stderr.write(chalk.red(`\n${listResponse.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const domains = listResponse.data.domains || [];
    const target = domains.find((d: any) => d.domain === domain.toLowerCase());
    if (!target) {
      spinner.fail('Domain not found');
      process.stderr.write(chalk.red(`\nDomain "${domain}" is not configured for this deployment. Add it first with: scalix domain add ${deploymentId} ${domain}\n`));
      process.exit(1);
    }

    const response = await apiClient.post(`/api/hosting/domains/${target.id}/verify`, {
      deploymentId,
      domain
    });

    if (!response.data.success) {
      spinner.fail('Domain verification failed');
      const instructions = response.data.instructions;
      if (instructions) {
        process.stderr.write(chalk.yellow(`\n${instructions.message}\n`));
        process.stderr.write(chalk.gray(`\n  Record Type: ${instructions.recordType}\n`));
        process.stderr.write(chalk.gray(`  Hostname:    ${instructions.hostname}\n`));
        process.stderr.write(chalk.gray(`  Value:       ${instructions.value}\n\n`));
      } else {
        process.stderr.write(chalk.red(`\n${response.data.error || 'Verification failed'}\n`));
      }
      process.exit(1);
    }

    spinner.succeed(`Domain "${domain}" verified successfully`);

    if (response.data.domain) {
      const d = response.data.domain;
      printKeyValue([
        ['Domain', d.domain || domain],
        ['Status', statusColor(d.status || 'verified')],
        ['SSL Status', statusColor(d.sslStatus || 'provisioning')],
      ]);
    }
  } catch (error) {
    handleError(spinner, error, 'verify domain');
  }
}

// ── Command registration ────────────────────────────────────────────────────

export function registerDomainCommand(program: Command): void {
  const domainCmd = program
    .command('domain')
    .description('Manage custom domains for deployments');

  // domain list
  domainCmd.command('list')
    .alias('ls')
    .description('List custom domains for a deployment')
    .argument('<deploymentId>', 'Deployment ID')
    .action(domainList);

  // domain add
  domainCmd.command('add')
    .description('Add a custom domain to a deployment')
    .argument('<deploymentId>', 'Deployment ID')
    .argument('<domain>', 'Domain name (e.g. example.com)')
    .action(domainAdd);

  // domain delete
  domainCmd.command('delete')
    .alias('rm')
    .description('Remove a custom domain from a deployment')
    .argument('<deploymentId>', 'Deployment ID')
    .argument('<domain>', 'Domain name to remove')
    .action(domainDelete);

  // domain verify
  domainCmd.command('verify')
    .description('Verify DNS ownership of a custom domain')
    .argument('<deploymentId>', 'Deployment ID')
    .argument('<domain>', 'Domain name to verify')
    .action(domainVerify);
}
