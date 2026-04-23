/**
 * Status Command
 * Checks deployment status
 */

import chalk from 'chalk';
import ora from 'ora';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { validateDeploymentId } from '../utils/validation';

export async function statusCommand(deploymentId: string) {
  const spinner = ora('Checking deployment status...').start();

  try {
    // Validate deployment ID format
    const validation = validateDeploymentId(deploymentId);
    if (!validation.valid) {
      spinner.fail('Invalid deployment ID');
      process.stderr.write(chalk.red(`\n${validation.error}\n`));
      process.exit(1);
    }

    const token = await getToken();
    if (!token) {
      spinner.fail('Not authenticated');
      process.stderr.write(chalk.red('\nPlease run "scalix login" first\n'));
      process.exit(1);
    }

    const response = await apiClient.get(`/api/hosting/deployments/${deploymentId}`);

    if (response.data.deployment) {
      const deployment = response.data.deployment;

      const statusColor =
        deployment.status === 'ready' ? chalk.green :
          deployment.status === 'error' ? chalk.red :
            chalk.yellow;

      spinner.succeed('Deployment status retrieved');

      process.stdout.write('\n');
      process.stdout.write(`${chalk.bold('Deployment Status')}\n`);
      process.stdout.write(`  Name: ${chalk.bold(deployment.appName)}\n`);
      process.stdout.write(`  Status: ${statusColor(deployment.status)}\n`);
      process.stdout.write(`  ID: ${chalk.gray(deployment.id)}\n`);

      if (deployment.cloudRunUrl) {
        process.stdout.write(`  URL: ${chalk.blue(deployment.cloudRunUrl)}\n`);
      }

      process.stdout.write(`  Created: ${chalk.gray(new Date(deployment.createdAt).toLocaleString())}\n`);
      process.stdout.write(`  Updated: ${chalk.gray(new Date(deployment.updatedAt).toLocaleString())}\n`);

      if (deployment.errorMessage) {
        process.stdout.write(`  Error: ${chalk.red(deployment.errorMessage)}\n`);
      }
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

