import chalk from 'chalk';
import ora from 'ora';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { validateDeploymentId } from '../utils/validation';

export async function statusCommand(deploymentId: string, options: { json?: boolean }) {
  const isJson = options?.json;
  const spinner = isJson ? ora({ isSilent: true }) : ora('Checking deployment status...').start();

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

    const response = await apiClient.get(`/api/hosting/deployments/${deploymentId}`);

    if (response.data.deployment) {
      const deployment = response.data.deployment;

      if (isJson) {
        process.stdout.write(JSON.stringify(deployment, null, 2) + '\n');
        return;
      }

      const statusColor =
        deployment.status === 'ready' ? chalk.green :
          deployment.status === 'error' ? chalk.red :
            chalk.yellow;

      const statusIcon =
        deployment.status === 'ready' ? chalk.green('●') :
          deployment.status === 'error' ? chalk.red('●') :
            chalk.yellow('●');

      spinner.succeed('Deployment status retrieved');

      process.stdout.write('\n');
      process.stdout.write(`  ${statusIcon} ${statusColor(deployment.status)}  ${chalk.bold(deployment.appName)}\n`);
      process.stdout.write('\n');

      const pairs: [string, string][] = [
        ['ID', chalk.gray(deployment.id)],
      ];

      if (deployment.cloudRunUrl) {
        pairs.push(['URL', chalk.blue(deployment.cloudRunUrl)]);
      }

      pairs.push(['Created', chalk.gray(new Date(deployment.createdAt).toLocaleString())]);
      pairs.push(['Updated', chalk.gray(new Date(deployment.updatedAt).toLocaleString())]);

      if (deployment.gitBranch || deployment.gitCommit) {
        pairs.push(['Branch', deployment.gitBranch || '-']);
        pairs.push(['Commit', deployment.gitCommit || '-']);
      }

      const maxKey = pairs.reduce((max, [k]) => Math.max(max, k.length), 0);
      for (const [key, value] of pairs) {
        process.stdout.write(`  ${chalk.bold(key.padEnd(maxKey))}  ${value}\n`);
      }

      if (deployment.errorMessage) {
        process.stdout.write(`\n  ${chalk.red('Error:')} ${deployment.errorMessage}\n`);
      }

      process.stdout.write('\n');
    } else {
      spinner.fail('Deployment not found');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }
  } catch (error) {
    const err = error as any;
    spinner.fail('Failed to check status');
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    if (err.response?.data?.error) {
      process.stderr.write(chalk.red(`Details: ${err.response.data.error}\n`));
    }
    process.exit(1);
  }
}
