/**
 * API Client
 * Handles API requests to Scalix Hosting
 */

import axios, { AxiosInstance } from 'axios';
import { getToken } from './token';
import { DEFAULT_API_URL, API_TIMEOUT, MAX_RETRIES, RETRY_DELAY_BASE } from './constants';

// Get version from package.json
let cliVersion = '1.0.0';
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  const pkgPath = path.join(__dirname, '../../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  cliVersion = pkg.version || '1.0.0';
} catch {
  // Use default version
}

const API_BASE_URL = process.env.SCALIX_API_URL || DEFAULT_API_URL;

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': `scalix-cli/${cliVersion}`
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Add token to requests
apiClient.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors and token expiration
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle token expiration
    if (error.response?.status === 401) {
      const token = await getToken();
      if (!token) {
        return Promise.reject(new Error('Not authenticated. Please run "scalix login" first.'));
      }
      // Token expired - user needs to re-authenticate
      return Promise.reject(new Error('Authentication token expired. Please run "scalix login" to re-authenticate.'));
    }

    // Retry on network errors or 5xx errors
    if ((!error.response || (error.response.status >= 500 && error.response.status < 600)) &&
      originalRequest &&
      !originalRequest._retry) {
      originalRequest._retry = true;

      // Only retry GET, PUT, PATCH, DELETE requests (not POST to avoid duplicates)
      if (['get', 'put', 'patch', 'delete'].includes(originalRequest.method?.toLowerCase() || '')) {
        const delay = RETRY_DELAY_BASE * (MAX_RETRIES - (originalRequest._retryCount || 0));
        originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;

        if (originalRequest._retryCount <= MAX_RETRIES) {
          await sleep(delay);
          return apiClient(originalRequest);
        }
      }
    }

    // Handle other errors
    if (error.response) {
      // API error
      return Promise.reject(error);
    } else if (error.request) {
      // Network error
      return Promise.reject(new Error('Network error. Please check your connection.'));
    } else {
      // Other error
      return Promise.reject(error);
    }
  }
);

