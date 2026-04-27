import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import archiver from 'archiver';
import chalk from 'chalk';
import ora from 'ora';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { loadEnvFile } from '../utils/env';
import { getGitMeta } from '../utils/git';
import { loadIgnorePatterns, shouldIgnore } from '../utils/ignore';
import {
  MAX_DEPLOYMENT_SIZE_BYTES,
  DEPLOYMENT_POLL_INTERVAL,
  DEPLOYMENT_MAX_ATTEMPTS
} from '../utils/constants';
import { validateAppName, validateEnvVarName, validateEnvVarValue } from '../utils/validation';

interface DeployOptions {
  dir?: string;
  name?: string;
  env?: string;
  envVar?: string[];
  prod?: boolean;
  preview?: boolean;
  json?: boolean;
  yes?: boolean;
}

function output(data: Record<string, unknown>, options: DeployOptions): void {
  if (options.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
}

async function getDirectorySize(dir: string, patterns: string[]): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldIgnore(entry.name, patterns)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySize(fullPath, patterns);
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      total += stat.size;
    }
  }

  return total;
}

async function addDirectoryToArchive(
  archive: archiver.Archiver,
  dir: string,
  prefix: string,
  patterns: string[]
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldIgnore(entry.name, patterns)) continue;

    const fullPath = path.join(dir, entry.name);
    const archivePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      await addDirectoryToArchive(archive, fullPath, archivePath, patterns);
    } else if (entry.isFile()) {
      archive.file(fullPath, { name: archivePath });
    }
  }
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
          output({ status: 'ready', url: deployment.cloudRunUrl, id: deploymentId }, options);
        } else if (deployment.cloudRunUrl) {
          process.stdout.write(chalk.green(`\n  Production: ${chalk.bold(deployment.cloudRunUrl)}\n\n`));
        }
        return;
      } else if (deployment.status === 'error') {
        spinner.fail('Deployment failed');
        if (options.json) {
          output({ status: 'error', error: deployment.errorMessage, id: deploymentId }, options);
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

export async function deployCommand(options: DeployOptions) {
  const isJson = options.json;
  const spinner = isJson ? ora({ isSilent: true }) : ora('Preparing deployment...').start();

  try {
    const token = await getToken();
    if (!token) {
      spinner.fail('Not authenticated');
      if (isJson) {
        output({ error: 'not_authenticated' }, options);
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

    // Load ignore patterns
    const ignorePatterns = await loadIgnorePatterns(deployDir);

    // Check total size before creating archive
    spinner.text = 'Calculating deployment size...';
    const totalSize = await getDirectorySize(deployDir, ignorePatterns);
    if (totalSize > MAX_DEPLOYMENT_SIZE_BYTES) {
      const sizeMB = (MAX_DEPLOYMENT_SIZE_BYTES / 1024 / 1024).toFixed(0);
      spinner.fail('Deployment package too large');
      process.stderr.write(chalk.red(`\nTotal size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds ${sizeMB}MB limit.\n`));
      process.stderr.write(chalk.gray('Add large files to .scalixignore to reduce size.\n'));
      process.exit(1);
    }

    // Collect git metadata
    const gitMeta = getGitMeta(deployDir);

    if (!isJson && gitMeta) {
      process.stdout.write('\n');
      process.stdout.write(chalk.gray(`  Project   ${chalk.white(appName)}\n`));
      process.stdout.write(chalk.gray(`  Branch    ${chalk.white(gitMeta.branch || 'detached')}\n`));
      process.stdout.write(chalk.gray(`  Commit    ${chalk.white(gitMeta.commit || 'unknown')}${gitMeta.dirty ? chalk.yellow(' (dirty)') : ''}\n`));
      process.stdout.write(chalk.gray(`  Size      ${chalk.white((totalSize / 1024 / 1024).toFixed(1) + 'MB')}\n`));
      const target = options.prod ? 'production' : options.preview ? 'preview' : 'production';
      process.stdout.write(chalk.gray(`  Target    ${chalk.white(target)}\n`));
      process.stdout.write('\n');
    }

    spinner.text = 'Creating deployment package...';

    // Create ZIP
    const zipPath = path.join(deployDir, '.scalix-deploy.zip');
    const zipOutput = fsSync.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(zipOutput);

    await addDirectoryToArchive(archive, deployDir, '', ignorePatterns);
    await archive.finalize();

    await new Promise<void>((resolve) => {
      zipOutput.on('close', () => resolve());
    });

    spinner.text = 'Uploading...';

    const zipBuffer = await fs.readFile(zipPath);
    const sourceCode = zipBuffer.toString('base64');
    await fs.unlink(zipPath);

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
      sourceCode,
      sourceType: 'upload',
      environmentVariables: envVars,
      target: options.preview ? 'preview' : 'production',
    };

    if (gitMeta) {
      deploymentData.gitMeta = {
        branch: gitMeta.branch,
        commit: gitMeta.commit,
        commitMessage: gitMeta.commitMessage,
        dirty: gitMeta.dirty,
      };
    }

    const response = await apiClient.post('/api/hosting/deploy', deploymentData, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.data.success) {
      const deploymentId = response.data.deployment.deploymentId;

      if (isJson) {
        output({
          id: deploymentId,
          url: response.data.deployment.url,
          status: response.data.deployment.status || 'deploying',
          target: options.preview ? 'preview' : 'production',
          git: gitMeta ? { branch: gitMeta.branch, commit: gitMeta.commit } : null,
        }, options);
        if (response.data.deployment.status === 'ready') return;
      } else {
        spinner.succeed(`Deployment started ${chalk.gray(deploymentId)}`);
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
      process.stderr.write(chalk.red(`\nError: ${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail('Deployment failed');

    try {
      const zipPath = path.join(path.resolve(options.dir || '.'), '.scalix-deploy.zip');
      await fs.access(zipPath);
      await fs.unlink(zipPath);
    } catch {
      // ZIP cleanup
    }

    if (error.response?.status === 401) {
      process.stderr.write(chalk.red('\nAuthentication failed. Run "scalix-hosting login" to re-authenticate.\n'));
    } else if (error.response?.status === 413) {
      process.stderr.write(chalk.red('\nDeployment package too large. Add files to .scalixignore.\n'));
    } else if (error.response?.status === 429) {
      process.stderr.write(chalk.red('\nRate limit exceeded. Please wait and try again.\n'));
    } else if (error.response?.data?.error) {
      process.stderr.write(chalk.red(`\nError: ${error.response.data.error}\n`));
    } else if (error.message) {
      process.stderr.write(chalk.red(`\nError: ${error.message}\n`));
    } else {
      process.stderr.write(chalk.red('\nAn unexpected error occurred.\n'));
    }

    process.exit(1);
  }
}
