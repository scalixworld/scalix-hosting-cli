import chalk from 'chalk';
import ora from 'ora';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { validateDeploymentId } from '../utils/validation';

export async function inspectCommand(deploymentId: string, options: { json?: boolean }) {
  const isJson = options?.json;
  const spinner = isJson ? ora({ isSilent: true }) : ora('Inspecting deployment...').start();

  try {
    const validation = validateDeploymentId(deploymentId);
    if (!validation.valid) {
      spinner.fail('Invalid deployment ID');
      process.stderr.write(chalk.red(`\n${validation.error}\n`));
      process.exit(1);
    }

    const token = await getToken();
    if (!token) {
      spinner.fail('Not authenticated');
      process.stderr.write(chalk.red('\nPlease run "scalix-hosting login" first\n'));
      process.exit(1);
    }

    // Fetch deployment details and health in parallel
    const [statusRes, healthRes] = await Promise.allSettled([
      apiClient.get(`/api/hosting/deployments/${deploymentId}`),
      apiClient.get(`/api/hosting/deployments/${deploymentId}/health`),
    ]);

    const deployment = statusRes.status === 'fulfilled' ? statusRes.value.data.deployment : null;
    const health = healthRes.status === 'fulfilled' ? healthRes.value.data.health : null;

    if (!deployment) {
      spinner.fail('Deployment not found');
      process.exit(1);
    }

    if (isJson) {
      process.stdout.write(JSON.stringify({ deployment, health }, null, 2) + '\n');
      return;
    }

    const statusIcon =
      deployment.status === 'ready' ? chalk.green('●') :
        deployment.status === 'error' ? chalk.red('●') :
          chalk.yellow('●');

    const statusColor =
      deployment.status === 'ready' ? chalk.green :
        deployment.status === 'error' ? chalk.red :
          chalk.yellow;

    spinner.stop();

    process.stdout.write('\n');
    process.stdout.write(`  ${statusIcon} ${chalk.bold(deployment.appName)}  ${statusColor(deployment.status)}\n`);
    process.stdout.write('\n');

    // General
    process.stdout.write(chalk.bold('  General\n'));
    process.stdout.write(`    ID        ${chalk.gray(deployment.id)}\n`);
    if (deployment.cloudRunUrl) {
      process.stdout.write(`    URL       ${chalk.blue(deployment.cloudRunUrl)}\n`);
    }
    process.stdout.write(`    Created   ${new Date(deployment.createdAt).toLocaleString()}\n`);
    process.stdout.write(`    Updated   ${new Date(deployment.updatedAt).toLocaleString()}\n`);
    process.stdout.write('\n');

    // Git
    if (deployment.gitBranch || deployment.gitCommit) {
      process.stdout.write(chalk.bold('  Git\n'));
      if (deployment.gitBranch) process.stdout.write(`    Branch    ${deployment.gitBranch}\n`);
      if (deployment.gitCommit) process.stdout.write(`    Commit    ${deployment.gitCommit}\n`);
      if (deployment.gitMessage) process.stdout.write(`    Message   ${deployment.gitMessage}\n`);
      process.stdout.write('\n');
    }

    // Health
    if (health) {
      const score = health.healthScore || 0;
      const scoreStr = score >= 90 ? chalk.green(`${score}/100`) :
        score >= 70 ? chalk.yellow(`${score}/100`) :
          chalk.red(`${score}/100`);

      process.stdout.write(chalk.bold('  Health\n'));
      process.stdout.write(`    Score     ${scoreStr}\n`);

      if (health.responseTime) {
        process.stdout.write(`    Latency   avg ${health.responseTime.average || '-'}ms, p95 ${health.responseTime.p95 || '-'}ms\n`);
      }
      if (health.uptime) {
        const uptimeStr = health.uptime.percentage != null
          ? (health.uptime.percentage >= 99.9 ? chalk.green(health.uptime.percentage + '%') : chalk.yellow(health.uptime.percentage + '%'))
          : 'N/A';
        process.stdout.write(`    Uptime    ${uptimeStr}\n`);
      }
      if (health.errorRate) {
        const errStr = health.errorRate.percentage === 0
          ? chalk.green('0%')
          : chalk.red(health.errorRate.percentage + '%');
        process.stdout.write(`    Errors    ${errStr}\n`);
      }
      if (health.resources) {
        if (health.resources.instances) {
          process.stdout.write(`    Instances ${health.resources.instances.current || 0}/${health.resources.instances.max || '-'}\n`);
        }
      }
      process.stdout.write('\n');

      if (health.recommendations && health.recommendations.length > 0) {
        process.stdout.write(chalk.bold.yellow('  Recommendations\n'));
        for (const rec of health.recommendations) {
          process.stdout.write(`    ${chalk.yellow('!')} ${rec}\n`);
        }
        process.stdout.write('\n');
      }
    }

    if (deployment.errorMessage) {
      process.stdout.write(`  ${chalk.red('Error:')} ${deployment.errorMessage}\n\n`);
    }
  } catch (error) {
    const err = error as any;
    spinner.fail('Failed to inspect deployment');
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    if (err.response?.data?.error) {
      process.stderr.write(chalk.red(`Details: ${err.response.data.error}\n`));
    }
    process.exit(1);
  }
}
