import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { loadEnvFile } from '../utils/env';
import { getGitMeta } from '../utils/git';
import {
  DEPLOYMENT_POLL_INTERVAL,
  DEPLOYMENT_MAX_ATTEMPTS
} from '../utils/constants';
import { validateAppName, validateEnvVarName, validateEnvVarValue } from '../utils/validation';

interface DeployOptions {
  dir?: string;
  name?: string;
  env?: string;
  envVar?: string[];
  branch?: string;
  json?: boolean;
  yes?: boolean;
}

async function pollDeploymentStatus(deploymentId: string, spinner: any, options: DeployOptions) {
  let attempts = 0;

  while (attempts < DEPLOYMENT_MAX_ATTEMPTS) {
    await new Promise(resolve => setTimeout(resolve, DEPLOYMENT_POLL_INTERVAL));

    try {
      const statusResponse = await apiClient.get(`/api/hosting/deployments/${deploymentId}`);
      const deployment = statusResponse.data.deployment;

      if (deployment.status === 'ready') {
        spinner.succeed('Deployment completed successfully!');
        if (options.json) {
          process.stdout.write(JSON.stringify({ status: 'ready', url: deployment.cloudRunUrl, id: deploymentId }, null, 2) + '\n');
        } else if (deployment.cloudRunUrl) {
          process.stdout.write(chalk.green(`\n  Live at: ${chalk.bold(deployment.cloudRunUrl)}\n\n`));
        }
        return;
      } else if (deployment.status === 'error') {
        spinner.fail('Deployment failed');
        if (options.json) {
          process.stdout.write(JSON.stringify({ status: 'error', error: deployment.errorMessage, id: deploymentId }, null, 2) + '\n');
        } else if (deployment.errorMessage) {
          process.stderr.write(chalk.red(`\nError: ${deployment.errorMessage}\n`));
        }
        process.exit(1);
      }

      attempts++;
      spinner.text = `Deploying... (${deployment.status}) [${attempts}/${DEPLOYMENT_MAX_ATTEMPTS}]`;
    } catch {
      spinner.warn('Could not check deployment status');
      process.stdout.write(chalk.yellow('\nUse "scalix-hosting status <id>" to check status\n'));
      return;
    }
  }

  spinner.warn('Deployment is taking longer than expected');
  process.stdout.write(chalk.yellow('\nUse "scalix-hosting status <id>" to check status\n'));
}

function detectGitRepository(dir: string): { repo: string; branch: string } | null {
  const gitMeta = getGitMeta(dir);
  if (!gitMeta?.remoteUrl) return null;

  let repo = gitMeta.remoteUrl;
  // Normalize SSH to HTTPS
  if (repo.startsWith('git@github.com:')) {
    repo = repo.replace('git@github.com:', 'https://github.com/');
  }
  repo = repo.replace(/\.git$/, '');

  return { repo, branch: gitMeta.branch || 'main' };
}

export async function deployCommand(options: DeployOptions) {
  const isJson = options.json;
  const spinner = isJson ? ora({ isSilent: true }) : ora('Preparing deployment...').start();

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

    const deployDir = path.resolve(options.dir || '.');

    try {
      await fs.access(deployDir);
    } catch {
      spinner.fail('Directory not found');
      process.stderr.write(chalk.red(`\nDirectory not found: ${deployDir}\n`));
      process.exit(1);
    }

    // Resolve app name
    let appName = options.name;
    if (!appName) {
      try {
        const packageJson = JSON.parse(
          await fs.readFile(path.join(deployDir, 'package.json'), 'utf-8')
        );
        appName = packageJson.name?.replace(/^@[^/]+\//, '') || path.basename(deployDir);
      } catch {
        appName = path.basename(deployDir);
      }
    }

    if (!appName) {
      spinner.fail('Invalid app name');
      process.stderr.write(chalk.red('\nApp name cannot be empty\n'));
      process.exit(1);
    }

    const appNameValidation = validateAppName(appName);
    if (!appNameValidation.valid) {
      spinner.fail('Invalid app name');
      process.stderr.write(chalk.red(`\n${appNameValidation.error}\n`));
      process.exit(1);
    }

    // Validate env vars
    if (options.envVar) {
      for (const envVar of options.envVar) {
        const [key, ...valueParts] = envVar.split('=');
        const value = valueParts.join('=');

        if (!key) {
          spinner.fail('Invalid environment variable format');
          process.stderr.write(chalk.red('\nFormat: KEY=VALUE\n'));
          process.exit(1);
        }

        const nameValidation = validateEnvVarName(key);
        if (!nameValidation.valid) {
          spinner.fail('Invalid environment variable name');
          process.stderr.write(chalk.red(`\n${nameValidation.error}\n`));
          process.exit(1);
        }

        if (value) {
          const valueValidation = validateEnvVarValue(value);
          if (!valueValidation.valid) {
            spinner.fail('Invalid environment variable value');
            process.stderr.write(chalk.red(`\n${valueValidation.error}\n`));
            process.exit(1);
          }
        }
      }
    }

    // Detect git repository from working directory
    const detected = detectGitRepository(deployDir);
    if (!detected) {
      spinner.fail('Not a git repository');
      process.stderr.write(chalk.red('\nScalix Hosting deploys from GitHub repositories.\n'));
      process.stderr.write(chalk.gray('Initialize a git repo, add a GitHub remote, and push your code first:\n\n'));
      process.stderr.write(chalk.gray('  git init && git remote add origin https://github.com/you/repo\n'));
      process.stderr.write(chalk.gray('  git add . && git commit -m "init" && git push -u origin main\n\n'));
      process.exit(1);
    }

    const gitRepository = detected.repo;
    const gitBranch = options.branch || detected.branch;
    const gitMeta = getGitMeta(deployDir);

    if (!isJson) {
      process.stdout.write('\n');
      process.stdout.write(chalk.gray(`  Project     ${chalk.white(appName)}\n`));
      process.stdout.write(chalk.gray(`  Repository  ${chalk.white(gitRepository)}\n`));
      process.stdout.write(chalk.gray(`  Branch      ${chalk.white(gitBranch)}\n`));
      if (gitMeta?.commit) {
        process.stdout.write(chalk.gray(`  Commit      ${chalk.white(gitMeta.commit)}${gitMeta.dirty ? chalk.yellow(' (uncommitted changes)') : ''}\n`));
      }
      process.stdout.write('\n');

      if (gitMeta?.dirty) {
        process.stdout.write(chalk.yellow('  Warning: You have uncommitted changes. Only pushed commits will be deployed.\n\n'));
      }
    }

    // Load environment variables
    const envVars: Record<string, string> = {};

    if (options.env) {
      const envPath = path.resolve(options.env);
      const envData = await loadEnvFile(envPath);
      Object.assign(envVars, envData);
    }

    if (options.envVar) {
      for (const envVar of options.envVar) {
        const [key, ...valueParts] = envVar.split('=');
        const value = valueParts.join('=');
        if (key && value) {
          envVars[key] = value;
        }
      }
    }

    spinner.text = 'Deploying to Scalix Hosting...';

    const deploymentData: Record<string, unknown> = {
      appName,
      sourceType: 'git',
      gitRepository,
      gitBranch,
      environmentVariables: envVars,
    };

    const response = await apiClient.post('/api/hosting/deploy', deploymentData, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.data.success) {
      const deploymentId = response.data.deployment.deploymentId;

      if (isJson) {
        process.stdout.write(JSON.stringify({
          id: deploymentId,
          url: response.data.deployment.url,
          status: response.data.deployment.status || 'queued',
          repository: gitRepository,
          branch: gitBranch,
        }, null, 2) + '\n');
        if (response.data.deployment.status === 'ready') return;
      } else {
        spinner.succeed(`Deployment queued ${chalk.gray(deploymentId)}`);
        if (response.data.deployment.url) {
          process.stdout.write(chalk.blue(`  URL: ${response.data.deployment.url}\n`));
        }
      }

      if (response.data.deployment.status && response.data.deployment.status !== 'ready') {
        if (!isJson) spinner.start('Deploying...');
        await pollDeploymentStatus(deploymentId, spinner, options);
      }
    } else {
      spinner.fail('Deployment failed');
      const err = response.data.error;
      if (typeof err === 'object' && err?.type === 'GITHUB_CONNECT_REQUIRED') {
        process.stderr.write(chalk.red(`\n${err.message}\n`));
        process.stderr.write(chalk.gray(`Connect GitHub at: https://scalix.world${err.connectUrl || '/dashboard/integrations'}\n`));
      } else if (typeof err === 'object' && err?.type === 'HOSTING_LIMIT_REACHED') {
        process.stderr.write(chalk.red(`\n${err.message}\n`));
        process.stderr.write(chalk.gray(`Upgrade at: https://scalix.world${err.upgradeUrl || '/dashboard/billing/plans'}\n`));
      } else {
        process.stderr.write(chalk.red(`\nError: ${typeof err === 'string' ? err : JSON.stringify(err)}\n`));
      }
      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail('Deployment failed');

    if (error.response?.status === 401) {
      process.stderr.write(chalk.red('\nAuthentication failed. Run "scalix-hosting login" to re-authenticate.\n'));
    } else if (error.response?.status === 403) {
      const err = error.response.data?.error;
      if (typeof err === 'object' && err?.type === 'GITHUB_CONNECT_REQUIRED') {
        process.stderr.write(chalk.red(`\n${err.message}\n`));
      } else if (typeof err === 'object' && err?.type === 'HOSTING_LIMIT_REACHED') {
        process.stderr.write(chalk.red(`\n${err.message}\n`));
      } else {
        process.stderr.write(chalk.red(`\nError: ${typeof err === 'string' ? err : JSON.stringify(err)}\n`));
      }
    } else if (error.response?.status === 429) {
      process.stderr.write(chalk.red('\nRate limit exceeded. Please wait and try again.\n'));
    } else if (error.response?.data?.error) {
      const err = error.response.data.error;
      process.stderr.write(chalk.red(`\nError: ${typeof err === 'string' ? err : JSON.stringify(err)}\n`));
    } else if (error.message) {
      process.stderr.write(chalk.red(`\nError: ${error.message}\n`));
    } else {
      process.stderr.write(chalk.red('\nAn unexpected error occurred.\n'));
    }

    process.exit(1);
  }
}
