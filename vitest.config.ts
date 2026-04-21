import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30 second timeout for tests (OAuth2 polling can take time)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
    // Mock native modules that may not be available in test environment
    deps: {
      inline: ['keytar', 'archiver', 'inquirer', 'open', 'ora', 'chalk'],
    },
  },
})
