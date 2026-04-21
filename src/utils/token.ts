/**
 * Token Utils
 * Manages stored authentication tokens
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.scalix');
const TOKEN_FILE = path.join(CONFIG_DIR, 'token');

/**
 * Gets the stored authentication token
 */
export async function getToken(): Promise<string | null> {
  try {
    const token = await fs.readFile(TOKEN_FILE, 'utf8');
    return token.trim();
  } catch {
    return null;
  }
}

/**
 * Saves an authentication token
 */
export async function saveToken(token: string): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
    await fs.writeFile(TOKEN_FILE, token, { encoding: 'utf8', mode: 0o600 });
  } catch {
    // Ignore errors
  }
}

/**
 * Clears the stored authentication token
 */
export async function clearToken(): Promise<void> {
  try {
    await fs.unlink(TOKEN_FILE);
  } catch {
    // Ignore errors
  }
}
