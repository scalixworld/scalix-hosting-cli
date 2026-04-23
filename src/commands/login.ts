/**
 * Login Command
 * Handles CLI authentication via OAuth2 browser flow or API key
 *
 * OAuth2 flow:
 *  1. CLI starts a tiny local HTTP server on a random port
 *  2. Opens browser to https://scalix.world/cli-auth?port=PORT
 *  3. User authenticates on the web; web calls generate-auth-code,
 *     then redirects to http://localhost:PORT/callback?code=AUTH_CODE
 *  4. CLI exchanges the code via POST /api/auth/exchange-auth-code
 *  5. Token is stored in ~/.scalix/token
 *  6. Local server shuts down
 */

import http from 'http';
import { exec } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { saveToken } from '../utils/token';
import { apiClient } from '../utils/api';
import { DEFAULT_API_URL } from '../utils/constants';

/** Open a URL in the user's default browser (cross-platform, no deps). */
function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

/** Verify a token against the API. */
async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await apiClient.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.status === 200 && !!response.data?.user;
  } catch {
    return false;
  }
}

// ── OAuth2 Browser Login ───────────────────────────────────────────────────

/**
 * Start a local HTTP server, open the browser, wait for the callback,
 * exchange the auth code for a token, save it, and shut down.
 */
async function browserLogin(spinner: ReturnType<typeof ora>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://localhost`);

        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          res.end('Missing auth code');
          return;
        }

        // Send a nice HTML page back to the browser immediately
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
              <div style="text-align:center">
                <h2>Authentication successful</h2>
                <p>You can close this tab and return to your terminal.</p>
              </div>
            </body>
          </html>
        `);

        // Exchange code for token
        spinner.text = 'Exchanging auth code for token...';
        const exchangeResponse = await apiClient.post('/api/auth/exchange-auth-code', { code });

        if (!exchangeResponse.data?.token) {
          shutdown();
          reject(new Error('Auth code exchange failed — no token returned'));
          return;
        }

        const token: string = exchangeResponse.data.token;

        await saveToken(token);
        spinner.succeed('Authenticated successfully!');
        process.stdout.write(chalk.green('\nYou are now logged in to Scalix Hosting\n'));

        shutdown();
        resolve();
      } catch (err) {
        shutdown();
        reject(err);
      }
    });

    // Listen on a random available port
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Could not determine local server port'));
        return;
      }

      const port = addr.port;
      const apiBase = process.env.SCALIX_API_URL || DEFAULT_API_URL;
      // Build the browser URL – the web app will handle auth and redirect back
      const webBase = apiBase.replace(/^https?:\/\/api\./, 'https://');
      const loginUrl = `${webBase}/cli-auth?port=${port}`;

      spinner.text = 'Opening browser for authentication...';
      openBrowser(loginUrl);

      process.stdout.write(
        chalk.gray(`\n  If your browser did not open, visit:\n  ${loginUrl}\n\n`)
      );
      spinner.text = 'Waiting for authentication in browser...';
    });

    // Timeout after 2 minutes (shorter in tests)
    const timeoutMs = process.env.NODE_ENV === 'test' ? 500 : 120_000;
    const timer = setTimeout(() => {
      shutdown();
      reject(new Error('Authentication timed out — no callback received'));
    }, timeoutMs);

    function shutdown() {
      clearTimeout(timer);
      server.close();
    }
  });
}

// ── API-Key Login (manual entry) ───────────────────────────────────────────

async function apiKeyLogin(spinner: ReturnType<typeof ora>): Promise<void> {
  spinner.stop();

  process.stdout.write(chalk.blue('\nScalix CLI Authentication\n\n'));
  process.stdout.write(
    chalk.gray('You can find your API key at: https://scalix.world/settings/api-keys\n\n')
  );

  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your Scalix API key:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.length < 10) {
          return 'Please enter a valid API key';
        }
        return true;
      },
    },
  ]);

  spinner.start('Verifying API key...');

  const valid = await verifyToken(apiKey);
  if (!valid) {
    spinner.fail('Invalid API key');
    process.stderr.write(chalk.red('\nThe provided API key is invalid or expired\n'));
    process.exit(1);
  }

  await saveToken(apiKey);
  spinner.succeed('Authenticated successfully!');
  process.stdout.write(chalk.green('\nYou are now logged in to Scalix Hosting\n'));
}

// ── Exported entry point ───────────────────────────────────────────────────

export async function loginCommand(options: {
  token?: string;
  apiKey?: boolean;
  browser?: boolean;
}): Promise<void> {
  const spinner = ora('Authenticating...').start();

  try {
    // 1) Direct --token flag
    if (options.token) {
      spinner.text = 'Verifying token...';
      const valid = await verifyToken(options.token);
      if (!valid) {
        spinner.fail('Invalid token');
        process.stderr.write(chalk.red('\nThe provided token is invalid or expired\n'));
        process.exit(1);
      }
      await saveToken(options.token);
      spinner.succeed('Authenticated successfully');
      return;
    }

    // 2) Explicit --api-key flag → manual prompt
    if (options.apiKey) {
      await apiKeyLogin(spinner);
      return;
    }

    // 3) Default: OAuth2 browser flow
    await browserLogin(spinner);
  } catch (error) {
    const err = error as Error;
    spinner.fail('Authentication failed');
    process.stderr.write(chalk.red(`\nError: ${err.message}\n`));
    process.exit(1);
  }
}
