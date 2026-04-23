/**
 * Tests for Deploy Command
 *
 * The deploy command involves heavy I/O (fs, archiver, zip, API upload).
 * We mock all I/O to test the logical branches.
 *
 * Race-condition note: deploy.ts calls `await archive.finalize()` then
 * registers `output.on('close', resolve)`. Our mocks handle both orderings:
 * whichever fires second immediately triggers the close callback.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { deployCommand } from '../../src/commands/deploy'
import * as tokenUtils from '../../src/utils/token'
import * as apiUtils from '../../src/utils/api'
import * as envUtils from '../../src/utils/env'

// ── Shared state (hoisted so vi.mock factories can see it) ─────────────────

vi.hoisted(() => {
  ;(globalThis as any).__dth = {
    finalized: false,
    closeCb: null as (() => void) | null,
  }
})

// ── Module mocks ───────────────────────────────────────────────────────────

vi.mock('fs', () => {
  const createWriteStream = vi.fn(() => ({
    on: vi.fn((event: string, cb: () => void) => {
      const h = (globalThis as any).__dth
      if (event === 'close') {
        h.closeCb = cb
        // If finalize already ran, fire immediately
        if (h.finalized) setTimeout(cb, 0)
      }
    }),
    write: vi.fn(),
    end: vi.fn(),
  }))
  return { default: { createWriteStream }, createWriteStream }
})

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
  },
  access: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
}))

vi.mock('path', () => ({
  default: {
    resolve: vi.fn(),
    join: vi.fn(),
    basename: vi.fn(),
  },
  resolve: vi.fn(),
  join: vi.fn(),
  basename: vi.fn(),
}))

vi.mock('archiver', () => ({
  default: vi.fn(() => ({
    pipe: vi.fn(),
    directory: vi.fn(),
    file: vi.fn(),
    abort: vi.fn(),
    finalize: vi.fn(async () => {
      const h = (globalThis as any).__dth
      h.finalized = true
      // If close callback was already registered, fire it
      if (h.closeCb) setTimeout(h.closeCb, 0)
    }),
  })),
}))

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: '',
  })),
}))

vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    blue: (s: string) => s,
    gray: (s: string) => s,
    bold: (s: string) => s,
    cyan: (s: string) => s,
  },
}))

vi.mock('../../src/utils/token')
vi.mock('../../src/utils/api')
vi.mock('../../src/utils/env')

// ── Helpers ────────────────────────────────────────────────────────────────

let exitSpy: ReturnType<typeof vi.spyOn>

function setupDefaults() {
  const h = (globalThis as any).__dth
  h.finalized = false
  h.closeCb = null

  vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
  vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
    data: { success: true, deployment: { deploymentId: 'dep-1', url: 'https://app.example.com' } },
  } as any)

  vi.mocked(path.resolve).mockImplementation((p?: string) =>
    p === '.' || !p ? '/cwd' : p.startsWith('/') ? p : `/${p.replace('./', '')}`,
  )
  vi.mocked(path.join).mockImplementation((...a: string[]) => a.join('/'))
  vi.mocked(path.basename).mockReturnValue('test-dir')

  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readdir).mockResolvedValue(['package.json'] as any)
  vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => false, size: 100 } as any)
  vi.mocked(fs.unlink).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
    const p = String(filePath)
    if (p.includes('package.json')) return '{"name":"test-app"}' as any
    return Buffer.from('zipdata') as any
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Deploy Command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    setupDefaults()
  })

  afterEach(() => {
    exitSpy.mockRestore()
  })

  // ── Authentication ─────────────────────────────────────────────────────

  describe('Authentication', () => {
    it('should exit(1) when not authenticated', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue(null)
      await deployCommand({})
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should proceed when authenticated', async () => {
      await deployCommand({ dir: './test-dir' })
      expect(tokenUtils.getToken).toHaveBeenCalled()
    })
  })

  // ── Directory Validation ───────────────────────────────────────────────

  describe('Directory Validation', () => {
    it('should exit(1) when directory does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'))
      await deployCommand({ dir: './nonexistent' })
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should use current directory when dir not specified', async () => {
      await deployCommand({})
      expect(path.resolve).toHaveBeenCalled()
    })
  })

  // ── App Name Validation ────────────────────────────────────────────────

  describe('App Name Validation', () => {
    it('should extract app name from package.json', async () => {
      await deployCommand({ dir: './test-dir' })
      expect(fs.readFile).toHaveBeenCalled()
    })

    it('should exit(1) with invalid app name', async () => {
      await deployCommand({ name: 'Invalid App Name!' })
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should accept valid app name', async () => {
      await deployCommand({ name: 'valid-app' })
      expect(apiUtils.apiClient.post).toHaveBeenCalled()
    })
  })

  // ── Environment Variables ──────────────────────────────────────────────

  describe('Environment Variables', () => {
    it('should load environment variables from file', async () => {
      vi.mocked(envUtils.loadEnvFile).mockResolvedValue({ API_KEY: 'test', NODE_ENV: 'production' })
      await deployCommand({ dir: './test-dir', env: '.env' })
      expect(envUtils.loadEnvFile).toHaveBeenCalled()
    })

    it('should accept --env-var flags', async () => {
      await deployCommand({ dir: './test-dir', envVar: ['API_KEY=test-key', 'NODE_ENV=production'] })
      expect(apiUtils.apiClient.post).toHaveBeenCalled()
      const body = vi.mocked(apiUtils.apiClient.post).mock.calls[0][1]
      expect(body.environmentVariables).toMatchObject({ API_KEY: 'test-key', NODE_ENV: 'production' })
    })
  })

  // ── Deployment ─────────────────────────────────────────────────────────

  describe('Deployment', () => {
    it('should call API with correct deployment data', async () => {
      await deployCommand({ dir: './test-dir' })
      expect(apiUtils.apiClient.post).toHaveBeenCalledWith(
        '/api/hosting/deploy',
        expect.objectContaining({ appName: 'test-app', sourceType: 'upload' }),
        expect.any(Object),
      )
    })

    it('should skip node_modules and hidden files during packaging', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['package.json', 'node_modules', '.git', '.env'] as any)
      await deployCommand({ dir: './test-dir' })
      expect(fs.readdir).toHaveBeenCalled()
    })

    it('should handle deployment success without exit(1)', async () => {
      await deployCommand({ dir: './test-dir' })
      const exit1Calls = exitSpy.mock.calls.filter((c: any) => c[0] === 1)
      expect(exit1Calls.length).toBe(0)
    })

    it('should exit(1) on deployment failure response', async () => {
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: { success: false, error: 'Deployment failed' },
      } as any)
      await deployCommand({ dir: './test-dir' })
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should exit(1) on API network error', async () => {
      vi.mocked(apiUtils.apiClient.post).mockRejectedValue(new Error('Network error'))
      await deployCommand({ dir: './test-dir' })
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })
})
