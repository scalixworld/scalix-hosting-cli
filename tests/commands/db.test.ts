/**
 * Tests for Database (ScalixDB) Commands
 *
 * Each subcommand is tested for:
 *   - correct API endpoint and method
 *   - success path
 *   - error / auth-failure path
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerDbCommand } from '../../src/commands/db'
import * as tokenUtils from '../../src/utils/token'
import * as apiUtils from '../../src/utils/api'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn().mockResolvedValue({ confirm: true }),
  },
}))

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: '',
  })),
}))

vi.mock('chalk', () => ({
  default: {
    red: vi.fn((s: string) => s),
    green: vi.fn((s: string) => s),
    yellow: vi.fn((s: string) => s),
    blue: vi.fn((s: string) => s),
    gray: vi.fn((s: string) => s),
    bold: vi.fn((s: string) => s),
    cyan: vi.fn((s: string) => s),
  },
}))

vi.mock('../../src/utils/token')
vi.mock('../../src/utils/api')

// ── Helpers ────────────────────────────────────────────────────────────────

const DB_PREFIX = '/api/scalixdb/databases'

let exitSpy: ReturnType<typeof vi.spyOn>

function authOk() {
  vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
}

function authFail() {
  vi.mocked(tokenUtils.getToken).mockResolvedValue(null)
}

/**
 * Build a Commander program with the db subcommands registered so we can
 * programmatically invoke them via `program.parseAsync(...)`.
 */
function buildProgram(): Command {
  const program = new Command()
  program.exitOverride() // throw instead of process.exit in commander itself
  registerDbCommand(program)
  return program
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Database Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    exitSpy.mockRestore()
  })

  // ── db list ────────────────────────────────────────────────────────────

  describe('db list', () => {
    it('should GET /api/scalixdb/databases and display results', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: {
          success: true,
          databases: [
            { id: 'db-1', name: 'mydb', status: 'ready', plan: 'free', region: 'us-east-1', createdAt: '2025-01-01T00:00:00Z' },
          ],
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'list'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(DB_PREFIX)
    })

    it('should handle empty database list', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: true, databases: [] },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'list'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(DB_PREFIX)
    })

    it('should exit(1) when not authenticated', async () => {
      authFail()

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'list'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should exit(1) on API error', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockRejectedValue(new Error('Network fail'))

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'list'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should exit(1) when response success is false', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: false, error: 'Forbidden' },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'list'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  // ── db create ──────────────────────────────────────────────────────────

  describe('db create', () => {
    it('should POST with name and optional plan/region', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: {
          success: true,
          database: { id: 'db-2', name: 'newdb', status: 'provisioning', plan: 'pro', region: 'eu-west-1' },
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'create', '--name', 'newdb', '--plan', 'pro', '--region', 'eu-west-1'])

      expect(apiUtils.apiClient.post).toHaveBeenCalledWith(DB_PREFIX, {
        name: 'newdb',
        plan: 'pro',
        region: 'eu-west-1',
      })
    })

    it('should POST with name only when plan/region omitted', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: {
          success: true,
          database: { id: 'db-3', name: 'simple', status: 'provisioning' },
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'create', '--name', 'simple'])

      expect(apiUtils.apiClient.post).toHaveBeenCalledWith(DB_PREFIX, { name: 'simple' })
    })

    it('should exit(1) when not authenticated', async () => {
      authFail()

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'create', '--name', 'x'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should exit(1) when API returns failure', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: { success: false, error: 'Quota exceeded' },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'create', '--name', 'over-limit'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  // ── db info ────────────────────────────────────────────────────────────

  describe('db info', () => {
    it('should GET /api/scalixdb/databases/:id', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: {
          success: true,
          database: {
            id: 'db-1', name: 'mydb', status: 'ready', plan: 'free',
            region: 'us-east-1', size: '10 MB', tableCount: 5,
            createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-04-01T00:00:00Z',
          },
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'info', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1`)
    })

    it('should exit(1) when database not found', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: false, error: 'Not found' },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'info', 'no-such-db'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  // ── db query ───────────────────────────────────────────────────────────

  describe('db query', () => {
    it('should POST sql body to /api/scalixdb/databases/:id/query', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: {
          success: true,
          rows: [{ id: 1, name: 'Alice' }],
          rowCount: 1,
          fields: ['id', 'name'],
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'query', 'db-1', '--sql', 'SELECT * FROM users'])

      expect(apiUtils.apiClient.post).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/query`, {
        sql: 'SELECT * FROM users',
      })
    })

    it('should handle empty result set', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: { success: true, rows: [], rowCount: 0, fields: [] },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'query', 'db-1', '--sql', 'SELECT 1 WHERE false'])

      expect(apiUtils.apiClient.post).toHaveBeenCalled()
    })

    it('should exit(1) when query fails', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: { success: false, error: 'syntax error at position 1' },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'query', 'db-1', '--sql', 'BAD SQL'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  // ── db tables ──────────────────────────────────────────────────────────

  describe('db tables', () => {
    it('should GET /api/scalixdb/databases/:id/tables', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: {
          success: true,
          tables: [
            { name: 'users', schema: 'public', rowCount: 42, size: '16 kB' },
          ],
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'tables', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/tables`)
    })

    it('should handle empty tables list', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: true, tables: [] },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'tables', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/tables`)
    })

    it('should exit(1) on API failure', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: false, error: 'DB not found' },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'tables', 'db-1'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  // ── db metrics ─────────────────────────────────────────────────────────

  describe('db metrics', () => {
    it('should GET /api/scalixdb/databases/:id/metrics', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: {
          success: true,
          metrics: { cpuUsage: '12%', memoryUsage: '256 MB', connections: 5 },
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'metrics', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/metrics`)
    })

    it('should exit(1) when metrics unavailable', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: false, error: 'Metrics unavailable' },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'metrics', 'db-1'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  // ── db backup list ─────────────────────────────────────────────────────

  describe('db backup list', () => {
    it('should GET /api/scalixdb/databases/:id/backups', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: {
          success: true,
          backups: [
            { id: 'bk-1', name: 'daily', status: 'ready', size: '2 MB', createdAt: '2025-04-01T00:00:00Z' },
          ],
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'backup', 'list', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/backups`)
    })

    it('should handle empty backup list', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: true, backups: [] },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'backup', 'list', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/backups`)
    })

    it('should exit(1) on failure', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: false, error: 'DB not found' },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'backup', 'list', 'db-1'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  // ── db backup create ───────────────────────────────────────────────────

  describe('db backup create', () => {
    it('should POST to /api/scalixdb/databases/:id/backups', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: {
          success: true,
          backup: { id: 'bk-2', name: 'pre-migration', status: 'creating' },
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'backup', 'create', 'db-1', '--name', 'pre-migration'])

      expect(apiUtils.apiClient.post).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/backups`, {
        name: 'pre-migration',
      })
    })

    it('should POST with empty body when name omitted', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: {
          success: true,
          backup: { id: 'bk-3', status: 'creating' },
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'backup', 'create', 'db-1'])

      expect(apiUtils.apiClient.post).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/backups`, {})
    })

    it('should exit(1) on failure', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: { success: false, error: 'Backup limit reached' },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'backup', 'create', 'db-1'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  // ── db backup restore ──────────────────────────────────────────────────

  describe('db backup restore', () => {
    it('should POST to /api/scalixdb/databases/:id/backups/:backupId/restore', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: { success: true },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'backup', 'restore', 'db-1', 'bk-1'])

      expect(apiUtils.apiClient.post).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/backups/bk-1/restore`)
    })

    it('should exit(1) on failure', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: { success: false, error: 'Backup not found' },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'backup', 'restore', 'db-1', 'bk-99'])

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  // ── db delete ──────────────────────────────────────────────────────────

  describe('db delete', () => {
    it('should DELETE /api/scalixdb/databases/:id with --force', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: true, database: { id: 'db-1', name: 'mydb' } },
      } as any)
      vi.mocked(apiUtils.apiClient.delete).mockResolvedValue({
        data: { success: true },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'delete', 'db-1', '--force'])

      expect(apiUtils.apiClient.delete).toHaveBeenCalledWith(`${DB_PREFIX}/db-1`)
    })

    it('should prompt for confirmation without --force', async () => {
      authOk()
      const inquirerModule = await import('inquirer')
      vi.mocked(inquirerModule.default.prompt).mockResolvedValue({ confirm: true })

      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: true, database: { id: 'db-1', name: 'mydb' } },
      } as any)
      vi.mocked(apiUtils.apiClient.delete).mockResolvedValue({
        data: { success: true },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'delete', 'db-1'])

      expect(inquirerModule.default.prompt).toHaveBeenCalled()
      expect(apiUtils.apiClient.delete).toHaveBeenCalledWith(`${DB_PREFIX}/db-1`)
    })

    it('should abort when user declines confirmation', async () => {
      authOk()
      const inquirerModule = await import('inquirer')
      vi.mocked(inquirerModule.default.prompt).mockResolvedValue({ confirm: false })

      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: true, database: { id: 'db-1', name: 'mydb' } },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'delete', 'db-1'])

      expect(apiUtils.apiClient.delete).not.toHaveBeenCalled()
    })
  })

  // ── db connection ──────────────────────────────────────────────────────

  describe('db connection', () => {
    it('should GET /api/scalixdb/databases/:id/connection', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: true, connectionString: 'postgres://user:pass@host:5432/db' },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'connection', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/connection`)
    })
  })

  // ── db branches ────────────────────────────────────────────────────────

  describe('db branches', () => {
    it('should GET /api/scalixdb/databases/:id/branches', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: {
          success: true,
          branches: [{ id: 'br-1', name: 'staging', status: 'ready', createdAt: '2025-01-01T00:00:00Z' }],
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'branches', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/branches`)
    })
  })

  // ── db branch create ───────────────────────────────────────────────────

  describe('db branch create', () => {
    it('should POST to /api/scalixdb/databases/:id/branches', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: {
          success: true,
          branch: { id: 'br-2', name: 'staging', status: 'creating' },
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'branch', 'create', 'db-1', '--name', 'staging'])

      expect(apiUtils.apiClient.post).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/branches`, {
        name: 'staging',
      })
    })
  })

  // ── db logs ────────────────────────────────────────────────────────────

  describe('db logs', () => {
    it('should GET /api/scalixdb/databases/:id/logs', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: {
          success: true,
          logs: [
            { timestamp: '2025-01-01T00:00:00Z', level: 'info', message: 'DB started' },
          ],
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'logs', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/logs`)
    })

    it('should handle string log entries', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { success: true, logs: ['plain log line 1', 'plain log line 2'] },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'logs', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/logs`)
    })
  })

  // ── db extensions ──────────────────────────────────────────────────────

  describe('db extensions', () => {
    it('should GET /api/scalixdb/databases/:id/extensions', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: {
          success: true,
          extensions: [{ name: 'pgvector', version: '0.5.0', description: 'Vector similarity search' }],
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'extensions', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/extensions`)
    })
  })

  // ── db pooling ─────────────────────────────────────────────────────────

  describe('db pooling', () => {
    it('should GET /api/scalixdb/databases/:id/pooling/status', async () => {
      authOk()
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: {
          success: true,
          pooling: { mode: 'transaction', activeConnections: 3, maxConnections: 50 },
        },
      } as any)

      const program = buildProgram()
      await program.parseAsync(['node', 'test', 'db', 'pooling', 'db-1'])

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(`${DB_PREFIX}/db-1/pooling/status`)
    })
  })
})
