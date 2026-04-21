# Contributing to Scalix CLI

Thank you for your interest in contributing to Scalix CLI!

## Development Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd Scalix-CLI

# Install dependencies
npm install

# Build the project
npm run build
```

### Development

```bash
# Run in development mode with hot reload
npm run dev

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

## Project Structure

```
Scalix-CLI/
├── src/
│   ├── commands/       # CLI commands (deploy, list, logs, etc.)
│   ├── utils/          # Utility functions (api, env, token)
│   └── index.ts        # Entry point
├── tests/              # Test files
├── dist/               # Compiled output (generated)
└── package.json
```

## Adding New Commands

1. Create a new file in `src/commands/`
2. Export a command function following the pattern in existing commands
3. Register the command in `src/index.ts`
4. Add tests in `tests/commands/`

## Testing

We use Vitest for testing. Tests should:
- Be placed in `tests/` directory
- Follow naming pattern: `*.test.ts`
- Mock external dependencies
- Test both success and error cases

## Code Style

- Use TypeScript
- Follow existing code style
- Run `npm run lint` before committing
- Run `npm run format` to auto-format

## Submitting Changes

1. Create a feature branch
2. Make your changes
3. Write/update tests
4. Run tests and linting
5. Submit a pull request

## Publishing

The package is published to npm using:

```bash
npm run prepublish  # Builds and tests
npm publish
```

---

Thank you for contributing! 🎉

