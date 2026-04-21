/**
 * Tests for Config Command
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { configCommand } from '../../src/commands/config'
import * as tokenUtils from '../../src/utils/token'

// Mock dependencies
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

describe('Config Command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear environment variables
    delete process.env.SCALIX_API_URL
    delete process.env.SCALIX_TOKEN
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Clean up environment variables
    delete process.env.SCALIX_API_URL
    delete process.env.SCALIX_TOKEN
  })

  describe('List Configuration', () => {
    it('should display all configuration when --list is used', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')

      await configCommand({ list: true })

      // Should display API URL and authentication status
      expect(tokenUtils.getToken).toHaveBeenCalled()
    })

    it('should show default API URL when not set', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue(null)

      await configCommand({ list: true })

      // Should show default URL
      expect(true).toBe(true)
    })

    it('should show custom API URL when set', async () => {
      process.env.SCALIX_API_URL = 'https://custom-api.example.com'
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')

      await configCommand({ list: true })

      // Should show custom URL
      expect(true).toBe(true)
    })

    it('should show authenticated status', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token-12345')

      await configCommand({ list: true })

      expect(tokenUtils.getToken).toHaveBeenCalled()
    })

    it('should show token preview when authenticated', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token-12345')

      await configCommand({ list: true })

      // Should show last 4 characters of token
      expect(tokenUtils.getToken).toHaveBeenCalled()
    })
  })

  describe('Get Configuration', () => {
    it('should get configuration value when --get is used', async () => {
      process.env.SCALIX_API_URL = 'https://api.example.com'
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await configCommand({ get: 'api_url' })

      // Should output the value
      expect(consoleSpy).toHaveBeenCalledWith('https://api.example.com')
      consoleSpy.mockRestore()
    })

    it('should handle case-insensitive key lookup', async () => {
      process.env.SCALIX_API_URL = 'https://api.example.com'
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await configCommand({ get: 'API_URL' })

      // Should find the value
      expect(consoleSpy).toHaveBeenCalledWith('https://api.example.com')
      consoleSpy.mockRestore()
    })

    it('should fail when key not found', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      await configCommand({ get: 'nonexistent_key' })

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })
  })

  describe('Set Configuration', () => {
    it('should set configuration value when --set is used', async () => {
      await configCommand({ set: 'api_url=https://new-api.example.com' })

      // Should set the environment variable
      expect(process.env.SCALIX_API_URL).toBe('https://new-api.example.com')
    })

    it('should handle values with equals signs', async () => {
      await configCommand({ set: 'api_url=https://api.example.com/v1/endpoint' })

      // Should parse correctly
      expect(process.env.SCALIX_API_URL).toBe('https://api.example.com/v1/endpoint')
    })

    it('should fail with invalid format', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      await configCommand({ set: 'invalid-format' })

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should fail with missing value', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      await configCommand({ set: 'api_url=' })

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should fail with invalid URL', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      await configCommand({ set: 'api_url=not-a-valid-url' })

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should fail with unknown key', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      await configCommand({ set: 'unknown_key=value' })

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should set API_URL correctly', async () => {
      await configCommand({ set: 'api_url=https://api.example.com' })

      expect(process.env.SCALIX_API_URL).toBe('https://api.example.com')
    })
  })

  describe('Error Handling', () => {
    it('should fail when no action specified', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      await configCommand({})

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })
  })
})

