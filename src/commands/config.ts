/**
 * Config Command
 * Manages CLI configuration
 */

import chalk from 'chalk';
import { getToken } from '../utils/token';
import { DEFAULT_API_URL } from '../utils/constants';

export async function configCommand(options: { set?: string; get?: string; list?: boolean }) {
  if (options.list) {
    process.stdout.write(chalk.bold('\nCLI Configuration:\n\n'));
    process.stdout.write(`  API URL: ${process.env.SCALIX_API_URL || DEFAULT_API_URL}\n`);
    const token = await getToken();
    process.stdout.write(`  Authenticated: ${token ? chalk.green('Yes') : chalk.red('No')}\n`);
    if (token) {
      process.stdout.write(`  Token: ${chalk.gray('***' + token.slice(-4))}\n`);
    }
    return;
  }

  if (options.get) {
    // Support both SCALIX_ prefix and direct key names
    const key = options.get.toUpperCase();
    const value = process.env[`SCALIX_${key}`] || process.env[key] ||
      (key === 'API_URL' ? (process.env.SCALIX_API_URL || DEFAULT_API_URL) : null);

    if (value) {
      process.stdout.write(`${value}\n`);
    } else {
      process.stderr.write(chalk.red(`Configuration key not found: ${options.get}\n`));
      process.stderr.write(chalk.gray('Available keys: API_URL\n'));
      process.exit(1);
    }
    return;
  }

  if (options.set) {
    const [key, ...valueParts] = options.set.split('=');
    const value = valueParts.join('=');

    if (!key || !value) {
      process.stderr.write(chalk.red('Invalid format. Use: --set KEY=VALUE\n'));
      process.exit(1);
    }

    // Normalize key (support both API_URL and SCALIX_API_URL)
    const normalizedKey = key.toUpperCase();
    const envKey = normalizedKey === 'API_URL' ? 'SCALIX_API_URL' : `SCALIX_${normalizedKey}`;

    // Validate key
    if (normalizedKey !== 'API_URL') {
      process.stderr.write(chalk.red(`Unknown configuration key: ${key}\n`));
      process.stderr.write(chalk.gray('Available keys: API_URL\n'));
      process.exit(1);
    }

    // Validate API URL format
    try {
      new URL(value);
    } catch {
      process.stderr.write(chalk.red(`Invalid URL format: ${value}\n`));
      process.exit(1);
    }

    // Set environment variable
    process.env[envKey] = value;
    process.stdout.write(chalk.green(`✓ Set ${key} = ${value}\n`));
    process.stdout.write(chalk.yellow('\nNote: This setting is temporary. To make it permanent, set it in your shell profile.\n'));
    return;
  }

  process.stdout.write(chalk.red('Please specify an action: --list, --get <key>, or --set <key=value>\n'));
  process.exit(1);
}

