/**
 * Deploy Command
 * Deploys an application to Scalix Hosting
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import archiver from 'archiver';
import chalk from 'chalk';
import ora from 'ora';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { loadEnvFile } from '../utils/env';
import {
  MAX_DEPLOYMENT_SIZE_BYTES,
  DEPLOYMENT_POLL_INTERVAL,
  DEPLOYMENT_MAX_ATTEMPTS
} from '../utils/constants';
import { validateAppName, validateEnvVarName, validateEnvVarValue } from '../utils/validation';

interface DeployOptions {
  dir?: string
  name?: string
  database?: string
  env?: string
  envVar?: string[]
}

async function pollDeploymentStatus(deploymentId: string, _token: string, spinner: any) {
  let attempts = 0;

  while (attempts < DEPLOYMENT_MAX_ATTEMPTS) {
    try {
      await new Promise(resolve => setTimeout(resolve, DEPLOYMENT_POLL_INTERVAL));

      const statusResponse = await apiClient.get(`/api/hosting/deployments/${deploymentId}`);
      const deployment = statusResponse.data.deployment;

      if (deployment.status === 'ready') {
        spinner.succeed('Deployment completed successfully!');
        if (deployment.cloudRunUrl) {
          process.stdout.write(chalk.green(`\n✓ Your app is live at: ${chalk.blue(deployment.cloudRunUrl)}\n`));
        }
        return;
      } else if (deployment.status === 'error') {
        spinner.fail('Deployment failed');
        if (deployment.errorMessage) {
          process.stderr.write(chalk.red(`\nError: ${deployment.errorMessage}\n`));
        }
        return;
      }

      attempts++;
      spinner.text = `Deployment in progress... (${deployment.status}) [${attempts}/${DEPLOYMENT_MAX_ATTEMPTS}]`;
    } catch {
      // If we can't check status, just stop polling
      spinner.warn('Could not check deployment status');
      process.stdout.write(chalk.yellow('\nUse "scalix status <deployment-id>" to check deployment status\n'));
      return;
    }
  }

  spinner.warn('Deployment is taking longer than expected');
  process.stdout.write(chalk.yellow('\nUse "scalix status <deployment-id>" to check deployment status\n'));
}

async function pollDatabaseStatus(databaseId: string, token: string, spinner: any): Promise<string | null> {
  const MAX_ATTEMPTS = 60;
  const POLL_INTERVAL = 3000;
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    try {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

      const response = await apiClient.get(`/api/scalixdb/databases/${databaseId}/connection`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const connectionString = response.data.connectionString;

      if (typeof connectionString === 'string' && connectionString.length > 0) {
        return connectionString;
      }

      attempts++;
      spinner.text = `Provisioning ScalixDB... [${attempts}/${MAX_ATTEMPTS}]`;
    } catch (error: any) {
      if (error.message && error.message.includes('Database creation failed')) {
        throw error;
      }
      // Ignore transient errors during polling
    }
  }

  throw new Error('Database provisioning timed out');
}

export async function deployCommand(options: DeployOptions) {
  const spinner = ora('Preparing deployment...').start();

  try {
    // Check authentication
    const token = await getToken();
    if (!token) {
      spinner.fail('Not authenticated');
      process.stderr.write(chalk.red('\nPlease run "scalix login" first\n'));
      process.exit(1);
    }

    // Get deployment directory
    const deployDir = path.resolve(options.dir || '.');
    spinner.text = 'Checking deployment directory...';

    // Verify directory exists
    try {
      await fs.access(deployDir);
    } catch {
      spinner.fail('Directory not found');
      process.stderr.write(chalk.red(`\nDirectory not found: ${deployDir}\n`));
      process.exit(1);
    }

    // Get app name
    let appName = options.name;
    if (!appName) {
      // Try to get from package.json
      try {
        const packageJson = JSON.parse(
          await fs.readFile(path.join(deployDir, 'package.json'), 'utf-8')
        );
        appName = packageJson.name || path.basename(deployDir);
      } catch {
        appName = path.basename(deployDir);
      }
    }

    // Validate app name
    if (!appName) {
      spinner.fail('Invalid app name');
      console.error(chalk.red('\nApp name cannot be empty'));
      process.exit(1);
    }

    const appNameValidation = validateAppName(appName);
    if (!appNameValidation.valid) {
      spinner.fail('Invalid app name');
      process.stderr.write(chalk.red(`\n${appNameValidation.error}\n`));
      process.exit(1);
    }

    // Validate environment variable names and values
    if (options.envVar) {
      for (const envVar of options.envVar) {
        const [key, ...valueParts] = envVar.split('=');
        const value = valueParts.join('=');

        if (!key) {
          spinner.fail('Invalid environment variable format');
          process.stderr.write(chalk.red('\nEnvironment variables must be in the format KEY=VALUE\n'));
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

    spinner.text = 'Creating deployment package...';

    // Create ZIP file
    const zipPath = path.join(deployDir, '.scalix-deploy.zip');
    const output = fsSync.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // Add files to archive
    const files = await fs.readdir(deployDir);
    let totalSize = 0;

    for (const file of files) {
      // Skip certain files
      if (file.startsWith('.') && file !== '.env') { continue; }
      if (file === 'node_modules') { continue; }
      if (file === '.scalix-deploy.zip') { continue; }

      const filePath = path.join(deployDir, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        // For directories, estimate size (could be improved with recursive calculation)
        archive.directory(filePath, file);
      } else {
        totalSize += stat.size;
        if (totalSize > MAX_DEPLOYMENT_SIZE_BYTES) {
          spinner.fail('Deployment package too large');
          const sizeMB = (MAX_DEPLOYMENT_SIZE_BYTES / 1024 / 1024).toFixed(0);
          process.stderr.write(chalk.red(`\nTotal size exceeds ${sizeMB}MB limit. Please reduce the size of your deployment.\n`));
          await archive.abort();
          process.exit(1);
        }
        archive.file(filePath, { name: file });
      }
    }

    await archive.finalize();

    // Wait for ZIP to be written
    await new Promise<void>((resolve) => {
      output.on('close', () => resolve());
    });

    spinner.text = 'Reading deployment package...';

    // Read ZIP file as base64
    const zipBuffer = await fs.readFile(zipPath);
    const sourceCode = zipBuffer.toString('base64');

    // Clean up ZIP file
    await fs.unlink(zipPath);

    // Load environment variables
    const envVars: Record<string, string> = {};

    if (options.env) {
      const envPath = path.resolve(options.env);
      const envData = await loadEnvFile(envPath);
      Object.assign(envVars, envData);
    }

    // Add command-line env vars
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

    // Prepare deployment data
    const deploymentData: any = {
      appName,
      sourceCode,
      sourceType: 'upload',
      environmentVariables: envVars
    };

    // Add database selection
    if (options.database && options.database !== 'none') {
      if (options.database === 'scalixdb') {
        spinner.text = 'Provisioning ScalixDB instance...';
        try {
          const dbResponse = await apiClient.post('/api/scalixdb/databases', {
            name: appName
          }, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (dbResponse.data.database) {
            const dbId = dbResponse.data.database.id;
            process.stdout.write(chalk.green(`\n✓ ScalixDB instance initiated: ${dbId}\n`));

            spinner.text = 'Waiting for database provisioning...';
            const connectionString = await pollDatabaseStatus(dbId, token, spinner);

            if (connectionString) {
              deploymentData.environmentVariables = {
                ...deploymentData.environmentVariables,
                DATABASE_URL: deploymentData.environmentVariables.DATABASE_URL || connectionString
              };
              process.stdout.write(chalk.green(`✓ ScalixDB ready and connected\n`));
            }
          }
        } catch (error: any) {
          process.stdout.write(chalk.yellow('\n⚠ Database creation failed, continuing without database\n'));
          process.stdout.write(chalk.gray(`Error: ${error.response?.data?.error || error.message}\n`));
        }
      } else {
        process.stdout.write(chalk.yellow(`\n⚠ Database option "${options.database}" is no longer supported via Hosting endpoints.\n`));
        process.stdout.write(chalk.gray('Use "--database=scalixdb" or pass your own DATABASE_URL via --env/--envVar.\n'));
      }
    }

    // Deploy
    const response = await apiClient.post('/api/hosting/deploy', deploymentData, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      const deploymentId = response.data.deployment.deploymentId;
      spinner.succeed('Deployment started successfully!');
      process.stdout.write(chalk.green(`\n✓ Deployment ID: ${deploymentId}\n`));
      if (response.data.deployment.url) {
        process.stdout.write(chalk.blue(`✓ URL: ${response.data.deployment.url}\n`));
      }

      // Poll for deployment progress if not immediately ready
      if (response.data.deployment.status && response.data.deployment.status !== 'ready') {
        spinner.start('Waiting for deployment to complete...');
        await pollDeploymentStatus(deploymentId, token, spinner);
      } else {
        process.stdout.write(chalk.gray('\nMonitor deployment status with: scalix status <deployment-id>\n'));
      }
    } else {
      spinner.fail('Deployment failed');
      process.stderr.write(chalk.red(`\nError: ${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail('Deployment failed');

    // Clean up ZIP file if it exists
    try {
      const zipPath = path.join(path.resolve(options.dir || '.'), '.scalix-deploy.zip');
      await fs.access(zipPath);
      await fs.unlink(zipPath);
    } catch {
      // ZIP file doesn't exist or already deleted, ignore
    }

    // Provide helpful error messages
    if (error.response?.status === 401) {
      process.stderr.write(chalk.red('\nAuthentication failed. Please run "scalix login" to re-authenticate.\n'));
    } else if (error.response?.status === 413) {
      process.stderr.write(chalk.red('\nDeployment package is too large. Please reduce the size of your files.\n'));
    } else if (error.response?.status === 429) {
      process.stderr.write(chalk.red('\nRate limit exceeded. Please wait a moment and try again.\n'));
    } else if (error.response?.data?.error) {
      process.stderr.write(chalk.red(`\nError: ${error.response.data.error}\n`));
    } else if (error.message) {
      process.stderr.write(chalk.red(`\nError: ${error.message}\n`));
    } else {
      process.stderr.write(chalk.red('\nAn unexpected error occurred. Please try again.\n'));
    }

    process.exit(1);
  }
}
