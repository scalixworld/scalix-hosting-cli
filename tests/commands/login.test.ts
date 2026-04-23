/**
 * Tests for Login Command
 * Covers: --token flag, --api-key manual entry, and default OAuth2 browser flow.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import http from 'http'
import { loginCommand } from '../../src/commands/login'
import * as tokenUtils from '../../src/utils/token'
import * as apiUtils from '../../src/utils/api'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
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
    red: vi.fn((str: string) => str),
    green: vi.fn((str: string) => str),
    yellow: vi.fn((str: string) => str),
    blue: vi.fn((str: string) => str),
    gray: vi.fn((str: string) => str),
    bold: vi.fn((str: string) => str),
  },
}))

vi.mock('../../src/utils/token')
vi.mock('../../src/utils/api')

// We also need to prevent the real `exec` from opening a browser during tests.
vi.mock('child_process', () => ({
  exec: vi.fn(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

/** Simulate the web app redirecting to the CLI callback server. */
async function simulateCallback(port: number, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: `/callback?code=${code}`, method: 'GET' },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve())
      },
    )
    req.on('error', reject)
    req.end()
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Login Command', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'test'
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    exitSpy.mockRestore()
    delete process.env.NODE_ENV
  })

  // ── --token flag ───────────────────────────────────────────────────────

  describe('Token-based Login (--token)', () => {
    it('should save token when provided and valid', async () => {
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        status: 200,
        data: { user: { id: 'u1' } },
      } as any)
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      await loginCommand({ token: 'test-token-123' })

      expect(apiUtils.apiClient.get).toHaveBeenCalledWith('/api/auth/me', {
        headers: { Authorization: 'Bearer test-token-123' },
      })
      expect(tokenUtils.saveToken).toHaveBeenCalledWith('test-token-123')
    })

    it('should exit(1) when token verification fails', async () => {
      vi.mocked(apiUtils.apiClient.get).mockRejectedValue(new Error('401'))
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      await loginCommand({ token: 'bad-token' })

      // process.exit is mocked so execution continues past the exit call,
      // but we verify that exit(1) was invoked to signal the failure.
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  // ── --api-key flag ─────────────────────────────────────────────────────

  describe('API-Key Login (--api-key)', () => {
    it('should prompt for API key and save on success', async () => {
      const inquirerModule = await import('inquirer')
      vi.mocked(inquirerModule.default.prompt).mockResolvedValue({ apiKey: 'valid-api-key-12345' })
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        status: 200,
        data: { user: { id: 'u1' } },
      } as any)
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      await loginCommand({ apiKey: true })

      expect(inquirerModule.default.prompt).toHaveBeenCalled()
      expect(tokenUtils.saveToken).toHaveBeenCalledWith('valid-api-key-12345')
    })

    it('should exit(1) when prompted API key is invalid', async () => {
      const inquirerModule = await import('inquirer')
      vi.mocked(inquirerModule.default.prompt).mockResolvedValue({ apiKey: 'invalid-key-000' })
      vi.mocked(apiUtils.apiClient.get).mockRejectedValue(new Error('401'))

      await loginCommand({ apiKey: true })

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should validate minimum API key length in the prompt', async () => {
      const inquirerModule = await import('inquirer')
      const promptMock = vi.fn().mockResolvedValue({ apiKey: 'valid-key-12345' })
      vi.mocked(inquirerModule.default.prompt).mockImplementation(promptMock)
      vi.mocked(apiUtils.apiClient.get).mockResolvedValue({
        status: 200,
        data: { user: { id: 'u1' } },
      } as any)
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      await loginCommand({ apiKey: true })

      // Grab the validate function from the prompt config
      const validateFn = promptMock.mock.calls[0]?.[0]?.[0]?.validate
      expect(validateFn).toBeDefined()
      expect(validateFn('short')).toBe('Please enter a valid API key')
      expect(validateFn('long-enough-key')).toBe(true)
    })
  })

  // ── OAuth2 browser flow (default) ──────────────────────────────────────

  describe('OAuth2 Browser Flow (default)', () => {
    it('should start local server, receive callback, exchange code, and save token', async () => {
      // Mock the exchange endpoint
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: { token: 'exchanged-token-xyz' },
      } as any)
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      // Start login (non-blocking) -- it will start a local server and wait
      const loginPromise = loginCommand({})

      // Give the server a moment to start listening
      await new Promise((r) => setTimeout(r, 100))

      // We need to find the port the server chose. The exec mock was called
      // with the URL containing the port.
      const { exec: execMock } = await import('child_process')
      const execCalls = vi.mocked(execMock).mock.calls
      expect(execCalls.length).toBeGreaterThan(0)

      // Extract port from the URL passed to exec
      const openedUrl = execCalls[0][0] as string
      expect(openedUrl).toContain('/cli-auth?port=')
      const portMatch = openedUrl.match(/port=(\d+)/)
      expect(portMatch).not.toBeNull()
      const port = parseInt(portMatch![1], 10)

      // Simulate the browser redirect with an auth code
      await simulateCallback(port, 'my-auth-code')

      // Wait for the login promise to resolve
      await loginPromise

      // Verify the exchange call
      expect(apiUtils.apiClient.post).toHaveBeenCalledWith('/api/auth/exchange-auth-code', {
        code: 'my-auth-code',
      })
      expect(tokenUtils.saveToken).toHaveBeenCalledWith('exchanged-token-xyz')
    })

    it('should exit(1) when exchange returns no token', async () => {
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: { error: 'invalid code' },
      } as any)

      const loginPromise = loginCommand({})
      await new Promise((r) => setTimeout(r, 100))

      const { exec: execMock } = await import('child_process')
      const execCalls = vi.mocked(execMock).mock.calls
      const openedUrl = execCalls[0][0] as string
      const port = parseInt(openedUrl.match(/port=(\d+)/)![1], 10)

      await simulateCallback(port, 'bad-code')
      await loginPromise

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('should respond 404 for non-callback paths', async () => {
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: { token: 'tok' },
      } as any)
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      const loginPromise = loginCommand({})
      await new Promise((r) => setTimeout(r, 100))

      const { exec: execMock } = await import('child_process')
      const openedUrl = vi.mocked(execMock).mock.calls[0][0] as string
      const port = parseInt(openedUrl.match(/port=(\d+)/)![1], 10)

      // Hit a wrong path
      const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port, path: '/wrong', method: 'GET' },
          resolve,
        )
        req.on('error', reject)
        req.end()
      })
      expect(res.statusCode).toBe(404)

      // Now send correct callback so login completes
      await simulateCallback(port, 'code')
      await loginPromise
    })

    it('should respond 400 when callback has no code', async () => {
      vi.mocked(apiUtils.apiClient.post).mockResolvedValue({
        data: { token: 'tok' },
      } as any)
      vi.mocked(tokenUtils.saveToken).mockResolvedValue(undefined)

      const loginPromise = loginCommand({})
      await new Promise((r) => setTimeout(r, 100))

      const { exec: execMock } = await import('child_process')
      const openedUrl = vi.mocked(execMock).mock.calls[0][0] as string
      const port = parseInt(openedUrl.match(/port=(\d+)/)![1], 10)

      // Hit callback without code param
      const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port, path: '/callback', method: 'GET' },
          resolve,
        )
        req.on('error', reject)
        req.end()
      })
      expect(res.statusCode).toBe(400)

      // Complete normally
      await simulateCallback(port, 'code')
      await loginPromise
    })

    it('should time out in test mode (short timeout)', async () => {
      // Don't send any callback -- should time out after ~500ms in test mode
      const loginPromise = loginCommand({})

      await loginPromise

      expect(exitSpy).toHaveBeenCalledWith(1)
    }, 5000)
  })
})
