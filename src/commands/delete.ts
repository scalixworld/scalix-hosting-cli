import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { validateDeploymentId } from '../utils/validation';

export async function deleteCommand(
  deploymentId: string,
  options: { force?: boolean; yes?: boolean; json?: boolean }
) {
  const isJson = options.json;
  const skipConfirm = options.force || options.yes;
  const spinner = isJson ? ora({ isSilent: true }) : ora('Deleting deployment...').start();

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

    if (!skipConfirm && deployment) {
      spinner.stop();
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Delete deployment "${deployment.appName}" (${deploymentId})?`,
          default: false
        }
      ]);

      if (!confirm) {
        process.stdout.write(chalk.gray('\nDeletion cancelled\n'));
        return;
      }
      spinner.start('Deleting deployment...');
    }

    const response = await apiClient.delete(`/api/hosting/deployments/${deploymentId}`);

    if (response.data.success) {
      if (isJson) {
        process.stdout.write(JSON.stringify({ deleted: true, id: deploymentId }) + '\n');
      } else {
        spinner.succeed('Deployment deleted');
      }
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
