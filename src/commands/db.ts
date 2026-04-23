/**
 * Database Command
 * Manages ScalixDB databases
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { Command } from 'commander';
import { getToken } from '../utils/token';
import { apiClient } from '../utils/api';

const DB_API_PREFIX = '/api/scalixdb/databases';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireAuth(spinner: ReturnType<typeof ora>): Promise<string> {
  const token = await getToken();
  if (!token) {
    spinner.fail('Not authenticated');
    process.stderr.write(chalk.red('\nPlease run "scalix login" first\n'));
    process.exit(1);
  }
  return token;
}

function handleError(spinner: ReturnType<typeof ora>, error: unknown, action: string): never {
  const err = error as any;
  spinner.fail(`Failed to ${action}`);
  process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
  const detail = err.response?.data?.error;
  if (detail) {
    const msg = typeof detail === 'string' ? detail : (detail.message || JSON.stringify(detail));
    process.stderr.write(chalk.red(`Details: ${msg}\n`));
  }
  process.exit(1);
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (['ready', 'active', 'running', 'healthy'].includes(s)) return chalk.green(status);
  if (['error', 'failed', 'deleted'].includes(s)) return chalk.red(status);
  return chalk.yellow(status);
}

function printTable(headers: string[], rows: string[][]): void {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, (row[i] || '').length), 0);
    return Math.max(h.length, maxRow);
  });

  // Header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  const separator = widths.map(w => '-'.repeat(w)).join('  ');

  process.stdout.write(`\n${chalk.bold(headerLine)}\n${chalk.gray(separator)}\n`);

  // Rows
  for (const row of rows) {
    const line = row.map((cell, i) => (cell || '').padEnd(widths[i])).join('  ');
    process.stdout.write(`${line}\n`);
  }
  process.stdout.write('\n');
}

function printKeyValue(pairs: [string, string][]): void {
  const maxKey = pairs.reduce((max, [k]) => Math.max(max, k.length), 0);
  process.stdout.write('\n');
  for (const [key, value] of pairs) {
    process.stdout.write(`  ${chalk.bold(key.padEnd(maxKey))}  ${value}\n`);
  }
  process.stdout.write('\n');
}

// ── Subcommand handlers ─────────────────────────────────────────────────────

async function dbList(): Promise<void> {
  const spinner = ora('Fetching databases...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(DB_API_PREFIX);

    if (!response.data.success) {
      spinner.fail('Failed to fetch databases');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const databases = response.data.databases || [];
    spinner.succeed(`Found ${databases.length} database(s)`);

    if (databases.length === 0) {
      process.stdout.write(chalk.gray('\nNo databases found. Create one with: scalix db create --name <name>\n\n'));
      return;
    }

    const rows = databases.map((db: any) => [
      db.id,
      db.name,
      statusColor(db.status || 'unknown'),
      db.plan || '-',
      db.region || '-',
      db.createdAt ? formatDate(db.createdAt) : '-',
    ]);

    printTable(['ID', 'Name', 'Status', 'Plan', 'Region', 'Created'], rows);
  } catch (error) {
    handleError(spinner, error, 'fetch databases');
  }
}

async function dbCreate(options: { name: string; plan?: string; region?: string }): Promise<void> {
  if (!options.name) {
    process.stderr.write(chalk.red('\nError: --name is required\n'));
    process.exit(1);
  }

  const spinner = ora(`Creating database "${options.name}"...`).start();
  try {
    await requireAuth(spinner);

    const body: Record<string, string> = { name: options.name };
    if (options.plan) body.plan = options.plan;
    if (options.region) body.region = options.region;

    const response = await apiClient.post(DB_API_PREFIX, body);

    if (!response.data.success) {
      spinner.fail('Failed to create database');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const db = response.data.database;
    spinner.succeed(`Database "${db.name}" created`);

    printKeyValue([
      ['ID', db.id],
      ['Name', db.name],
      ['Status', statusColor(db.status || 'provisioning')],
      ['Plan', db.plan || '-'],
      ['Region', db.region || '-'],
    ]);
  } catch (error) {
    handleError(spinner, error, 'create database');
  }
}

async function dbInfo(databaseId: string): Promise<void> {
  const spinner = ora('Fetching database info...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}`);

    if (!response.data.success) {
      spinner.fail('Database not found');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const db = response.data.database;
    spinner.succeed('Database info retrieved');

    printKeyValue([
      ['ID', db.id],
      ['Name', db.name],
      ['Status', statusColor(db.status || 'unknown')],
      ['Plan', db.plan || '-'],
      ['Region', db.region || '-'],
      ['Size', db.size || '-'],
      ['Tables', db.tableCount?.toString() || '-'],
      ['Created', db.createdAt ? formatDate(db.createdAt) : '-'],
      ['Updated', db.updatedAt ? formatDate(db.updatedAt) : '-'],
    ]);
  } catch (error) {
    handleError(spinner, error, 'fetch database info');
  }
}

async function dbDelete(databaseId: string, options: { force?: boolean }): Promise<void> {
  const spinner = ora('Preparing to delete database...').start();
  try {
    await requireAuth(spinner);

    // Get database info first
    let db: any = null;
    try {
      const infoResponse = await apiClient.get(`${DB_API_PREFIX}/${databaseId}`);
      db = infoResponse.data.database;
    } catch {
      spinner.fail('Database not found');
      process.stderr.write(chalk.red(`\nDatabase ${databaseId} not found\n`));
      process.exit(1);
    }

    if (!options.force && db) {
      spinner.stop();
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete database "${db.name}" (${databaseId})? This action is irreversible.`,
          default: false,
        },
      ]);

      if (!confirm) {
        process.stdout.write(chalk.gray('\nDeletion cancelled\n'));
        return;
      }
      spinner.start('Deleting database...');
    }

    const response = await apiClient.delete(`${DB_API_PREFIX}/${databaseId}`);

    if (!response.data.success) {
      spinner.fail('Failed to delete database');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed(`Database ${databaseId} deleted`);
  } catch (error) {
    handleError(spinner, error, 'delete database');
  }
}

async function dbQuery(databaseId: string, options: { sql: string }): Promise<void> {
  if (!options.sql) {
    process.stderr.write(chalk.red('\nError: --sql is required\n'));
    process.exit(1);
  }

  const spinner = ora('Executing query...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/query`, {
      sql: options.sql,
    });

    if (!response.data.success) {
      spinner.fail('Query failed');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const { rows, rowCount, fields } = response.data;
    spinner.succeed(`Query returned ${rowCount} row(s)`);

    if (!rows || rows.length === 0) {
      process.stdout.write(chalk.gray('\nNo rows returned\n\n'));
      return;
    }

    // Build table from result rows
    const columns: string[] = fields || Object.keys(rows[0]);
    const tableRows = rows.map((row: any) =>
      columns.map((col) => {
        const val = row[col];
        if (val === null || val === undefined) return chalk.gray('NULL');
        return String(val);
      })
    );

    printTable(columns, tableRows);
  } catch (error) {
    handleError(spinner, error, 'execute query');
  }
}

async function dbTables(databaseId: string): Promise<void> {
  const spinner = ora('Fetching tables...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/tables`);

    if (!response.data.success) {
      spinner.fail('Failed to fetch tables');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const tables = response.data.tables || [];
    spinner.succeed(`Found ${tables.length} table(s)`);

    if (tables.length === 0) {
      process.stdout.write(chalk.gray('\nNo tables found\n\n'));
      return;
    }

    const rows = tables.map((t: any) => [
      t.name || t.table_name || String(t),
      t.schema || 'public',
      t.rowCount?.toString() || t.row_count?.toString() || '-',
      t.size || '-',
    ]);

    printTable(['Table', 'Schema', 'Rows', 'Size'], rows);
  } catch (error) {
    handleError(spinner, error, 'fetch tables');
  }
}

async function dbMetrics(databaseId: string): Promise<void> {
  const spinner = ora('Fetching metrics...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/metrics`);

    if (!response.data.success) {
      spinner.fail('Failed to fetch metrics');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const metrics = response.data.metrics;
    spinner.succeed('Database metrics retrieved');

    const pairs: [string, string][] = Object.entries(metrics).map(([key, value]) => {
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase())
        .trim();
      return [label, String(value)];
    });

    printKeyValue(pairs);
  } catch (error) {
    handleError(spinner, error, 'fetch metrics');
  }
}

async function dbConnection(databaseId: string): Promise<void> {
  const spinner = ora('Fetching connection info...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/connection`);

    if (!response.data.success) {
      spinner.fail('Failed to fetch connection info');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Connection info retrieved');
    process.stdout.write(`\n  ${chalk.bold('Connection String')}\n`);
    process.stdout.write(`  ${response.data.connectionString}\n\n`);
  } catch (error) {
    handleError(spinner, error, 'fetch connection info');
  }
}

async function dbBackupList(databaseId: string): Promise<void> {
  const spinner = ora('Fetching backups...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/backups`);

    if (!response.data.success) {
      spinner.fail('Failed to fetch backups');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const backups = response.data.backups || [];
    spinner.succeed(`Found ${backups.length} backup(s)`);

    if (backups.length === 0) {
      process.stdout.write(chalk.gray('\nNo backups found\n\n'));
      return;
    }

    const rows = backups.map((b: any) => [
      b.id,
      b.name || '-',
      statusColor(b.status || 'unknown'),
      b.size || '-',
      b.createdAt ? formatDate(b.createdAt) : '-',
    ]);

    printTable(['ID', 'Name', 'Status', 'Size', 'Created'], rows);
  } catch (error) {
    handleError(spinner, error, 'fetch backups');
  }
}

async function dbBackupCreate(databaseId: string, options: { name?: string }): Promise<void> {
  const spinner = ora('Creating backup...').start();
  try {
    await requireAuth(spinner);

    const body: Record<string, string> = {};
    if (options.name) body.name = options.name;

    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/backups`, body);

    if (!response.data.success) {
      spinner.fail('Failed to create backup');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const backup = response.data.backup;
    spinner.succeed('Backup created');

    printKeyValue([
      ['ID', backup.id],
      ['Name', backup.name || '-'],
      ['Status', statusColor(backup.status || 'creating')],
    ]);
  } catch (error) {
    handleError(spinner, error, 'create backup');
  }
}

async function dbBackupRestore(databaseId: string, backupId: string): Promise<void> {
  const spinner = ora('Restoring from backup...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.post(
      `${DB_API_PREFIX}/${databaseId}/backups/${backupId}/restore`
    );

    if (!response.data.success) {
      spinner.fail('Failed to restore backup');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed(`Backup ${backupId} restored to database ${databaseId}`);
  } catch (error) {
    handleError(spinner, error, 'restore backup');
  }
}

async function dbBranches(databaseId: string): Promise<void> {
  const spinner = ora('Fetching branches...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/branches`);

    if (!response.data.success) {
      spinner.fail('Failed to fetch branches');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const branches = response.data.branches || [];
    spinner.succeed(`Found ${branches.length} branch(es)`);

    if (branches.length === 0) {
      process.stdout.write(chalk.gray('\nNo branches found\n\n'));
      return;
    }

    const rows = branches.map((b: any) => [
      b.id || '-',
      b.name,
      statusColor(b.status || 'unknown'),
      b.createdAt ? formatDate(b.createdAt) : '-',
    ]);

    printTable(['ID', 'Name', 'Status', 'Created'], rows);
  } catch (error) {
    handleError(spinner, error, 'fetch branches');
  }
}

async function dbBranchCreate(databaseId: string, options: { name: string }): Promise<void> {
  if (!options.name) {
    process.stderr.write(chalk.red('\nError: --name is required\n'));
    process.exit(1);
  }

  const spinner = ora(`Creating branch "${options.name}"...`).start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/branches`, {
      name: options.name,
    });

    if (!response.data.success) {
      spinner.fail('Failed to create branch');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const branch = response.data.branch;
    spinner.succeed(`Branch "${branch.name}" created`);

    printKeyValue([
      ['ID', branch.id],
      ['Name', branch.name],
      ['Status', statusColor(branch.status || 'creating')],
    ]);
  } catch (error) {
    handleError(spinner, error, 'create branch');
  }
}

async function dbLogs(databaseId: string): Promise<void> {
  const spinner = ora('Fetching database logs...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/logs`);

    if (!response.data.success) {
      spinner.fail('Failed to fetch logs');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const logs = response.data.logs || [];
    spinner.succeed(`Fetched ${logs.length} log entries`);

    if (logs.length === 0) {
      process.stdout.write(chalk.gray('\nNo log entries found\n\n'));
      return;
    }

    process.stdout.write('\n');
    for (const entry of logs) {
      if (typeof entry === 'string') {
        process.stdout.write(`${entry}\n`);
      } else {
        const ts = entry.timestamp ? chalk.gray(`[${formatDate(entry.timestamp)}] `) : '';
        const level = entry.level
          ? (entry.level === 'error' ? chalk.red(entry.level.toUpperCase()) :
            entry.level === 'warn' ? chalk.yellow(entry.level.toUpperCase()) :
              chalk.gray(entry.level.toUpperCase())) + ' '
          : '';
        process.stdout.write(`${ts}${level}${entry.message || JSON.stringify(entry)}\n`);
      }
    }
    process.stdout.write('\n');
  } catch (error) {
    handleError(spinner, error, 'fetch logs');
  }
}

async function dbExtensions(databaseId: string): Promise<void> {
  const spinner = ora('Fetching extensions...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/extensions`);

    if (!response.data.success) {
      spinner.fail('Failed to fetch extensions');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const extensions = response.data.extensions || [];
    spinner.succeed(`Found ${extensions.length} extension(s)`);

    if (extensions.length === 0) {
      process.stdout.write(chalk.gray('\nNo extensions installed\n\n'));
      return;
    }

    const rows = extensions.map((ext: any) => [
      ext.name || String(ext),
      ext.version || '-',
      ext.description || '-',
    ]);

    printTable(['Extension', 'Version', 'Description'], rows);
  } catch (error) {
    handleError(spinner, error, 'fetch extensions');
  }
}

async function dbPooling(databaseId: string): Promise<void> {
  const spinner = ora('Fetching pooling status...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/pooling/status`);

    if (!response.data.success) {
      spinner.fail('Failed to fetch pooling status');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const pooling = response.data.pooling;
    spinner.succeed('Connection pooling status retrieved');

    const pairs: [string, string][] = Object.entries(pooling).map(([key, value]) => {
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase())
        .trim();
      return [label, String(value)];
    });

    printKeyValue(pairs);
  } catch (error) {
    handleError(spinner, error, 'fetch pooling status');
  }
}

// ── Command registration ────────────────────────────────────────────────────

export function registerDbCommand(program: Command): void {
  const db = program
    .command('db')
    .description('Manage ScalixDB databases');

  // db list
  db.command('list')
    .alias('ls')
    .description('List all databases')
    .action(dbList);

  // db create
  db.command('create')
    .description('Create a new database')
    .requiredOption('--name <name>', 'Database name')
    .option('--plan <plan>', 'Database plan (e.g. free, starter, pro, enterprise)')
    .option('--region <region>', 'Deployment region (e.g. us-east-1, eu-west-1)')
    .action(dbCreate);

  // db info
  db.command('info')
    .description('Show database details')
    .argument('<databaseId>', 'Database ID')
    .action(dbInfo);

  // db delete
  db.command('delete')
    .alias('rm')
    .description('Delete a database')
    .argument('<databaseId>', 'Database ID')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(dbDelete);

  // db query
  db.command('query')
    .description('Execute a SQL query')
    .argument('<databaseId>', 'Database ID')
    .requiredOption('--sql <sql>', 'SQL query to execute')
    .action(dbQuery);

  // db tables
  db.command('tables')
    .description('List tables in a database')
    .argument('<databaseId>', 'Database ID')
    .action(dbTables);

  // db metrics
  db.command('metrics')
    .description('Show database metrics')
    .argument('<databaseId>', 'Database ID')
    .action(dbMetrics);

  // db connection
  db.command('connection')
    .description('Show connection string')
    .argument('<databaseId>', 'Database ID')
    .action(dbConnection);

  // db backup (sub-group)
  const backup = db
    .command('backup')
    .description('Manage database backups');

  backup
    .command('list')
    .alias('ls')
    .description('List backups')
    .argument('<databaseId>', 'Database ID')
    .action(dbBackupList);

  backup
    .command('create')
    .description('Create a backup')
    .argument('<databaseId>', 'Database ID')
    .option('--name <name>', 'Backup name')
    .action(dbBackupCreate);

  backup
    .command('restore')
    .description('Restore a backup')
    .argument('<databaseId>', 'Database ID')
    .argument('<backupId>', 'Backup ID')
    .action(dbBackupRestore);

  // db branches
  db.command('branches')
    .description('List database branches')
    .argument('<databaseId>', 'Database ID')
    .action(dbBranches);

  // db branch (sub-group)
  const branch = db
    .command('branch')
    .description('Manage database branches');

  branch
    .command('create')
    .description('Create a branch')
    .argument('<databaseId>', 'Database ID')
    .requiredOption('--name <name>', 'Branch name')
    .action(dbBranchCreate);

  // db logs
  db.command('logs')
    .description('Show database logs')
    .argument('<databaseId>', 'Database ID')
    .action(dbLogs);

  // db extensions
  db.command('extensions')
    .description('List installed extensions')
    .argument('<databaseId>', 'Database ID')
    .action(dbExtensions);

  // db pooling
  db.command('pooling')
    .description('Show connection pooling status')
    .argument('<databaseId>', 'Database ID')
    .action(dbPooling);
}
