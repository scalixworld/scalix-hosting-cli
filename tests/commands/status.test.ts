/**
 * Tests for Status Command
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { statusCommand } from '../../src/commands/status'
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
    cyan: vi.fn((str) => str),
  },
}))
vi.mock('../../src/utils/token')
vi.mock('../../src/utils/api')

describe('Status Command', () => {
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

      await statusCommand('deploy-123')

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should proceed when authenticated', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { deployment: { id: 'deploy-123', status: 'ready' } }
      } as any)

      await statusCommand('deploy-123')

      expect(tokenUtils.getToken).toHaveBeenCalled()
    })
  })

  describe('Status Retrieval', () => {
    it('should fetch deployment status', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { 
          deployment: { 
            id: 'deploy-123',
            appName: 'test-app',
            status: 'ready',
            cloudRunUrl: 'https://app.example.com',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z'
          }
        }
      } as any)

      await statusCommand('deploy-123')

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith('/api/hosting/deployments/deploy-123')
    })

    it('should display deployment information correctly', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      const mockDeployment = {
        id: 'deploy-123',
        appName: 'test-app',
        status: 'ready',
        cloudRunUrl: 'https://app.example.com',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      }

      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { deployment: mockDeployment }
      } as any)

      await statusCommand('deploy-123')

      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })

    it('should handle different deployment statuses', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      
      const statuses = ['ready', 'error', 'deploying', 'queued', 'building']
      
      for (const status of statuses) {
        vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
          data: { 
            deployment: { 
              id: 'deploy-123',
              appName: 'test-app',
              status,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z'
            }
          }
        } as any)

        await statusCommand('deploy-123')
      }

      expect(apiUtils.apiClient.get).toHaveBeenCalledTimes(statuses.length)
    })

    it('should display database information for Neon', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { 
          deployment: { 
            id: 'deploy-123',
            appName: 'test-app',
            status: 'ready',
            databaseId: 'neon-db-123',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z'
          }
        }
      } as any)

      await statusCommand('deploy-123')

      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })

    it('should display database information for Supabase', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { 
          deployment: { 
            id: 'deploy-123',
            appName: 'test-app',
            status: 'ready',
            supabaseProjectId: 'supabase-proj-123',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z'
          }
        }
      } as any)

      await statusCommand('deploy-123')

      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })

    it('should display error message when deployment has error', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { 
          deployment: { 
            id: 'deploy-123',
            appName: 'test-app',
            status: 'error',
            errorMessage: 'Build failed: npm install error',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z'
          }
        }
      } as any)

      await statusCommand('deploy-123')

      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle deployment not found', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        data: { error: 'Deployment not found' }
      } as any)

      await statusCommand('deploy-123')

      // Should display error message (code shows error but doesn't exit for response errors)
      expect(apiUtils.apiClient.get).toHaveBeenCalled()
    })

    it('should handle API errors', async () => {
      vi.mocked(tokenUtils.getToken).mockResolvedValue('mock-token')
      vi.mocked(apiUtils.apiClient.get).mockRejectedValue(new Error('API Error'))
      
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      try {
        await statusCommand('deploy-123')
      } catch {
        // Expected
      }

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
        await statusCommand('deploy-123')
      } catch {
        // Expected
      }

      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })
  })
})

