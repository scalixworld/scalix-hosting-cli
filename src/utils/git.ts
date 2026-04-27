import { execSync } from 'child_process';

export interface GitMeta {
  branch: string | null;
  commit: string | null;
  commitMessage: string | null;
  dirty: boolean;
  remoteUrl: string | null;
}

function run(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

export function getGitMeta(cwd: string): GitMeta | null {
  const branch = run('git rev-parse --abbrev-ref HEAD', cwd);
  if (!branch) return null;

  return {
    branch,
    commit: run('git rev-parse --short HEAD', cwd),
    commitMessage: run('git log -1 --pretty=%s', cwd),
    dirty: run('git status --porcelain', cwd) !== '',
    remoteUrl: run('git remote get-url origin', cwd),
  };
}
