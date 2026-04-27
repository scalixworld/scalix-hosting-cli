import fs from 'fs/promises';
import path from 'path';
import { DEFAULT_IGNORE_PATTERNS } from './constants';

export async function loadIgnorePatterns(deployDir: string): Promise<string[]> {
  const ignorePath = path.join(deployDir, '.scalixignore');
  try {
    const content = await fs.readFile(ignorePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch {
    return [...DEFAULT_IGNORE_PATTERNS];
  }
}

export function shouldIgnore(filePath: string, patterns: string[]): boolean {
  const name = path.basename(filePath);

  for (const pattern of patterns) {
    if (pattern === name) return true;
    if (pattern.startsWith('*.') && name.endsWith(pattern.slice(1))) return true;
    if (pattern.endsWith('/') && name === pattern.slice(0, -1)) return true;
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      );
      if (regex.test(name)) return true;
    }
  }

  return false;
}
