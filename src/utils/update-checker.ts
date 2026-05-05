import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { CLI_VERSION } from './constants';

const PACKAGE_NAME = '@scalix-world/hosting';
const REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;
const CONFIG_DIR = path.join(os.homedir(), '.scalix');
const CACHE_FILE = path.join(CONFIG_DIR, 'hosting-update-check.json');

interface UpdateCache {
  lastCheck: number;
  latestVersion: string;
}

function semverGt(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

function readCacheSync(): UpdateCache | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.lastCheck === 'number' && typeof parsed.latestVersion === 'string') {
      return parsed as UpdateCache;
    }
  } catch {}
  return null;
}

async function writeCache(cache: UpdateCache): Promise<void> {
  await fsp.mkdir(CONFIG_DIR, { recursive: true });
  await fsp.writeFile(CACHE_FILE, JSON.stringify(cache), { encoding: 'utf-8', mode: 0o600 });
}

export async function checkForUpdate(): Promise<void> {
  if (process.env.NO_UPDATE_NOTIFIER) return;

  const cached = readCacheSync();
  const now = Date.now();

  if (cached && (now - cached.lastCheck) < CHECK_INTERVAL_MS) {
    if (semverGt(cached.latestVersion, CLI_VERSION)) {
      printBanner(cached.latestVersion);
    }
    return;
  }

  try {
    const res = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return;
    const data = await res.json() as { version?: string };
    const latest = data.version;
    if (!latest) return;

    await writeCache({ lastCheck: now, latestVersion: latest }).catch(() => {});

    if (semverGt(latest, CLI_VERSION)) {
      printBanner(latest);
    }
  } catch {}
}

function printBanner(latest: string): void {
  const line1 = `  Update available: ${chalk.dim(CLI_VERSION)} → ${chalk.green(latest)}`;
  const line2 = `  npm install -g ${PACKAGE_NAME}@latest`;
  console.error('');
  console.error(chalk.yellow(`╭${'─'.repeat(50)}╮`));
  console.error(chalk.yellow(`│`) + line1.padEnd(60) + chalk.yellow(`│`));
  console.error(chalk.yellow(`│`) + `  ${chalk.bold(line2)}`.padEnd(60) + chalk.yellow(`│`));
  console.error(chalk.yellow(`╰${'─'.repeat(50)}╯`));
  console.error('');
}
