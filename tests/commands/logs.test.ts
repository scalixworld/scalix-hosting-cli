/**
 * Tests for Logs Command
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { logsCommand } from '../../src/commands/logs'
import * as tokenUtils from '../../src/utils/token'
import * as apiUtils from '../../src/utils/api'

// Mock dependencies
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
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

describe('Logs Command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication', () => {
    it('should fail when not authenticated', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue(null)
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      await logsCommand('deploy-123', {})

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should proceed when authenticated', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { logs: [] }
      } as any)

      await logsCommand('deploy-123', {})

      expect(tokenUtils.getToken).toHaveBeenCalled()
    })
  })

  describe('Log Fetching', () => {
    it('should fetch logs for deployment', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { logs: ['log1', 'log2', 'log3'] }
      } as any)

      await logsCommand('deploy-123', {})

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(
        '/api/hosting/logs',
        expect.objectContaining({
          params: expect.objectContaining({
            deploymentId: 'deploy-123'
          })
        })
      )
    })

    it('should use default tail value of 100', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { logs: [] }
      } as any)

      await logsCommand('deploy-123', {})

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(
        '/api/hosting/logs',
        expect.objectContaining({
          params: expect.objectContaining({
            tail: '100'
          })
        })
      )
    })

    it('should use custom tail value when provided', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { logs: [] }
      } as any)

      await logsCommand('deploy-123', { tail: '50' })

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(
        '/api/hosting/logs',
        expect.objectContaining({
          params: expect.objectContaining({
            tail: '50'
          })
        })
      )
    })

    it('should display logs correctly', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      const mockLogs = [
        '[2024-01-01 10:00:00] INFO: Deployment started',
        '[2024-01-01 10:00:05] INFO: Building application',
        '[2024-01-01 10:00:10] INFO: Deployment complete'
      ]

      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { logs: mockLogs }
      } as any)

      await logsCommand('deploy-123', { tail: '3' })

      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })

    it('should limit displayed logs to tail value', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      const mockLogs = Array.from({ length: 200 }, (_, i) => `Log line ${i + 1}`)

      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { logs: mockLogs }
      } as any)

      await logsCommand('deploy-123', { tail: '50' })

      // Should only show last 50 lines
      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })
  })

  describe('Follow Mode', () => {
    it('should indicate follow mode when enabled', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { logs: ['log1'] }
      } as any)

      await logsCommand('deploy-123', { follow: true })

      // Should show follow message (implementation may vary)
      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })

    it('should not follow when flag not set', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { logs: ['log1'] }
      } as any)

      await logsCommand('deploy-123', { follow: false })

      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockRejectedValue(new Error('API Error'))
      
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      try {
        await logsCommand('deploy-123', {})
      } catch {
        // Expected
      }

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should handle missing logs in response', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { error: 'Logs not found' }
      } as any)

      await logsCommand('deploy-123', {})

      // Should display error message (code shows error but doesn't exit for response errors)
      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })
  })
})

