import chalk from 'chalk';
import ora from 'ora';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { validateDeploymentId } from '../utils/validation';

interface UpdateOptions {
  action?: string;
  json?: boolean;
}

export async function updateCommand(
  deploymentId: string,
  options: UpdateOptions
) {
  const isJson = options.json;
  const action = options.action || 'restart';
  const spinner = isJson ? ora({ isSilent: true }) : ora(`${capitalize(action)}ing deployment...`).start();

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

    const response = await apiClient.put(
      `/api/hosting/deployments/${deploymentId}`,
      { action },
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (response.data.success) {
      if (isJson) {
        process.stdout.write(JSON.stringify({ success: true, id: deploymentId, action }, null, 2) + '\n');
      } else {
        spinner.succeed(`Deployment ${action === 'restart' ? 'restarted' : action === 'stop' ? 'stopped' : 'started'}`);
      }
    } else {
      spinner.fail(`Failed to ${action} deployment`);
      process.stderr.write(chalk.red(`\nError: ${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }
  } catch (error) {
    const err = error as any;
    spinner.fail(`Failed to ${action} deployment`);
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    if (err.response?.data?.error) {
      process.stderr.write(chalk.red(`Details: ${err.response.data.error}\n`));
    }
    process.exit(1);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
