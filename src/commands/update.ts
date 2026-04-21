/**
 * Update Command
 * Updates an existing deployment
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
import { MAX_DEPLOYMENT_SIZE_BYTES } from '../utils/constants';
import { validateDeploymentId, validateEnvVarName, validateEnvVarValue } from '../utils/validation';

interface UpdateOptions {
  dir?: string
  env?: string
  envVar?: string[]
}

export async function updateCommand(deploymentId: string, options: UpdateOptions) {
  const spinner = ora('Updating deployment...').start();

  try {
    // Validate deployment ID format
    const validation = validateDeploymentId(deploymentId);
    if (!validation.valid) {
      spinner.fail('Invalid deployment ID');
      process.stderr.write(chalk.red(`\n${validation.error}\n`));
      process.exit(1);
    }

    const token = await getToken();
    if (!token) {
      spinner.fail('Not authenticated');
      process.stderr.write(chalk.red('\nPlease run "scalix login" first\n'));
      process.exit(1);
    }

    // Get deployment info
    spinner.text = 'Fetching deployment information...';
    try {
      await apiClient.get(`/api/hosting/deployments/${deploymentId}`);
    } catch {
      spinner.fail('Deployment not found');
      process.stderr.write(chalk.red(`\nDeployment ${deploymentId} not found\n`));
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

    spinner.text = 'Creating deployment package...';

    // Create ZIP file
    const zipPath = path.join(deployDir, '.scalix-update.zip');
    const output = fsSync.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // Add files to archive
    const files = await fs.readdir(deployDir);
    let totalSize = 0;

    for (const file of files) {
      if (file.startsWith('.') && file !== '.env') { continue; }
      if (file === 'node_modules') { continue; }
      if (file === '.scalix-deploy.zip' || file === '.scalix-update.zip') { continue; }

      const filePath = path.join(deployDir, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        archive.directory(filePath, file);
      } else {
        totalSize += stat.size;
        if (totalSize > MAX_DEPLOYMENT_SIZE_BYTES) {
          spinner.fail('Deployment package too large');
          const sizeMB = (MAX_DEPLOYMENT_SIZE_BYTES / 1024 / 1024).toFixed(0);
          process.stderr.write(chalk.red(`\nTotal size exceeds ${sizeMB}MB limit\n`));
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

        if (key && value) {
          envVars[key] = value;
        }
      }
    }

    spinner.text = 'Updating deployment...';

    // Update deployment
    const response = await apiClient.put(`/api/hosting/deployments/${deploymentId}`, {
      sourceCode,
      sourceType: 'upload',
      environmentVariables: envVars
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      spinner.succeed('Deployment updated successfully!');
      process.stdout.write(chalk.green(`\n✓ Deployment ${deploymentId} has been updated\n`));
      if (response.data.deployment?.url) {
        process.stdout.write(chalk.blue(`✓ URL: ${response.data.deployment.url}\n`));
      }
    } else {
      spinner.fail('Update failed');
      process.stderr.write(chalk.red(`\nError: ${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }
  } catch (error) {
    spinner.fail('Update failed');

    // Clean up ZIP file if it exists
    try {
      const zipPath = path.join(path.resolve(options.dir || '.'), '.scalix-update.zip');
      await fsSync.promises.access(zipPath);
      await fsSync.promises.unlink(zipPath);
    } catch {
      // ZIP file doesn't exist, ignore
    }

    const err = error as any;
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    if (err.response?.data?.error) {
      process.stderr.write(chalk.red(`Details: ${err.response.data.error}\n`));
    }
    process.exit(1);
  }
}
