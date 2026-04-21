/**
 * CLI Constants
 * Centralized configuration values
 */

// API Configuration
export const DEFAULT_API_URL = 'https://api.scalix.world';
export const API_TIMEOUT = 300000; // 5 minutes for deployments
export const API_POLL_TIMEOUT = 5000; // 5 seconds for polling

// Deployment Configuration
export const MAX_DEPLOYMENT_SIZE_MB = 100;
export const MAX_DEPLOYMENT_SIZE_BYTES = MAX_DEPLOYMENT_SIZE_MB * 1024 * 1024;

// Polling Configuration
export const DEPLOYMENT_POLL_INTERVAL = 5000; // 5 seconds
export const DEPLOYMENT_MAX_ATTEMPTS = 120; // 10 minutes (120 * 5 seconds)
export const LOGS_POLL_INTERVAL = 2000; // 2 seconds
export const LOGS_FOLLOW_TAIL = 1000; // Number of log lines to fetch when following
export const OAUTH_POLL_INTERVAL = 5000; // 5 seconds
export const OAUTH_MAX_ATTEMPTS = 60; // 5 minutes (60 * 5 seconds)
export const OAUTH_POLL_INTERVAL_TEST = 10; // 10ms for tests

// Retry Configuration
export const MAX_RETRIES = 3;
export const RETRY_DELAY_BASE = 1000; // 1 second base delay

// Validation Patterns
export const DEPLOYMENT_ID_PATTERN = /^[a-zA-Z0-9-_]+$/;
export const APP_NAME_PATTERN = /^[a-z0-9-]+$/;
export const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
export const ENV_VAR_NAME_PATTERN_STRICT = /^[A-Z_][A-Z0-9_]*$/;

// CLI Version
export const CLI_VERSION = '1.0.0'; // Will be overridden by package.json at build time

