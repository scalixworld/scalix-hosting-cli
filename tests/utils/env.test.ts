/**
 * Tests for Environment Variable Utilities
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import fs from 'fs/promises'
import * as envUtils from '../../src/utils/env'

// Mock dependencies
vi.mock('fs/promises')

describe('Environment Variable Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadEnvFile', () => {
    it('should load environment variables from file', async () => {
      const envContent = `API_KEY=test-key-123
NODE_ENV=production
PORT=3000
`
      vi.mocked(fs.readFile).mockResolvedValue(envContent)

      const envVars = await envUtils.loadEnvFile('.env')

      expect(envVars).toEqual({
        API_KEY: 'test-key-123',
        NODE_ENV: 'production',
        PORT: '3000'
      })
      expect(fs.readFile).toHaveBeenCalledWith('.env', 'utf-8')
    })

    it('should skip comments', async () => {
      const envContent = `# This is a comment
API_KEY=test-key
# Another comment
NODE_ENV=production
`
      vi.mocked(fs.readFile).mockResolvedValue(envContent)

      const envVars = await envUtils.loadEnvFile('.env')

      expect(envVars).toEqual({
        API_KEY: 'test-key',
        NODE_ENV: 'production'
      })
    })

    it('should skip empty lines', async () => {
      const envContent = `API_KEY=test-key

NODE_ENV=production

PORT=3000
`
      vi.mocked(fs.readFile).mockResolvedValue(envContent)

      const envVars = await envUtils.loadEnvFile('.env')

      expect(envVars).toEqual({
        API_KEY: 'test-key',
        NODE_ENV: 'production',
        PORT: '3000'
      })
    })

    it('should remove quotes from values', async () => {
      const envContent = `API_KEY="quoted-value"
NODE_ENV='single-quoted'
PORT=3000
`
      vi.mocked(fs.readFile).mockResolvedValue(envContent)

      const envVars = await envUtils.loadEnvFile('.env')

      expect(envVars).toEqual({
        API_KEY: 'quoted-value',
        NODE_ENV: 'single-quoted',
        PORT: '3000'
      })
    })

    it('should handle empty values', async () => {
      const envContent = `API_KEY=
NODE_ENV=production
`
      vi.mocked(fs.readFile).mockResolvedValue(envContent)

      const envVars = await envUtils.loadEnvFile('.env')

      expect(envVars).toEqual({
        API_KEY: '',
        NODE_ENV: 'production'
      })
    })

    it('should handle values with equals signs', async () => {
      const envContent = `DATABASE_URL=postgresql://user:pass@host:5432/db
API_KEY=key=with=equals
`
      vi.mocked(fs.readFile).mockResolvedValue(envContent)

      const envVars = await envUtils.loadEnvFile('.env')

      expect(envVars).toEqual({
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        API_KEY: 'key=with=equals'
      })
    })

    it('should trim whitespace from keys and values', async () => {
      const envContent = `  API_KEY  =  test-key  `
      vi.mocked(fs.readFile).mockResolvedValue(envContent)

      const envVars = await envUtils.loadEnvFile('.env')

      expect(envVars).toEqual({
        API_KEY: 'test-key'
      })
    })

    it('should return empty object when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' } as any)

      const envVars = await envUtils.loadEnvFile('.env')

      expect(envVars).toEqual({})
    })

    it('should throw error for other file system errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'))

      await expect(envUtils.loadEnvFile('.env')).rejects.toThrow('Permission denied')
    })

    it('should handle complex .env file', async () => {
      const envContent = `# Production environment
NODE_ENV=production
API_URL=https://api.example.com

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Feature flags
ENABLE_FEATURE_X=true
ENABLE_FEATURE_Y=false

# Empty value
OPTIONAL_VAR=
`
      vi.mocked(fs.readFile).mockResolvedValue(envContent)

      const envVars = await envUtils.loadEnvFile('.env')

      expect(envVars).toEqual({
        NODE_ENV: 'production',
        API_URL: 'https://api.example.com',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/mydb',
        ENABLE_FEATURE_X: 'true',
        ENABLE_FEATURE_Y: 'false',
        OPTIONAL_VAR: ''
      })
    })
  })
})

