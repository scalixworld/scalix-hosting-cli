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
import { MAX_DEPLOYMENT_SIZE_BYTES } from '../utils/constants';
import { validateDeploymentId, validateEnvVarName, validateEnvVarValue } from '../utils/validation';

interface UpdateOptions {
  dir?: string;
  env?: string;
  envVar?: string[];
  json?: boolean;
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

export async function updateCommand(deploymentId: string, options: UpdateOptions) {
  const isJson = options.json;
  const spinner = isJson ? ora({ isSilent: true }) : ora('Updating deployment...').start();

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

    spinner.text = 'Fetching deployment information...';
    try {
      await apiClient.get(`/api/hosting/deployments/${deploymentId}`);
    } catch {
      spinner.fail('Deployment not found');
      process.stderr.write(chalk.red(`\nDeployment ${deploymentId} not found\n`));
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

    // Load ignore patterns
    const ignorePatterns = await loadIgnorePatterns(deployDir);

    spinner.text = 'Creating deployment package...';

    const zipPath = path.join(deployDir, '.scalix-update.zip');
    const output = fsSync.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);

    await addDirectoryToArchive(archive, deployDir, '', ignorePatterns);
    await archive.finalize();

    await new Promise<void>((resolve) => {
      output.on('close', () => resolve());
    });

    spinner.text = 'Uploading...';

    const zipBuffer = await fs.readFile(zipPath);
    const sourceCode = zipBuffer.toString('base64');

    if (zipBuffer.length > MAX_DEPLOYMENT_SIZE_BYTES) {
      await fs.unlink(zipPath);
      const sizeMB = (MAX_DEPLOYMENT_SIZE_BYTES / 1024 / 1024).toFixed(0);
      spinner.fail('Deployment package too large');
      process.stderr.write(chalk.red(`\nPackage exceeds ${sizeMB}MB limit. Add files to .scalixignore.\n`));
      process.exit(1);
    }

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

        if (key && value) {
          envVars[key] = value;
        }
      }
    }

    spinner.text = 'Updating deployment...';

    const gitMeta = getGitMeta(deployDir);
    const updateData: Record<string, unknown> = {
      sourceCode,
      sourceType: 'upload',
      environmentVariables: envVars,
    };

    if (gitMeta) {
      updateData.gitMeta = {
        branch: gitMeta.branch,
        commit: gitMeta.commit,
        commitMessage: gitMeta.commitMessage,
        dirty: gitMeta.dirty,
      };
    }

    const response = await apiClient.put(
      `/api/hosting/deployments/${deploymentId}`,
      updateData,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (response.data.success) {
      if (isJson) {
        process.stdout.write(JSON.stringify({
          updated: true,
          id: deploymentId,
          url: response.data.deployment?.url,
        }, null, 2) + '\n');
      } else {
        spinner.succeed(`Deployment ${chalk.gray(deploymentId)} updated`);
        if (response.data.deployment?.url) {
          process.stdout.write(chalk.blue(`  URL: ${response.data.deployment.url}\n`));
        }
      }
    } else {
      spinner.fail('Update failed');
      process.stderr.write(chalk.red(`\nError: ${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }
  } catch (error) {
    spinner.fail('Update failed');

    try {
      const zipPath = path.join(path.resolve(options.dir || '.'), '.scalix-update.zip');
      await fsSync.promises.access(zipPath);
      await fsSync.promises.unlink(zipPath);
    } catch {
      // ZIP cleanup
    }

    const err = error as any;
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    if (err.response?.data?.error) {
      process.stderr.write(chalk.red(`Details: ${err.response.data.error}\n`));
    }
    process.exit(1);
  }
}
