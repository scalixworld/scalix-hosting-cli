/**
 * List Command
 * Lists all deployments
 */

import chalk from 'chalk';
import ora from 'ora';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';

export async function listCommand(options: { status?: string }) {
  const spinner = ora('Fetching deployments...').start();

  try {
    const token = await getToken();
    if (!token) {
      spinner.fail('Not authenticated');
      process.stderr.write(chalk.red('\nPlease run "scalix login" first\n'));
      process.exit(1);
    }

    const response = await apiClient.get('/api/hosting/deployments', {
      params: options.status ? { status: options.status } : {}
    });

    if (response.data.deployments) {
      spinner.succeed(`Found ${response.data.deployments.length} deployment(s)`);

      if (response.data.deployments.length === 0) {
        process.stdout.write(chalk.gray('\nNo deployments found\n'));
        return;
      }

      process.stdout.write('\n');
      for (const deployment of response.data.deployments) {
        const statusColor =
          deployment.status === 'ready' ? chalk.green :
            deployment.status === 'error' ? chalk.red :
              chalk.yellow;

        process.stdout.write(`${chalk.bold(deployment.appName)}\n`);
        process.stdout.write(`  Status: ${statusColor(deployment.status)}\n`);
        if (deployment.cloudRunUrl) {
          process.stdout.write(`  URL: ${chalk.blue(deployment.cloudRunUrl)}\n`);
        }
        process.stdout.write(`  ID: ${chalk.gray(deployment.id)}\n`);
        process.stdout.write(`  Created: ${chalk.gray(new Date(deployment.createdAt).toLocaleString())}\n`);
        process.stdout.write('\n');
      }
    } else {
      spinner.fail('Failed to fetch deployments');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }
  } catch (error) {
    const err = error as any;
    spinner.fail('Failed to fetch deployments');
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    if (err.response?.data?.error) {
      process.stderr.write(chalk.red(`Details: ${err.response.data.error}\n`));
    }
    process.exit(1);
  }
}

