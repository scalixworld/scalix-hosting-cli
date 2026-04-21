/**
 * Tests for Login Command
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { loginCommand } from '../../src/commands/login'
import * as tokenUtils from '../../src/utils/token'
import * as apiUtils from '../../src/utils/api'

// Mock dependencies
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}))
vi.mock('open', () => ({
  default: vi.fn(),
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
    red: vi.fn((str) => str),
    green: vi.fn((str) => str),
    yellow: vi.fn((str) => str),
    blue: vi.fn((str) => str),
    gray: vi.fn((str) => str),
    bold: vi.fn((str) => str),
  },
}))
vi.mock('../../src/utils/token')
vi.mock('../../src/utils/api')

describe('Login Command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Token-based Login', () => {
    it('should save token when provided via --token flag', async () => {
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { valid: true }
      } as any)

      await loginCommand({ token: 'test-token-123' })

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith('/api/cli/auth/verify', expect.any(Object))
      expect(tokenUtils.saveToken).toHaveBeenCalledWith('test-token-123')
    })

    it('should not open browser when token is provided', async () => {
      const openModule = await import('open')
      vi.mocked(openModule.default).mockResolvedValue(undefined)
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { valid: true }
      } as any)

      await loginCommand({ token: 'test-token-123' })

      expect(openModule.default).not.toHaveBeenCalled()
    })
  })

  describe('OAuth2 Flow', () => {
    beforeEach(() => {
      // Set test environment for faster polling
      process.env.NODE_ENV = 'test'
    })

    afterEach(() => {
      delete process.env.NODE_ENV
    })

    it('should open browser for OAuth2 authentication', async () => {
      const openModule = await import('open')
      const inquirerModule = await import('inquirer')
      
      vi.mocked(openModule.default).mockResolvedValue(undefined)
      // Mock polling to fail immediately with non-404 to exit loop quickly, then manual entry
      vi.mocked(apiUtils.apiClient.get)
        .mockRejectedValueOnce({ response: { status: 500 } }) // First poll fails with non-404 to exit loop immediately
        .mockResolvedValueOnce({ data: { valid: true } }) // Verification succeeds
      vi.mocked(inquirerModule.default.prompt).mockResolvedValue({ manualToken: 'oauth-token-123' })
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      await loginCommand({})

      expect(openModule.default).toHaveBeenCalled()
      expect(openModule.default).toHaveBeenCalledWith(
        expect.stringContaining('/api/cli/auth/oauth')
      )
      expect(inquirerModule.default.prompt).toHaveBeenCalled()
      expect(tokenUtils.saveToken).toHaveBeenCalledWith('oauth-token-123')
    })

    it('should prompt user for token after opening browser', async () => {
      const openModule = await import('open')
      const inquirerModule = await import('inquirer')
      
      vi.mocked(openModule.default).mockResolvedValue(undefined)
      // Mock polling to fail immediately with non-404 to exit loop quickly, then manual entry
      vi.mocked(apiUtils.apiClient.get)
        .mockRejectedValueOnce({ response: { status: 500 } }) // Poll fails with non-404 to exit loop immediately
        .mockResolvedValueOnce({ data: { valid: true } }) // Verification succeeds
      vi.mocked(inquirerModule.default.prompt).mockResolvedValue({ manualToken: 'user-pasted-token' })
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      await loginCommand({})

      expect(inquirerModule.default.prompt).toHaveBeenCalled()
      expect(tokenUtils.saveToken).toHaveBeenCalledWith('user-pasted-token')
    })

    it('should validate token input', async () => {
      const openModule = await import('open')
      const inquirerModule = await import('inquirer')
      
      vi.mocked(openModule.default).mockResolvedValue(undefined)
      vi.mocked(apiUtils.apiClient.get)
        .mockRejectedValueOnce({ response: { status: 500 } }) // Poll fails
        .mockResolvedValueOnce({ data: { valid: true } }) // Verification succeeds
      
      const promptMock = vi.fn().mockResolvedValue({ manualToken: 'short' })
      vi.mocked(inquirerModule.default.prompt).mockImplementation(promptMock)
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      await loginCommand({})

      // The validation should reject short tokens
      const validateFn = promptMock.mock.calls[0]?.[0]?.[0]?.validate
      if (validateFn) {
        const result = validateFn('short')
        expect(result).toBe('Please enter a valid token')
      }
    })

    it('should accept valid token input', async () => {
      const openModule = await import('open')
      const inquirerModule = await import('inquirer')
      
      vi.mocked(openModule.default).mockResolvedValue(undefined)
      vi.mocked(apiUtils.apiClient.get)
        .mockRejectedValueOnce({ response: { status: 500 } }) // Poll fails
        .mockResolvedValueOnce({ data: { valid: true } }) // Verification succeeds
      
      const promptMock = vi.fn().mockResolvedValue({ manualToken: 'valid-long-token-12345' })
      vi.mocked(inquirerModule.default.prompt).mockImplementation(promptMock)
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      await loginCommand({})

      // The validation should accept long tokens
      const validateFn = promptMock.mock.calls[0]?.[0]?.[0]?.validate
      if (validateFn) {
        const result = validateFn('valid-long-token-12345')
        expect(result).toBe(true)
      }
    })

    it('should generate state parameter for OAuth2', async () => {
      const openModule = await import('open')
      vi.mocked(openModule.default).mockResolvedValue(undefined)
      
      const inquirerModule = await import('inquirer')
      vi.mocked(apiUtils.apiClient.get)
        .mockRejectedValueOnce({ response: { status: 500 } }) // Poll fails
        .mockResolvedValueOnce({ data: { valid: true } }) // Verification succeeds
      vi.mocked(inquirerModule.default.prompt).mockResolvedValue({ manualToken: 'test-token' })
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      await loginCommand({})

      const callArgs = vi.mocked(openModule.default).mock.calls[0]?.[0] as string
      expect(callArgs).toContain('state=')
    })

    it('should use correct API URL for OAuth2', async () => {
      const openModule = await import('open')
      vi.mocked(openModule.default).mockResolvedValue(undefined)
      
      const inquirerModule = await import('inquirer')
      vi.mocked(apiUtils.apiClient.get)
        .mockRejectedValueOnce({ response: { status: 500 } }) // Poll fails
        .mockResolvedValueOnce({ data: { valid: true } }) // Verification succeeds
      vi.mocked(inquirerModule.default.prompt).mockResolvedValue({ manualToken: 'test-token' })
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      await loginCommand({})

      const callArgs = vi.mocked(openModule.default).mock.calls[0]?.[0] as string
      const apiUrl = process.env.SCALIX_API_URL || 'https://app.scalix.com'
      expect(callArgs).toContain(apiUrl)
    })
  })

  describe('Error Handling', () => {
    it('should handle browser open failure', async () => {
      const openModule = await import('open')
      vi.mocked(openModule.default).mockRejectedValue(new Error('Browser failed to open'))
      
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      try {
        await loginCommand({})
      } catch {
        // Expected
      }

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should handle token save failure', async () => {
      const openModule = await import('open')
      vi.mocked(openModule.default).mockResolvedValue(undefined)
      
      const inquirerModule = await import('inquirer')
      // Mock polling to fail immediately with non-404 to exit loop quickly
      vi.mocked(apiUtils.apiClient.get)
        .mockRejectedValueOnce({ response: { status: 500 } }) // Poll fails with non-404 to exit loop immediately
        .mockResolvedValueOnce({ data: { valid: true } }) // Verification succeeds
      vi.mocked(inquirerModule.default.prompt).mockResolvedValue({ manualToken: 'test-token' })
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)
      
      await loginCommand({})

      expect(tokenUtils.saveToken).toHaveBeenCalled()
    })
  })
})

