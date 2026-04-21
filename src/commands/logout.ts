/**
 * Logout Command
 * Clears stored authentication token
 */

import chalk from 'chalk';
import ora from 'ora';
import { clearToken, getToken } from '../utils/token';

export async function logoutCommand() {
  const spinner = ora('Logging out...').start();

  try {
    const token = await getToken();

    if (!token) {
      spinner.info('Not logged in');
      process.stdout.write(chalk.gray('\nNo authentication token found\n'));
      return;
    }

    await clearToken();

    spinner.succeed('Logged out successfully');
    process.stdout.write(chalk.green('\n✓ You have been logged out\n'));
  } catch (error) {
    const err = error as Error;
    spinner.fail('Logout failed');
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    process.exit(1);
  }
}

