/**
 * Validation Utilities
 * Centralized input validation functions
 */

import { DEPLOYMENT_ID_PATTERN, APP_NAME_PATTERN, ENV_VAR_NAME_PATTERN } from './constants';

/**
 * Validate deployment ID format
 */
export function validateDeploymentId(deploymentId: string): { valid: boolean; error?: string } {
  if (!deploymentId || deploymentId.trim().length === 0) {
    return { valid: false, error: 'Deployment ID cannot be empty' };
  }
  
  if (deploymentId.length > 100) {
    return { valid: false, error: 'Deployment ID must be 100 characters or less' };
  }
  
  if (!DEPLOYMENT_ID_PATTERN.test(deploymentId)) {
    return { 
      valid: false, 
      error: 'Deployment ID must contain only alphanumeric characters, hyphens, and underscores' 
    };
  }
  
  return { valid: true };
}

/**
 * Validate app name format
 */
export function validateAppName(appName: string): { valid: boolean; error?: string } {
  if (!appName || appName.trim().length === 0) {
    return { valid: false, error: 'App name cannot be empty' };
  }
  
  if (appName.length > 63) {
    return { valid: false, error: 'App name must be 63 characters or less' };
  }
  
  if (!APP_NAME_PATTERN.test(appName)) {
    return { 
      valid: false, 
      error: 'App name must contain only lowercase letters, numbers, and hyphens' 
    };
  }
  
  return { valid: true };
}

/**
 * Validate environment variable name
 */
export function validateEnvVarName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Environment variable name cannot be empty' };
  }
  
  if (name.length > 100) {
    return { valid: false, error: 'Environment variable name must be 100 characters or less' };
  }
  
  if (!ENV_VAR_NAME_PATTERN.test(name)) {
    return { 
      valid: false, 
      error: 'Environment variable name must start with a letter or underscore and contain only uppercase letters, numbers, and underscores' 
    };
  }
  
  return { valid: true };
}

/**
 * Validate environment variable value
 */
export function validateEnvVarValue(value: string): { valid: boolean; error?: string } {
  if (value.length > 10000) {
    return { valid: false, error: 'Environment variable value must be 10,000 characters or less' };
  }
  
  return { valid: true };
}

/**
 * Sanitize deployment ID (remove invalid characters)
 */
export function sanitizeDeploymentId(input: string): string {
  return input.replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 100);
}

/**
 * Sanitize app name (convert to valid format)
 */
export function sanitizeAppName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 63);
}

