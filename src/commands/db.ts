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

// ── Database update ─────────────────────────────────────────────────────────

async function dbUpdate(databaseId: string, options: { name?: string; plan?: string }): Promise<void> {
  const spinner = ora('Updating database...').start();
  try {
    await requireAuth(spinner);

    const body: Record<string, string> = {};
    if (options.name) body.name = options.name;
    if (options.plan) body.plan = options.plan;

    if (Object.keys(body).length === 0) {
      spinner.fail('No update options provided');
      process.stderr.write(chalk.red('\nProvide at least one of: --name, --plan\n'));
      process.exit(1);
    }

    const response = await apiClient.patch(`${DB_API_PREFIX}/${databaseId}`, body);

    if (!response.data.success) {
      spinner.fail('Failed to update database');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const db = response.data.database;
    spinner.succeed('Database updated');

    printKeyValue([
      ['ID', db.id],
      ['Name', db.name],
      ['Status', statusColor(db.status || 'unknown')],
      ['Plan', db.plan || '-'],
    ]);
  } catch (error) {
    handleError(spinner, error, 'update database');
  }
}

// ── Branch management ───────────────────────────────────────────────────────

async function dbBranchDelete(databaseId: string, branchId: string, options: { force?: boolean }): Promise<void> {
  const spinner = ora('Preparing to delete branch...').start();
  try {
    await requireAuth(spinner);

    if (!options.force) {
      spinner.stop();
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Delete branch "${branchId}" from database ${databaseId}? This cannot be undone.`,
        default: false,
      }]);
      if (!confirm) {
        process.stdout.write(chalk.gray('\nDeletion cancelled\n'));
        return;
      }
      spinner.start('Deleting branch...');
    }

    const response = await apiClient.delete(`${DB_API_PREFIX}/${databaseId}/branches/${branchId}`);

    if (!response.data.success) {
      spinner.fail('Failed to delete branch');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed(`Branch ${branchId} deleted`);
  } catch (error) {
    handleError(spinner, error, 'delete branch');
  }
}

async function dbBranchMask(databaseId: string, branchId: string): Promise<void> {
  const spinner = ora('Masking branch data...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/branches/${branchId}/mask`);

    if (!response.data.success) {
      spinner.fail('Failed to mask branch');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed(`Branch ${branchId} data masked`);
  } catch (error) {
    handleError(spinner, error, 'mask branch');
  }
}

// ── Backup management ───────────────────────────────────────────────────────

async function dbBackupDelete(databaseId: string, backupId: string, options: { force?: boolean }): Promise<void> {
  const spinner = ora('Preparing to delete backup...').start();
  try {
    await requireAuth(spinner);

    if (!options.force) {
      spinner.stop();
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Delete backup "${backupId}"? This cannot be undone.`,
        default: false,
      }]);
      if (!confirm) {
        process.stdout.write(chalk.gray('\nDeletion cancelled\n'));
        return;
      }
      spinner.start('Deleting backup...');
    }

    const response = await apiClient.delete(`${DB_API_PREFIX}/${databaseId}/backups/${backupId}`);

    if (!response.data.success) {
      spinner.fail('Failed to delete backup');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed(`Backup ${backupId} deleted`);
  } catch (error) {
    handleError(spinner, error, 'delete backup');
  }
}

async function dbBackupSchedule(databaseId: string, options: { cron: string; retention?: string }): Promise<void> {
  const spinner = ora('Setting backup schedule...').start();
  try {
    await requireAuth(spinner);

    const body: Record<string, string> = { cron: options.cron };
    if (options.retention) body.retention = options.retention;

    const response = await apiClient.put(`${DB_API_PREFIX}/${databaseId}/backups/schedule`, body);

    if (!response.data.success) {
      spinner.fail('Failed to set backup schedule');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Backup schedule configured');

    const schedule = response.data.schedule || response.data;
    const pairs: [string, string][] = Object.entries(schedule)
      .filter(([k]) => k !== 'success')
      .map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
        return [label, String(value)];
      });
    if (pairs.length) printKeyValue(pairs);
  } catch (error) {
    handleError(spinner, error, 'set backup schedule');
  }
}

// ── PITR (Point-in-Time Recovery) ───────────────────────────────────────────

async function dbPitrEnable(databaseId: string): Promise<void> {
  const spinner = ora('Enabling Point-in-Time Recovery...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/pitr/enable`);

    if (!response.data.success) {
      spinner.fail('Failed to enable PITR');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Point-in-Time Recovery enabled');
  } catch (error) {
    handleError(spinner, error, 'enable PITR');
  }
}

async function dbPitrRestorePoints(databaseId: string): Promise<void> {
  const spinner = ora('Fetching restore points...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/pitr/restore-points`);

    if (!response.data.success) {
      spinner.fail('Failed to fetch restore points');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const points = response.data.restorePoints || response.data.restore_points || [];
    spinner.succeed(`Found ${points.length} restore point(s)`);

    if (points.length === 0) {
      process.stdout.write(chalk.gray('\nNo restore points available\n\n'));
      return;
    }

    const rows = points.map((p: any) => [
      p.id || '-',
      p.timestamp ? formatDate(p.timestamp) : '-',
      p.size || '-',
      statusColor(p.status || 'available'),
    ]);

    printTable(['ID', 'Timestamp', 'Size', 'Status'], rows);
  } catch (error) {
    handleError(spinner, error, 'fetch restore points');
  }
}

async function dbPitrRestore(databaseId: string, options: { timestamp: string; target?: string }): Promise<void> {
  const spinner = ora('Restoring to point in time...').start();
  try {
    await requireAuth(spinner);

    spinner.stop();
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Restore database ${databaseId} to ${options.timestamp}? This will overwrite current data.`,
      default: false,
    }]);
    if (!confirm) {
      process.stdout.write(chalk.gray('\nRestore cancelled\n'));
      return;
    }
    spinner.start('Restoring...');

    const body: Record<string, string> = { timestamp: options.timestamp };
    if (options.target) body.targetDatabaseId = options.target;

    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/pitr/restore`, body);

    if (!response.data.success) {
      spinner.fail('Failed to restore');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed(`Database restored to ${options.timestamp}`);
  } catch (error) {
    handleError(spinner, error, 'restore database');
  }
}

// ── Encryption ──────────────────────────────────────────────────────────────

async function dbEncryptionVerify(databaseId: string): Promise<void> {
  const spinner = ora('Verifying encryption...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/encryption/verify`);

    if (!response.data.success) {
      spinner.fail('Failed to verify encryption');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Encryption status retrieved');

    const enc = response.data.encryption || response.data;
    const pairs: [string, string][] = Object.entries(enc)
      .filter(([k]) => k !== 'success')
      .map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
        return [label, String(value)];
      });
    if (pairs.length) printKeyValue(pairs);
  } catch (error) {
    handleError(spinner, error, 'verify encryption');
  }
}

async function dbEncryptionUpdate(databaseId: string, options: { algorithm?: string; keyId?: string }): Promise<void> {
  const spinner = ora('Updating encryption settings...').start();
  try {
    await requireAuth(spinner);

    const body: Record<string, string> = {};
    if (options.algorithm) body.algorithm = options.algorithm;
    if (options.keyId) body.keyId = options.keyId;

    const response = await apiClient.put(`${DB_API_PREFIX}/${databaseId}/encryption`, body);

    if (!response.data.success) {
      spinner.fail('Failed to update encryption');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Encryption settings updated');
  } catch (error) {
    handleError(spinner, error, 'update encryption');
  }
}

async function dbEncryptionRotate(databaseId: string): Promise<void> {
  const spinner = ora('Rotating encryption key...').start();
  try {
    await requireAuth(spinner);

    spinner.stop();
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Rotate encryption key for database ${databaseId}? Active connections may be briefly interrupted.`,
      default: false,
    }]);
    if (!confirm) {
      process.stdout.write(chalk.gray('\nKey rotation cancelled\n'));
      return;
    }
    spinner.start('Rotating key...');

    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/encryption/rotate`);

    if (!response.data.success) {
      spinner.fail('Failed to rotate encryption key');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Encryption key rotated');
  } catch (error) {
    handleError(spinner, error, 'rotate encryption key');
  }
}

// ── High Availability ───────────────────────────────────────────────────────

async function dbHaStatus(databaseId: string): Promise<void> {
  const spinner = ora('Fetching HA status...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/ha/status`);

    if (!response.data.success) {
      spinner.fail('Failed to fetch HA status');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('High Availability status retrieved');

    const ha = response.data.ha || response.data;
    const pairs: [string, string][] = Object.entries(ha)
      .filter(([k]) => k !== 'success')
      .map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
        return [label, String(value)];
      });
    if (pairs.length) printKeyValue(pairs);
  } catch (error) {
    handleError(spinner, error, 'fetch HA status');
  }
}

async function dbHaEnable(databaseId: string): Promise<void> {
  const spinner = ora('Enabling High Availability...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/ha/enable`);

    if (!response.data.success) {
      spinner.fail('Failed to enable HA');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('High Availability enabled');
  } catch (error) {
    handleError(spinner, error, 'enable HA');
  }
}

async function dbHaDisable(databaseId: string): Promise<void> {
  const spinner = ora('Disabling High Availability...').start();
  try {
    await requireAuth(spinner);

    spinner.stop();
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Disable High Availability for database ${databaseId}? This removes failover protection.`,
      default: false,
    }]);
    if (!confirm) {
      process.stdout.write(chalk.gray('\nCancelled\n'));
      return;
    }
    spinner.start('Disabling HA...');

    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/ha/disable`);

    if (!response.data.success) {
      spinner.fail('Failed to disable HA');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('High Availability disabled');
  } catch (error) {
    handleError(spinner, error, 'disable HA');
  }
}

// ── Connection Pooling (expanded) ───────────────────────────────────────────

async function dbPoolingEnable(databaseId: string): Promise<void> {
  const spinner = ora('Enabling connection pooling...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/pooling/enable`);

    if (!response.data.success) {
      spinner.fail('Failed to enable pooling');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Connection pooling enabled');
  } catch (error) {
    handleError(spinner, error, 'enable connection pooling');
  }
}

async function dbPoolingDisable(databaseId: string): Promise<void> {
  const spinner = ora('Disabling connection pooling...').start();
  try {
    await requireAuth(spinner);

    spinner.stop();
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Disable connection pooling for database ${databaseId}? Active pooled connections will be dropped.`,
      default: false,
    }]);
    if (!confirm) {
      process.stdout.write(chalk.gray('\nCancelled\n'));
      return;
    }
    spinner.start('Disabling pooling...');

    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/pooling/disable`);

    if (!response.data.success) {
      spinner.fail('Failed to disable pooling');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Connection pooling disabled');
  } catch (error) {
    handleError(spinner, error, 'disable connection pooling');
  }
}

async function dbPoolingStats(databaseId: string): Promise<void> {
  const spinner = ora('Fetching pooling statistics...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.get(`${DB_API_PREFIX}/${databaseId}/pooling/stats`);

    if (!response.data.success) {
      spinner.fail('Failed to fetch pooling stats');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Pooling statistics retrieved');

    const stats = response.data.stats || response.data;
    const pairs: [string, string][] = Object.entries(stats)
      .filter(([k]) => k !== 'success')
      .map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
        return [label, String(value)];
      });
    if (pairs.length) printKeyValue(pairs);
  } catch (error) {
    handleError(spinner, error, 'fetch pooling stats');
  }
}

async function dbPoolingConfig(databaseId: string, options: { mode?: string; size?: string; timeout?: string }): Promise<void> {
  const spinner = ora('Updating pooling configuration...').start();
  try {
    await requireAuth(spinner);

    const body: Record<string, string | number> = {};
    if (options.mode) body.mode = options.mode;
    if (options.size) body.poolSize = parseInt(options.size, 10);
    if (options.timeout) body.idleTimeout = parseInt(options.timeout, 10);

    const response = await apiClient.put(`${DB_API_PREFIX}/${databaseId}/pooling/config`, body);

    if (!response.data.success) {
      spinner.fail('Failed to update pooling config');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Pooling configuration updated');
  } catch (error) {
    handleError(spinner, error, 'update pooling config');
  }
}

// ── Query explain ───────────────────────────────────────────────────────────

async function dbExplain(databaseId: string, options: { sql: string }): Promise<void> {
  if (!options.sql) {
    process.stderr.write(chalk.red('\nError: --sql is required\n'));
    process.exit(1);
  }

  const spinner = ora('Analyzing query plan...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/explain`, {
      sql: options.sql,
    });

    if (!response.data.success) {
      spinner.fail('Explain failed');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Query plan retrieved');

    const plan = response.data.plan || response.data.queryPlan;
    if (typeof plan === 'string') {
      process.stdout.write(`\n${plan}\n\n`);
    } else if (Array.isArray(plan)) {
      for (const line of plan) {
        process.stdout.write(`${typeof line === 'string' ? line : JSON.stringify(line)}\n`);
      }
      process.stdout.write('\n');
    } else if (plan) {
      process.stdout.write(`\n${JSON.stringify(plan, null, 2)}\n\n`);
    }
  } catch (error) {
    handleError(spinner, error, 'explain query');
  }
}

// ── Table browsing ──────────────────────────────────────────────────────────

async function dbTableColumns(databaseId: string, tableName: string, options: { schema?: string }): Promise<void> {
  const spinner = ora(`Fetching columns for "${tableName}"...`).start();
  try {
    await requireAuth(spinner);

    const params: Record<string, string> = {};
    if (options.schema) params.schema = options.schema;

    const qs = new URLSearchParams(params).toString();
    const url = `${DB_API_PREFIX}/${databaseId}/tables/${encodeURIComponent(tableName)}/columns${qs ? `?${qs}` : ''}`;
    const response = await apiClient.get(url);

    if (!response.data.success) {
      spinner.fail('Failed to fetch columns');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const columns = response.data.columns || [];
    spinner.succeed(`Found ${columns.length} column(s) in "${tableName}"`);

    if (columns.length === 0) {
      process.stdout.write(chalk.gray('\nNo columns found\n\n'));
      return;
    }

    const rows = columns.map((c: any) => [
      c.name || c.column_name || '-',
      c.type || c.data_type || '-',
      c.nullable === false ? 'NOT NULL' : 'NULL',
      c.default_value || c.column_default || '-',
      c.is_primary_key || c.isPrimaryKey ? chalk.green('PK') : '-',
    ]);

    printTable(['Column', 'Type', 'Nullable', 'Default', 'Key'], rows);
  } catch (error) {
    handleError(spinner, error, 'fetch columns');
  }
}

async function dbTableRows(
  databaseId: string,
  tableName: string,
  options: { schema?: string; limit?: string; offset?: string; orderBy?: string; orderDir?: string },
): Promise<void> {
  const spinner = ora(`Fetching rows from "${tableName}"...`).start();
  try {
    await requireAuth(spinner);

    const params = new URLSearchParams();
    if (options.schema) params.set('schema', options.schema);
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    if (options.orderBy) params.set('orderBy', options.orderBy);
    if (options.orderDir) params.set('orderDir', options.orderDir);

    const qs = params.toString();
    const url = `${DB_API_PREFIX}/${databaseId}/tables/${encodeURIComponent(tableName)}/rows${qs ? `?${qs}` : ''}`;
    const response = await apiClient.get(url);

    if (!response.data.success) {
      spinner.fail('Failed to fetch rows');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const dataRows = response.data.rows || [];
    const total = response.data.total ?? dataRows.length;
    spinner.succeed(`Fetched ${dataRows.length} row(s) (total: ${total})`);

    if (dataRows.length === 0) {
      process.stdout.write(chalk.gray('\nNo rows found\n\n'));
      return;
    }

    const columns = Object.keys(dataRows[0]);
    const tableRows = dataRows.map((row: any) =>
      columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return chalk.gray('NULL');
        return String(val);
      }),
    );

    printTable(columns, tableRows);
  } catch (error) {
    handleError(spinner, error, 'fetch rows');
  }
}

async function dbTableInsert(databaseId: string, tableName: string, options: { data: string; schema?: string }): Promise<void> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(options.data);
  } catch {
    process.stderr.write(chalk.red('\nError: --data must be valid JSON\n'));
    process.exit(1);
  }

  const spinner = ora(`Inserting row into "${tableName}"...`).start();
  try {
    await requireAuth(spinner);

    const body: Record<string, unknown> = { ...parsed };
    if (options.schema) body._schema = options.schema;

    const response = await apiClient.post(
      `${DB_API_PREFIX}/${databaseId}/tables/${encodeURIComponent(tableName)}/rows`,
      body,
    );

    if (!response.data.success) {
      spinner.fail('Failed to insert row');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Row inserted');
  } catch (error) {
    handleError(spinner, error, 'insert row');
  }
}

async function dbTableUpdate(
  databaseId: string,
  tableName: string,
  options: { data: string; where: string; schema?: string },
): Promise<void> {
  let parsedData: Record<string, unknown>;
  let parsedWhere: Record<string, unknown>;
  try {
    parsedData = JSON.parse(options.data);
    parsedWhere = JSON.parse(options.where);
  } catch {
    process.stderr.write(chalk.red('\nError: --data and --where must be valid JSON\n'));
    process.exit(1);
  }

  const spinner = ora(`Updating rows in "${tableName}"...`).start();
  try {
    await requireAuth(spinner);

    const body: Record<string, unknown> = { data: parsedData, where: parsedWhere };
    if (options.schema) body.schema = options.schema;

    const response = await apiClient.put(
      `${DB_API_PREFIX}/${databaseId}/tables/${encodeURIComponent(tableName)}/rows`,
      body,
    );

    if (!response.data.success) {
      spinner.fail('Failed to update rows');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const count = response.data.rowCount ?? response.data.affected ?? '?';
    spinner.succeed(`${count} row(s) updated`);
  } catch (error) {
    handleError(spinner, error, 'update rows');
  }
}

async function dbTableDeleteRows(
  databaseId: string,
  tableName: string,
  options: { where: string; force?: boolean; schema?: string },
): Promise<void> {
  let parsedWhere: Record<string, unknown>;
  try {
    parsedWhere = JSON.parse(options.where);
  } catch {
    process.stderr.write(chalk.red('\nError: --where must be valid JSON\n'));
    process.exit(1);
  }

  const spinner = ora(`Deleting rows from "${tableName}"...`).start();
  try {
    await requireAuth(spinner);

    if (!options.force) {
      spinner.stop();
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Delete rows from "${tableName}" matching ${options.where}?`,
        default: false,
      }]);
      if (!confirm) {
        process.stdout.write(chalk.gray('\nDeletion cancelled\n'));
        return;
      }
      spinner.start('Deleting rows...');
    }

    const body: Record<string, unknown> = { where: parsedWhere };
    if (options.schema) body.schema = options.schema;

    const response = await apiClient.delete(
      `${DB_API_PREFIX}/${databaseId}/tables/${encodeURIComponent(tableName)}/rows`,
      { data: body },
    );

    if (!response.data.success) {
      spinner.fail('Failed to delete rows');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const count = response.data.rowCount ?? response.data.affected ?? '?';
    spinner.succeed(`${count} row(s) deleted`);
  } catch (error) {
    handleError(spinner, error, 'delete rows');
  }
}

// ── Extensions management ───────────────────────────────────────────────────

async function dbExtensionEnable(databaseId: string, extensionName: string): Promise<void> {
  const spinner = ora(`Enabling extension "${extensionName}"...`).start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.post(
      `${DB_API_PREFIX}/${databaseId}/extensions/${encodeURIComponent(extensionName)}/enable`,
    );

    if (!response.data.success) {
      spinner.fail('Failed to enable extension');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed(`Extension "${extensionName}" enabled`);
  } catch (error) {
    handleError(spinner, error, 'enable extension');
  }
}

async function dbExtensionDisable(databaseId: string, extensionName: string): Promise<void> {
  const spinner = ora(`Disabling extension "${extensionName}"...`).start();
  try {
    await requireAuth(spinner);

    const response = await apiClient.post(
      `${DB_API_PREFIX}/${databaseId}/extensions/${encodeURIComponent(extensionName)}/disable`,
    );

    if (!response.data.success) {
      spinner.fail('Failed to disable extension');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed(`Extension "${extensionName}" disabled`);
  } catch (error) {
    handleError(spinner, error, 'disable extension');
  }
}

// ── Import / Migration ──────────────────────────────────────────────────────

async function dbImportSql(databaseId: string, options: { sql: string }): Promise<void> {
  if (!options.sql) {
    process.stderr.write(chalk.red('\nError: --sql is required\n'));
    process.exit(1);
  }

  const spinner = ora('Importing SQL...').start();
  try {
    await requireAuth(spinner);
    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/import/sql`, {
      sql: options.sql,
    });

    if (!response.data.success) {
      spinner.fail('SQL import failed');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('SQL imported successfully');
  } catch (error) {
    handleError(spinner, error, 'import SQL');
  }
}

async function dbImportCsv(databaseId: string, options: { table: string; data: string; schema?: string }): Promise<void> {
  if (!options.table || !options.data) {
    process.stderr.write(chalk.red('\nError: --table and --data are required\n'));
    process.exit(1);
  }

  const spinner = ora(`Importing CSV into "${options.table}"...`).start();
  try {
    await requireAuth(spinner);

    const body: Record<string, string> = { table: options.table, csvData: options.data };
    if (options.schema) body.schema = options.schema;

    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/import/csv`, body);

    if (!response.data.success) {
      spinner.fail('CSV import failed');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    const count = response.data.rowsImported ?? response.data.rows ?? '?';
    spinner.succeed(`${count} row(s) imported into "${options.table}"`);
  } catch (error) {
    handleError(spinner, error, 'import CSV');
  }
}

// ── Credentials ─────────────────────────────────────────────────────────────

async function dbCredentialsRotate(databaseId: string): Promise<void> {
  const spinner = ora('Rotating database credentials...').start();
  try {
    await requireAuth(spinner);

    spinner.stop();
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Rotate credentials for database ${databaseId}? Existing connection strings will stop working.`,
      default: false,
    }]);
    if (!confirm) {
      process.stdout.write(chalk.gray('\nRotation cancelled\n'));
      return;
    }
    spinner.start('Rotating credentials...');

    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/credentials/rotate`);

    if (!response.data.success) {
      spinner.fail('Failed to rotate credentials');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Credentials rotated');

    const conn = response.data.connection;
    if (conn?.connectionString) {
      process.stdout.write(`\n  ${chalk.bold('New Connection String')}\n`);
      process.stdout.write(`  ${conn.connectionString}\n\n`);
    }
  } catch (error) {
    handleError(spinner, error, 'rotate credentials');
  }
}

// ── Connection reset ────────────────────────────────────────────────────────

async function dbConnectionReset(databaseId: string): Promise<void> {
  const spinner = ora('Resetting database connection...').start();
  try {
    await requireAuth(spinner);

    spinner.stop();
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Reset connection for database ${databaseId}? All active connections will be terminated.`,
      default: false,
    }]);
    if (!confirm) {
      process.stdout.write(chalk.gray('\nReset cancelled\n'));
      return;
    }
    spinner.start('Resetting connection...');

    const response = await apiClient.post(`${DB_API_PREFIX}/${databaseId}/connection/reset`);

    if (!response.data.success) {
      spinner.fail('Failed to reset connection');
      process.stderr.write(chalk.red(`\n${response.data.error || 'Unknown error'}\n`));
      process.exit(1);
    }

    spinner.succeed('Connection reset');

    if (response.data.connectionString) {
      process.stdout.write(`\n  ${chalk.bold('Connection String')}\n`);
      process.stdout.write(`  ${response.data.connectionString}\n\n`);
    }
  } catch (error) {
    handleError(spinner, error, 'reset connection');
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

  // db pooling (sub-group — replaces standalone pooling status)
  const pooling = db
    .command('pooling')
    .description('Manage connection pooling');

  pooling
    .command('status')
    .description('Show connection pooling status')
    .argument('<databaseId>', 'Database ID')
    .action(dbPooling);

  pooling
    .command('enable')
    .description('Enable connection pooling')
    .argument('<databaseId>', 'Database ID')
    .action(dbPoolingEnable);

  pooling
    .command('disable')
    .description('Disable connection pooling')
    .argument('<databaseId>', 'Database ID')
    .action(dbPoolingDisable);

  pooling
    .command('stats')
    .description('Show pooling statistics')
    .argument('<databaseId>', 'Database ID')
    .action(dbPoolingStats);

  pooling
    .command('config')
    .description('Update pooling configuration')
    .argument('<databaseId>', 'Database ID')
    .option('--mode <mode>', 'Pooling mode (transaction, session, statement)')
    .option('--size <size>', 'Pool size')
    .option('--timeout <timeout>', 'Idle timeout in seconds')
    .action(dbPoolingConfig);

  // db update
  db.command('update')
    .description('Update database settings')
    .argument('<databaseId>', 'Database ID')
    .option('--name <name>', 'New database name')
    .option('--plan <plan>', 'New plan')
    .action(dbUpdate);

  // db branch (expanded)
  branch
    .command('delete')
    .alias('rm')
    .description('Delete a branch')
    .argument('<databaseId>', 'Database ID')
    .argument('<branchId>', 'Branch ID')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(dbBranchDelete);

  branch
    .command('mask')
    .description('Mask sensitive data in a branch')
    .argument('<databaseId>', 'Database ID')
    .argument('<branchId>', 'Branch ID')
    .action(dbBranchMask);

  // db backup (expanded)
  backup
    .command('delete')
    .alias('rm')
    .description('Delete a backup')
    .argument('<databaseId>', 'Database ID')
    .argument('<backupId>', 'Backup ID')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(dbBackupDelete);

  backup
    .command('schedule')
    .description('Set backup schedule')
    .argument('<databaseId>', 'Database ID')
    .requiredOption('--cron <cron>', 'Cron expression for schedule')
    .option('--retention <retention>', 'Retention period (e.g. 7d, 30d)')
    .action(dbBackupSchedule);

  // db pitr (sub-group)
  const pitr = db
    .command('pitr')
    .description('Point-in-Time Recovery');

  pitr
    .command('enable')
    .description('Enable PITR')
    .argument('<databaseId>', 'Database ID')
    .action(dbPitrEnable);

  pitr
    .command('restore-points')
    .alias('ls')
    .description('List available restore points')
    .argument('<databaseId>', 'Database ID')
    .action(dbPitrRestorePoints);

  pitr
    .command('restore')
    .description('Restore to a point in time')
    .argument('<databaseId>', 'Database ID')
    .requiredOption('--timestamp <timestamp>', 'ISO 8601 timestamp to restore to')
    .option('--target <targetId>', 'Target database ID (restore to a different database)')
    .action(dbPitrRestore);

  // db encryption (sub-group)
  const encryption = db
    .command('encryption')
    .description('Manage encryption');

  encryption
    .command('verify')
    .description('Verify encryption status')
    .argument('<databaseId>', 'Database ID')
    .action(dbEncryptionVerify);

  encryption
    .command('update')
    .description('Update encryption settings')
    .argument('<databaseId>', 'Database ID')
    .option('--algorithm <algorithm>', 'Encryption algorithm')
    .option('--key-id <keyId>', 'KMS key ID')
    .action(dbEncryptionUpdate);

  encryption
    .command('rotate')
    .description('Rotate encryption key')
    .argument('<databaseId>', 'Database ID')
    .action(dbEncryptionRotate);

  // db ha (sub-group)
  const ha = db
    .command('ha')
    .description('High Availability');

  ha
    .command('status')
    .description('Show HA status')
    .argument('<databaseId>', 'Database ID')
    .action(dbHaStatus);

  ha
    .command('enable')
    .description('Enable High Availability')
    .argument('<databaseId>', 'Database ID')
    .action(dbHaEnable);

  ha
    .command('disable')
    .description('Disable High Availability')
    .argument('<databaseId>', 'Database ID')
    .action(dbHaDisable);

  // db explain
  db.command('explain')
    .description('Show query execution plan')
    .argument('<databaseId>', 'Database ID')
    .requiredOption('--sql <sql>', 'SQL query to explain')
    .action(dbExplain);

  // db table (sub-group)
  const table = db
    .command('table')
    .description('Browse and manage table data');

  table
    .command('columns')
    .description('List table columns')
    .argument('<databaseId>', 'Database ID')
    .argument('<tableName>', 'Table name')
    .option('--schema <schema>', 'Schema name (default: public)')
    .action(dbTableColumns);

  table
    .command('rows')
    .description('Browse table rows')
    .argument('<databaseId>', 'Database ID')
    .argument('<tableName>', 'Table name')
    .option('--schema <schema>', 'Schema name')
    .option('--limit <limit>', 'Max rows to return')
    .option('--offset <offset>', 'Row offset')
    .option('--order-by <column>', 'Order by column')
    .option('--order-dir <dir>', 'Order direction (asc, desc)')
    .action(dbTableRows);

  table
    .command('insert')
    .description('Insert a row')
    .argument('<databaseId>', 'Database ID')
    .argument('<tableName>', 'Table name')
    .requiredOption('--data <json>', 'Row data as JSON')
    .option('--schema <schema>', 'Schema name')
    .action(dbTableInsert);

  table
    .command('update')
    .description('Update rows')
    .argument('<databaseId>', 'Database ID')
    .argument('<tableName>', 'Table name')
    .requiredOption('--data <json>', 'Column values to set as JSON')
    .requiredOption('--where <json>', 'Filter condition as JSON')
    .option('--schema <schema>', 'Schema name')
    .action(dbTableUpdate);

  table
    .command('delete-rows')
    .description('Delete rows')
    .argument('<databaseId>', 'Database ID')
    .argument('<tableName>', 'Table name')
    .requiredOption('--where <json>', 'Filter condition as JSON')
    .option('-f, --force', 'Skip confirmation prompt')
    .option('--schema <schema>', 'Schema name')
    .action(dbTableDeleteRows);

  // db extension (sub-group)
  const extension = db
    .command('extension')
    .description('Manage database extensions');

  extension
    .command('enable')
    .description('Enable an extension')
    .argument('<databaseId>', 'Database ID')
    .argument('<extensionName>', 'Extension name')
    .action(dbExtensionEnable);

  extension
    .command('disable')
    .description('Disable an extension')
    .argument('<databaseId>', 'Database ID')
    .argument('<extensionName>', 'Extension name')
    .action(dbExtensionDisable);

  // db import (sub-group)
  const importCmd = db
    .command('import')
    .description('Import data');

  importCmd
    .command('sql')
    .description('Import SQL statements')
    .argument('<databaseId>', 'Database ID')
    .requiredOption('--sql <sql>', 'SQL statements to import')
    .action(dbImportSql);

  importCmd
    .command('csv')
    .description('Import CSV data into a table')
    .argument('<databaseId>', 'Database ID')
    .requiredOption('--table <table>', 'Target table name')
    .requiredOption('--data <csv>', 'CSV data')
    .option('--schema <schema>', 'Schema name')
    .action(dbImportCsv);

  // db credentials
  const credentials = db
    .command('credentials')
    .description('Manage database credentials');

  credentials
    .command('rotate')
    .description('Rotate database credentials')
    .argument('<databaseId>', 'Database ID')
    .action(dbCredentialsRotate);

  // db connection reset
  db.command('connection-reset')
    .description('Reset database connection (terminates all active connections)')
    .argument('<databaseId>', 'Database ID')
    .action(dbConnectionReset);
}
