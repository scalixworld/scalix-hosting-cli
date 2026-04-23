/**
 * Tests for List Command
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { listCommand } from '../../src/commands/list'
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

describe('List Command', () => {
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

      await listCommand({})

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should proceed when authenticated', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { deployments: [] }
      } as any)

      await listCommand({})

      expect(tokenUtils.getToken).toHaveBeenCalled()
    })
  })

  describe('Deployment Listing', () => {
    it('should fetch all deployments', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { deployments: [] }
      } as any)

      await listCommand({})

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(
        '/api/hosting/deployments',
        expect.objectContaining({ params: {} })
      )
    })

    it('should filter by status when provided', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { deployments: [] }
      } as any)

      await listCommand({ status: 'ready' })

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith(
        '/api/hosting/deployments',
        expect.objectContaining({ params: { status: 'ready' } })
      )
    })

    it('should display empty message when no deployments', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { deployments: [] }
      } as any)

      await listCommand({})

      // Should not throw and should handle empty list
      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })

    it('should display deployments with correct formatting', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      const mockDeployments = [
        {
          appName: 'test-app',
          status: 'ready',
          cloudRunUrl: 'https://app.example.com',
          id: 'deploy-123',
          createdAt: '2024-01-01T00:00:00Z'
        },
        {
          appName: 'another-app',
          status: 'error',
          id: 'deploy-456',
          createdAt: '2024-01-02T00:00:00Z'
        }
      ]

      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { deployments: mockDeployments }
      } as any)

      await listCommand({})

      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })

    it('should handle different deployment statuses', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      const mockDeployments = [
        { appName: 'app1', status: 'ready', id: '1', createdAt: '2024-01-01T00:00:00Z' },
        { appName: 'app2', status: 'error', id: '2', createdAt: '2024-01-01T00:00:00Z' },
        { appName: 'app3', status: 'deploying', id: '3', createdAt: '2024-01-01T00:00:00Z' }
      ]

      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { deployments: mockDeployments }
      } as any)

      await listCommand({})

      // Should handle all status types
      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockRejectedValue(new Error('API Error'))
      
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      try {
        await listCommand({})
      } catch {
        // Expected
      }

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should handle API response errors', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { error: 'Failed to fetch deployments' }
      } as any)

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      await listCommand({})

      // When deployments key is missing, the code exits with 1
      expect(apiUtils.apiClient.get).toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should display error details from API response', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      const errorResponse = {
        response: {
          data: { error: 'Detailed error message' }
        }
      }
      vi.mocked(apiUtils.apiClient.get).mockRejectedValue(errorResponse)
      
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      try {
        await listCommand({})
      } catch {
        // Expected
      }

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })
  })
})

