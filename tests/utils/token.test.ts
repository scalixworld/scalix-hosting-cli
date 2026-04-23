/**
 * Tests for Token Utilities
 * The token module uses fs to read/write ~/.scalix/token.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import fs from 'fs/promises'

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
  },
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}))

// Import after mocks are set up
import { getToken, saveToken, clearToken } from '../../src/utils/token'

describe('Token Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getToken', () => {
    it('should return the stored token (trimmed)', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('  my-token-123  ')

      const token = await getToken()

      expect(token).toBe('my-token-123')
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('.scalix/token'),
        'utf8',
      )
    })

    it('should return null when token file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))

      const token = await getToken()

      expect(token).toBeNull()
    })

    it('should return null on any read error', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'))

      const token = await getToken()

      expect(token).toBeNull()
    })
  })

  describe('saveToken', () => {
    it('should create config directory and write token file', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      await saveToken('new-token-abc')

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.scalix'),
        { recursive: true, mode: 0o700 },
      )
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.scalix/token'),
        'new-token-abc',
        { encoding: 'utf8', mode: 0o600 },
      )
    })

    it('should not throw on write errors (silently ignored)', async () => {
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'))

      // Should not throw
      await expect(saveToken('token')).resolves.toBeUndefined()
    })
  })

  describe('clearToken', () => {
    it('should delete the token file', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined)

      await clearToken()

      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('.scalix/token'),
      )
    })

    it('should not throw when token file does not exist', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(new Error('ENOENT'))

      await expect(clearToken()).resolves.toBeUndefined()
    })
  })
})
