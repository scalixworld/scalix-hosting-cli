/**
 * Health Command
 * Checks deployment health status
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

function scoreColor(score: number): string {
  if (score >= 90) return chalk.green(String(score));
  if (score >= 70) return chalk.yellow(String(score));
  return chalk.red(String(score));
}

function printKeyValue(pairs: [string, string][]): void {
  const maxKey = pairs.reduce((max, [k]) => Math.max(max, k.length), 0);
  process.stdout.write('\n');
  for (const [key, value] of pairs) {
    process.stdout.write(`  ${chalk.bold(key.padEnd(maxKey))}  ${value}\n`);
  }
  process.stdout.write('\n');
}

// ── Command handler ─────────────────────────────────────────────────────────

async function healthCheck(deploymentId: string): Promise<void> {
  const spinner = ora('Checking deployment health...').start();
  try {
    await requireAuth(spinner);

    const validation = validateDeploymentId(deploymentId);
    if (!validation.valid) {
      spinner.fail('Invalid deployment ID');
      process.stderr.write(chalk.red(`\n${validation.error}\n`));
      process.exit(1);
    }

    const response = await apiClient.get(`/api/hosting/deployments/${deploymentId}/health`);

    if (!response.data.success) {
      spinner.fail('Failed to check health');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const health = response.data.health;
    const score = health.healthScore || 0;

    if (score >= 90) {
      spinner.succeed('Deployment is healthy');
    } else if (score >= 70) {
      spinner.warn('Deployment has warnings');
    } else {
      spinner.fail('Deployment is unhealthy');
    }

    // Health Score
    printKeyValue([
      ['Health Score', scoreColor(score) + '/100'],
    ]);

    // Response Time
    if (health.responseTime) {
      const rt = health.responseTime;
      process.stdout.write(`  ${chalk.bold('Response Time')}\n`);
      process.stdout.write(`    Average  ${rt.average != null ? rt.average + 'ms' : 'N/A'}\n`);
      process.stdout.write(`    p50      ${rt.p50 != null ? rt.p50 + 'ms' : 'N/A'}\n`);
      process.stdout.write(`    p95      ${rt.p95 != null ? rt.p95 + 'ms' : 'N/A'}\n\n`);
    }

    // Uptime
    if (health.uptime) {
      const uptime = health.uptime;
      const uptimeStr = uptime.percentage != null
        ? (uptime.percentage >= 99.9 ? chalk.green(uptime.percentage + '%') : chalk.yellow(uptime.percentage + '%'))
        : 'N/A';
      process.stdout.write(`  ${chalk.bold('Uptime')}\n`);
      process.stdout.write(`    Percentage     ${uptimeStr}\n`);
      process.stdout.write(`    Last Downtime  ${uptime.lastDowntime || 'None'}\n\n`);
    }

    // Error Rate
    if (health.errorRate) {
      const er = health.errorRate;
      const errorStr = er.percentage != null
        ? (er.percentage === 0 ? chalk.green('0%') : chalk.red(er.percentage + '%'))
        : 'N/A';
      process.stdout.write(`  ${chalk.bold('Error Rate')}\n`);
      process.stdout.write(`    Percentage      ${errorStr}\n`);
      process.stdout.write(`    Error Count     ${er.errorCount ?? 'N/A'}\n`);
      process.stdout.write(`    Total Requests  ${er.totalRequests ?? 'N/A'}\n\n`);
    }

    // Resources
    if (health.resources) {
      const r = health.resources;
      process.stdout.write(`  ${chalk.bold('Resources')}\n`);
      if (r.cpu) {
        const cpuPct = r.cpu.utilization != null ? (r.cpu.utilization * 100).toFixed(1) + '%' : 'N/A';
        process.stdout.write(`    CPU          ${cpuPct}\n`);
      }
      if (r.memory) {
        process.stdout.write(`    Memory       ${r.memory.used || 'N/A'} / ${r.memory.limit || 'N/A'}\n`);
      }
      if (r.instances) {
        process.stdout.write(`    Instances    ${r.instances.current ?? 0} / ${r.instances.max ?? 'N/A'}\n`);
      }
      process.stdout.write('\n');
    }

    // Cold Starts
    if (health.coldStarts && health.coldStarts.countLastHour > 0) {
      const cs = health.coldStarts;
      process.stdout.write(`  ${chalk.bold('Cold Starts (last hour)')}\n`);
      process.stdout.write(`    Count      ${cs.countLastHour}\n`);
      process.stdout.write(`    Avg Latency  ${cs.averageLatency}ms\n\n`);
    }

    // Recommendations
    if (health.recommendations && health.recommendations.length > 0) {
      process.stdout.write(`  ${chalk.bold.yellow('Recommendations')}\n`);
      for (const rec of health.recommendations) {
        process.stdout.write(`    ${chalk.yellow('-')} ${rec}\n`);
      }
      process.stdout.write('\n');
    }
  } catch (error) {
    handleError(spinner, error, 'check health');
  }
}

// ── Command registration ────────────────────────────────────────────────────

export function registerHealthCommand(program: Command): void {
  program
    .command('health')
    .description('Check deployment health status')
    .argument('<deploymentId>', 'Deployment ID')
    .action(healthCheck);
}
