/**
 * Rollback Command
 * Rolls back a deployment to a previous version
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { validateDeploymentId } from '../utils/validation';

export async function rollbackCommand(deploymentId: string, options: { version?: string; force?: boolean }) {
  const spinner = ora('Rolling back deployment...').start();

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
      process.stderr.write(chalk.red('\nPlease run "scalix login" first\n'));
      process.exit(1);
    }

    // Get deployment history
    spinner.text = 'Fetching deployment history...';
    let history: any[] = [];
    try {
      const historyResponse = await apiClient.get(`/api/hosting/deployments/${deploymentId}/history`);
      history = historyResponse.data.history || [];
    } catch (error: any) {
      spinner.fail('Failed to fetch deployment history');
      console.error(chalk.red(`\nError: ${error.response?.data?.error || error.message}`));
      process.exit(1);
    }

    if (history.length === 0) {
      spinner.fail('No deployment history found');
      process.stderr.write(chalk.red('\nCannot rollback: no previous deployments found\n'));
      process.exit(1);
    }

    // Select version to rollback to
    let targetVersion: string | null = null;

    if (options.version) {
      targetVersion = options.version;
      // Validate version exists
      const versionExists = history.some((h: any) => h.id === targetVersion || h.version === targetVersion);
      if (!versionExists) {
        spinner.fail('Version not found');
        process.stderr.write(chalk.red(`\nVersion ${targetVersion} not found in deployment history\n`));
        process.exit(1);
      }
    } else {
      // Show history and let user select
      spinner.stop();
      console.log(chalk.bold('\nDeployment History:\n'));

      const choices = history.map((h: any, index: number) => ({
        name: `${h.version || h.id} - ${new Date(h.createdAt).toLocaleString()} (${h.status})`,
        value: h.id || h.version,
        disabled: index === 0 ? false : undefined // Can't rollback to current
      }));

      const { selectedVersion } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedVersion',
          message: 'Select version to rollback to:',
          choices
        }
      ]);

      targetVersion = selectedVersion;
      spinner.start('Rolling back deployment...');
    }

    // Confirm rollback unless --force flag is used
    if (!options.force) {
      spinner.stop();
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to rollback to version ${targetVersion}?`,
          default: false
        }
      ]);

      if (!confirm) {
        process.stdout.write(chalk.gray('\nRollback cancelled\n'));
        return;
      }
      spinner.start('Rolling back deployment...');
    }

    // Perform rollback
    const response = await apiClient.post(`/api/hosting/deployments/${deploymentId}/rollback`, {
      version: targetVersion
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      spinner.succeed('Deployment rolled back successfully');
      process.stdout.write(chalk.green(`\n✓ Deployment ${deploymentId} has been rolled back to version ${targetVersion}\n`));
      if (response.data.deployment?.url) {
        process.stdout.write(chalk.blue(`✓ URL: ${response.data.deployment.url}\n`));
      }
    } else {
      spinner.fail('Rollback failed');
      process.stderr.write(chalk.red(`\nError: ${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }
  } catch (error) {
    const err = error as any;
    spinner.fail('Rollback failed');
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    if (err.response?.data?.error) {
      process.stderr.write(chalk.red(`Details: ${err.response.data.error}\n`));
    }
    process.exit(1);
  }
}


