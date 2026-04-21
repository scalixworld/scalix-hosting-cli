/**
 * Login Command
 * Handles CLI authentication via API key or manual token
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { saveToken } from '../utils/token';
import { apiClient } from '../utils/api';

export async function loginCommand(options: { token?: string }) {
  const spinner = ora('Authenticating...').start();

  try {
    if (options.token) {
      spinner.text = 'Verifying token...';
      const valid = await verifyToken(options.token);
      if (!valid) {
        spinner.fail('Invalid token');
        process.stderr.write(chalk.red('\nThe provided token is invalid or expired\n'));
        process.exit(1);
      }
      await saveToken(options.token);
      spinner.succeed('Authenticated successfully');
      return;
    }

    spinner.stop();

    process.stdout.write(chalk.blue('\nScalix CLI Authentication\n\n'));
    process.stdout.write(chalk.gray('You can find your API key at: https://scalix.world/settings/api-keys\n\n'));

    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your Scalix API key:',
        mask: '*',
        validate: (input) => {
          if (!input || input.length < 10) {
            return 'Please enter a valid API key';
          }
          return true;
        }
      }
    ]);

    spinner.start('Verifying API key...');

    const valid = await verifyToken(apiKey);
    if (!valid) {
      spinner.fail('Invalid API key');
      process.stderr.write(chalk.red('\nThe provided API key is invalid or expired\n'));
      process.exit(1);
    }

    await saveToken(apiKey);
    spinner.succeed('Authenticated successfully!');
    process.stdout.write(chalk.green('\n✓ You are now logged in to Scalix Hosting\n'));
  } catch (error) {
    const err = error as any;
    spinner.fail('Authentication failed');
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    process.exit(1);
  }
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await apiClient.get('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.status === 200 && response.data?.user;
  } catch {
    return false;
  }
}
