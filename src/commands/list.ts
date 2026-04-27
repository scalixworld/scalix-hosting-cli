import chalk from 'chalk';
import ora from 'ora';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';

export async function listCommand(options: { status?: string; json?: boolean }) {
  const isJson = options.json;
  const spinner = isJson ? ora({ isSilent: true }) : ora('Fetching deployments...').start();

  try {
    const token = await getToken();
    if (!token) {
      spinner.fail('Not authenticated');
      if (isJson) {
        process.stdout.write(JSON.stringify({ error: 'not_authenticated' }) + '\n');
      } else {
        process.stderr.write(chalk.red('\nPlease run "scalix-hosting login" first\n'));
      }
      process.exit(1);
    }

    const response = await apiClient.get('/api/hosting/deployments', {
      params: options.status ? { status: options.status } : {}
    });

    if (response.data.deployments) {
      const deployments = response.data.deployments;
      spinner.succeed(`Found ${deployments.length} deployment(s)`);

      if (isJson) {
        process.stdout.write(JSON.stringify(deployments, null, 2) + '\n');
        return;
      }

      if (deployments.length === 0) {
        process.stdout.write(chalk.gray('\nNo deployments found. Deploy with: scalix-hosting deploy\n\n'));
        return;
      }

      process.stdout.write('\n');

      // Table headers
      const headers = ['Status', 'Name', 'URL', 'Age'];
      const rows = deployments.map((d: any) => {
        const statusIcon =
          d.status === 'ready' ? chalk.green('●') :
            d.status === 'error' ? chalk.red('●') :
              chalk.yellow('●');

        const age = d.createdAt ? getRelativeTime(new Date(d.createdAt)) : '-';
        const url = d.cloudRunUrl ? d.cloudRunUrl.replace(/^https?:\/\//, '') : chalk.gray('-');

        return [
          `${statusIcon} ${d.status}`,
          chalk.bold(d.appName),
          url,
          chalk.gray(age),
        ];
      });

      const widths = headers.map((h, i) => {
        const maxRow = rows.reduce((max: number, row: string[]) =>
          Math.max(max, stripAnsi(row[i]).length), 0);
        return Math.max(h.length, maxRow);
      });

      const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
      const separator = widths.map(w => '-'.repeat(w)).join('  ');

      process.stdout.write(`${chalk.bold(headerLine)}\n${chalk.gray(separator)}\n`);

      for (const row of rows) {
        const line = row.map((cell: string, i: number) => {
          const pad = widths[i] - stripAnsi(cell).length;
          return cell + ' '.repeat(Math.max(0, pad));
        }).join('  ');
        process.stdout.write(`${line}\n`);
      }

      process.stdout.write('\n');
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

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function getRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}
