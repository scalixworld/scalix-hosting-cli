/**
 * Environment Variable Utilities
 * Load and parse .env files
 */

import fs from 'fs/promises';

/**
 * Load environment variables from .env file
 * Supports:
 * - KEY=VALUE format
 * - Quoted values (single or double quotes)
 * - Comments (lines starting with #)
 * - Empty lines
 */
export async function loadEnvFile(filePath: string): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const envVars: Record<string, string> = {};

    // Split by newlines, handling both \n and \r\n
    const lines = content.split(/\r?\n/);
    let currentKey: string | null = null;
    let currentValue: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        // If we were building a multiline value, continue
        if (currentKey) {
          currentValue.push('');
        }
        continue;
      }

      // Check if line continues previous value (starts with space/tab after =)
      if (currentKey && /^[\s\t]/.test(line)) {
        currentValue.push(line);
        continue;
      }

      // Save previous key-value if exists
      if (currentKey) {
        const value = currentValue.join('\n').trim();
        // Remove quotes if present
        const unquoted = value.replace(/^["']|["']$/g, '');
        envVars[currentKey] = unquoted;
        currentKey = null;
        currentValue = [];
      }

      // Parse KEY=VALUE
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();

        // Validate key format (basic validation)
        if (!key || !/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
          // Skip invalid keys but don't throw
          continue;
        }

        currentKey = key;
        currentValue = [value];
      }
    }

    // Save last key-value if exists
    if (currentKey) {
      const value = currentValue.join('\n').trim();
      const unquoted = value.replace(/^["']|["']$/g, '');
      envVars[currentKey] = unquoted;
    }

    return envVars;
  } catch (error) {
    const err = error as any;
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

