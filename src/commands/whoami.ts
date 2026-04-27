import chalk from 'chalk';
import ora from 'ora';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';

export async function whoamiCommand(options: { json?: boolean }) {
  const spinner = ora('Fetching account info...').start();

  try {
    const token = await getToken();
    if (!token) {
      spinner.fail('Not authenticated');
      if (options.json) {
        process.stdout.write(JSON.stringify({ error: 'not_authenticated' }) + '\n');
      } else {
        process.stderr.write(chalk.red('\nPlease run "scalix-hosting login" first\n'));
      }
      process.exit(1);
    }

    const response = await apiClient.get('/api/auth/me');
    const user = response.data?.user;

    if (!user) {
      spinner.fail('Could not fetch account info');
      process.exit(1);
    }

    spinner.stop();

    if (options.json) {
      process.stdout.write(JSON.stringify(user, null, 2) + '\n');
      return;
    }

    process.stdout.write('\n');
    process.stdout.write(`  ${chalk.bold('Email')}  ${user.email}\n`);
    if (user.name) {
      process.stdout.write(`  ${chalk.bold('Name')}   ${user.name}\n`);
    }
    if (user.plan) {
      process.stdout.write(`  ${chalk.bold('Plan')}   ${user.plan}\n`);
    }
    if (user.id) {
      process.stdout.write(`  ${chalk.bold('ID')}     ${chalk.gray(user.id)}\n`);
    }
    process.stdout.write('\n');
  } catch (error) {
    const err = error as any;
    spinner.fail('Failed to fetch account info');
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    process.exit(1);
  }
}
