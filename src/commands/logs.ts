import chalk from 'chalk';
import ora from 'ora';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { validateDeploymentId } from '../utils/validation';
import { LOGS_POLL_INTERVAL, LOGS_FOLLOW_TAIL } from '../utils/constants';

export async function logsCommand(
  deploymentId: string,
  options: { follow?: boolean; tail?: string; since?: string; json?: boolean }
) {
  const isJson = options.json;
  const spinner = isJson ? ora({ isSilent: true }) : ora('Fetching logs...').start();

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

    const params: Record<string, string> = {
      deploymentId,
      tail: options.tail || '100',
    };
    if (options.since) {
      params.since = options.since;
    }

    const response = await apiClient.get('/api/hosting/logs', { params });

    if (response.data.logs) {
      spinner.succeed('Logs fetched');

      const logs = response.data.logs;
      const lines = logs.slice(-parseInt(options.tail || '100'));

      if (isJson) {
        process.stdout.write(JSON.stringify(lines, null, 2) + '\n');
        if (!options.follow) return;
      } else {
        process.stdout.write('\n');
        for (const line of lines) {
          process.stdout.write(`${line}\n`);
        }
      }

      if (options.follow) {
        if (!isJson) {
          process.stdout.write(chalk.gray('\nFollowing logs... (Ctrl+C to stop)\n'));
        }

        let lastLogIndex = lines.length;
        const pollInterval = setInterval(async () => {
          try {
            const followResponse = await apiClient.get('/api/hosting/logs', {
              params: {
                deploymentId,
                tail: LOGS_FOLLOW_TAIL.toString(),
              }
            });

            if (followResponse.data.logs) {
              const newLogs = followResponse.data.logs.slice(lastLogIndex);
              for (const line of newLogs) {
                if (isJson) {
                  process.stdout.write(JSON.stringify({ log: line }) + '\n');
                } else {
                  process.stdout.write(`${line}\n`);
                }
              }
              lastLogIndex = followResponse.data.logs.length;
            }
          } catch (error: any) {
            clearInterval(pollInterval);
            process.stderr.write(chalk.red(`\nError following logs: ${error.message}\n`));
            process.exit(1);
          }
        }, LOGS_POLL_INTERVAL);

        process.on('SIGINT', () => {
          clearInterval(pollInterval);
          if (!isJson) {
            process.stdout.write(chalk.gray('\n\nStopped following logs\n'));
          }
          process.exit(0);
        });
      }
    } else {
      spinner.fail('Failed to fetch logs');
      process.stderr.write(chalk.red(`${response.data.error || 'Unknown error'}\n`));
    }
  } catch (error) {
    const err = error as any;
    spinner.fail('Failed to fetch logs');
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    if (err.response?.data?.error) {
      process.stderr.write(chalk.red(`Details: ${err.response.data.error}\n`));
    }
    process.exit(1);
  }
}
