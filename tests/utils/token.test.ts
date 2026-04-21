/**
 * Tests for Token Utilities
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as tokenUtils from '../../src/utils/token'
import keytar from 'keytar'
import os from 'os'

// Mock dependencies
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}))
vi.mock('os', () => ({
  default: {
    userInfo: vi.fn(() => ({ username: 'testuser' })),
  },
}))

describe('Token Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.SCALIX_TOKEN
    vi.mocked(os.userInfo).mockReturnValue({ username: 'testuser' } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.SCALIX_TOKEN
  })

  describe('getToken', () => {
    it('should retrieve token from keytar', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue('keytar-token-123')

      const token = await tokenUtils.getToken()

      expect(token).toBe('keytar-token-123')
      expect(keytar.getPassword).toHaveBeenCalledWith('scalix-cli', 'testuser')
    })

    it('should fallback to environment variable when keytar fails', async () => {
      vi.mocked(keytar.getPassword).mockRejectedValue(new Error('Keytar error'))
      process.env.SCALIX_TOKEN = 'env-token-123'

      const token = await tokenUtils.getToken()

      expect(token).toBe('env-token-123')
    })

    it('should return null when no token available', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null)

      const token = await tokenUtils.getToken()

      expect(token).toBeNull()
    })

    it('should return null when keytar fails and no env var', async () => {
      vi.mocked(keytar.getPassword).mockRejectedValue(new Error('Keytar error'))

      const token = await tokenUtils.getToken()

      expect(token).toBeNull()
    })
  })

  describe('saveToken', () => {
    it('should save token to keytar', async () => {
      vi.mocked(keytar.setPassword).mockResolvedValue(undefined)

      await tokenUtils.saveToken('new-token-123')

      expect(keytar.setPassword).toHaveBeenCalledWith('scalix-cli', 'testuser', 'new-token-123')
    })

    it('should fallback to environment variable when keytar fails', async () => {
      vi.mocked(keytar.setPassword).mockRejectedValue(new Error('Keytar error'))
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await tokenUtils.saveToken('fallback-token-123')

      expect(process.env.SCALIX_TOKEN).toBe('fallback-token-123')
      expect(consoleWarnSpy).toHaveBeenCalled()
      consoleWarnSpy.mockRestore()
    })
  })

  describe('clearToken', () => {
    it('should delete token from keytar', async () => {
      vi.mocked(keytar.deletePassword).mockResolvedValue(undefined)

      await tokenUtils.clearToken()

      expect(keytar.deletePassword).toHaveBeenCalledWith('scalix-cli', 'testuser')
    })

    it('should remove environment variable', async () => {
      process.env.SCALIX_TOKEN = 'token-to-remove'
      vi.mocked(keytar.deletePassword).mockResolvedValue(undefined)

      await tokenUtils.clearToken()

      expect(process.env.SCALIX_TOKEN).toBeUndefined()
    })

    it('should handle keytar errors gracefully', async () => {
      vi.mocked(keytar.deletePassword).mockRejectedValue(new Error('Keytar error'))

      // Should not throw
      await expect(tokenUtils.clearToken()).resolves.not.toThrow()
    })
  })

  describe('isAuthenticated', () => {
    it('should return true when token exists', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue('token-123')

      const isAuth = await tokenUtils.isAuthenticated()

      expect(isAuth).toBe(true)
    })

    it('should return false when no token', async () => {
      vi.mocked(keytar.getPassword).mockResolvedValue(null)

      const isAuth = await tokenUtils.isAuthenticated()

      expect(isAuth).toBe(false)
    })

    it('should return false when keytar fails and no env var', async () => {
      vi.mocked(keytar.getPassword).mockRejectedValue(new Error('Keytar error'))

      const isAuth = await tokenUtils.isAuthenticated()

      expect(isAuth).toBe(false)
    })

    it('should return true when env var exists', async () => {
      vi.mocked(keytar.getPassword).mockRejectedValue(new Error('Keytar error'))
      process.env.SCALIX_TOKEN = 'env-token-123'

      const isAuth = await tokenUtils.isAuthenticated()

      expect(isAuth).toBe(true)
    })
  })
})

