/**
 * Delete Command
 * Deletes a deployment
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { validateDeploymentId } from '../utils/validation';

export async function deleteCommand(deploymentId: string, options: { force?: boolean }) {
  const spinner = ora('Deleting deployment...').start();

  try {
    // Validate deployment ID format
    const validation = validateDeploymentId(deploymentId);
    if (!validation.valid) {
      spinner.fail('Invalid deployment ID');
      console.error(chalk.red(`\n${validation.error}`));
      process.exit(1);
    }

    const token = await getToken();
    if (!token) {
      spinner.fail('Not authenticated');
      console.error(chalk.red('\nPlease run "scalix login" first'));
      process.exit(1);
    }

    // Get deployment info first
    let deployment: Record<string, any> | null = null;
    try {
      const statusResponse = await apiClient.get(`/api/hosting/deployments/${deploymentId}`);
      deployment = statusResponse.data.deployment;
    } catch (error) {
      const err = error as Error;
      spinner.fail('Deployment not found');
      process.stderr.write(chalk.red(`\nDeployment ${deploymentId} not found (${err.message})\n`));
      process.exit(1);
    }

    // Confirm deletion unless --force flag is used
    if (!options.force && deployment) {
      spinner.stop();
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete deployment "${deployment.appName}" (${deploymentId})?`,
          default: false
        }
      ]);

      if (!confirm) {
        process.stdout.write(chalk.gray('\nDeletion cancelled\n'));
        return;
      }
      spinner.start('Deleting deployment...');
    }

    // Delete deployment
    const response = await apiClient.delete(`/api/hosting/deployments/${deploymentId}`);

    if (response.data.success) {
      spinner.succeed('Deployment deleted successfully');
      process.stdout.write(chalk.green(`\n✓ Deployment ${deploymentId} has been deleted\n`));
    } else {
      spinner.fail('Deletion failed');
      process.stderr.write(chalk.red(`\nError: ${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }
  } catch (error) {
    const err = error as any;
    spinner.fail('Deletion failed');
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    if (err.response?.data?.error) {
      process.stderr.write(chalk.red(`Details: ${err.response.data.error}\n`));
    }
    process.exit(1);
  }
}


