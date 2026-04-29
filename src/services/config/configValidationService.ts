import { RateLimitRule, EndpointConfig } from '../../config/rateLimitConfig';
import { RateLimitStrategy } from '../../strategies/base';

export class ConfigValidationService {
  private static instance: ConfigValidationService;

  private constructor() {}

  public static getInstance(): ConfigValidationService {
    if (!ConfigValidationService.instance) {
      ConfigValidationService.instance = new ConfigValidationService();
    }
    return ConfigValidationService.instance;
  }

  public validateEndpointConfigs(configs: EndpointConfig[]): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!Array.isArray(configs)) {
      errors.push({
        type: 'CONFIG_STRUCTURE',
        message: 'Endpoint configurations must be an array',
        severity: 'ERROR',
      });
      return errors;
    }

    configs.forEach((config, index) => {
      const configErrors = this.validateEndpointConfig(config, index);
      errors.push(...configErrors);
    });

    return errors;
  }

  private validateEndpointConfig(config: EndpointConfig, index: number): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!config.path) {
      errors.push({
        type: 'MISSING_FIELD',
        message: `Endpoint config at index ${index} is missing required "path" field`,
        severity: 'ERROR',
      });
    }

    if (!Array.isArray(config.rules)) {
      errors.push({
        type: 'MISSING_FIELD',
        message: `Endpoint config for path "${config.path}" is missing required "rules" array`,
        severity: 'ERROR',
      });
    } else {
      config.rules.forEach((rule, ruleIndex) => {
        const ruleErrors = this.validateRateLimitRule(rule, config.path, ruleIndex);
        errors.push(...ruleErrors);
      });
    }

    return errors;
  }

  private validateRateLimitRule(
    rule: RateLimitRule,
    path: string,
    ruleIndex: number,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate strategy
    if (!rule.strategy) {
      errors.push({
        type: 'MISSING_FIELD',
        message: `Rule ${ruleIndex} for path "${path}" is missing required "strategy" field`,
        severity: 'ERROR',
      });
    } else if (!Object.values(RateLimitStrategy).includes(rule.strategy as RateLimitStrategy)) {
      errors.push({
        type: 'INVALID_VALUE',
        message: `Rule ${ruleIndex} for path "${path}" has invalid strategy: ${rule.strategy}`,
        severity: 'ERROR',
      });
    }

    // Validate limit
    if (rule.limit === undefined) {
      errors.push({
        type: 'MISSING_FIELD',
        message: `Rule ${ruleIndex} for path "${path}" is missing required "limit" field`,
        severity: 'ERROR',
      });
    } else if (typeof rule.limit !== 'number' || rule.limit <= 0) {
      errors.push({
        type: 'INVALID_VALUE',
        message: `Rule ${ruleIndex} for path "${path}" has invalid limit: ${rule.limit}`,
        severity: 'WARNING',
      });
    }

    // Validate windowMs
    if (rule.windowMs === undefined) {
      errors.push({
        type: 'MISSING_FIELD',
        message: `Rule ${ruleIndex} for path "${path}" is missing required "windowMs" field`,
        severity: 'ERROR',
      });
    } else if (typeof rule.windowMs !== 'number' || rule.windowMs <= 0) {
      errors.push({
        type: 'INVALID_VALUE',
        message: `Rule ${ruleIndex} for path "${path}" has invalid windowMs: ${rule.windowMs}`,
        severity: 'ERROR',
      });
    }

    // Validate keyBy
    if (!Array.isArray(rule.keyBy)) {
      errors.push({
        type: 'MISSING_FIELD',
        message: `Rule ${ruleIndex} for path "${path}" is missing required "keyBy" array`,
        severity: 'ERROR',
      });
    } else if (rule.keyBy.length === 0) {
      errors.push({
        type: 'INVALID_VALUE',
        message: `Rule ${ruleIndex} for path "${path}" has empty "keyBy" array`,
        severity: 'WARNING',
      });
    } else {
      const validKeyByValues = ['ip', 'user', 'tenant'];
      for (const key of rule.keyBy) {
        if (!validKeyByValues.includes(key)) {
          errors.push({
            type: 'INVALID_VALUE',
            message: `Rule ${ruleIndex} for path "${path}" has invalid keyBy value: ${key}`,
            severity: 'WARNING',
          });
        }
      }
      // Check for duplicate keys
      const uniqueKeys = [...new Set(rule.keyBy)];
      if (uniqueKeys.length !== rule.keyBy.length) {
        errors.push({
          type: 'INVALID_VALUE',
          message: `Rule ${ruleIndex} for path "${path}" has duplicate keys in keyBy array`,
          severity: 'WARNING',
        });
      }
    }

    // Validate strategy-specific fields
    if (rule.strategy === RateLimitStrategy.TOKEN_BUCKET) {
      if (
        rule.burstLimit !== undefined &&
        (typeof rule.burstLimit !== 'number' || rule.burstLimit <= 0)
      ) {
        errors.push({
          type: 'INVALID_VALUE',
          message: `Rule ${ruleIndex} for path "${path}" with token bucket strategy has invalid burstLimit: ${rule.burstLimit}`,
          severity: 'WARNING',
        });
      }
      if (
        rule.refillRate !== undefined &&
        (typeof rule.refillRate !== 'number' || rule.refillRate <= 0)
      ) {
        errors.push({
          type: 'INVALID_VALUE',
          message: `Rule ${ruleIndex} for path "${path}" with token bucket strategy has invalid refillRate: ${rule.refillRate}`,
          severity: 'WARNING',
        });
      }
    }

    return errors;
  }

  public validateConfigConsistency(configs: EndpointConfig[]): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for duplicate paths
    const paths = configs.map((config) => config.path);
    const uniquePaths = [...new Set(paths)];
    if (uniquePaths.length !== paths.length) {
      errors.push({
        type: 'DUPLICATE_PATH',
        message: 'Duplicate paths found in configuration',
        severity: 'WARNING',
      });
    }

    // Check for conflicting rules (same path with different methods)
    const pathMethodMap = new Map<string, string[]>();
    configs.forEach((config) => {
      if (pathMethodMap.has(config.path)) {
        const methods = pathMethodMap.get(config.path) || [];
        if (methods.includes(config.method || 'ALL')) {
          errors.push({
            type: 'CONFLICTING_RULES',
            message: `Conflicting rules for path ${config.path} with method ${config.method || 'ALL'}`,
            severity: 'WARNING',
          });
        }
        methods.push(config.method || 'ALL');
        pathMethodMap.set(config.path, methods);
      } else {
        pathMethodMap.set(config.path, [config.method || 'ALL']);
      }
    });

    return errors;
  }
}

export interface ValidationError {
  type: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export function validateConfigs(configs: EndpointConfig[]): ValidationError[] {
  const validator = ConfigValidationService.getInstance();
  const errors = validator.validateEndpointConfigs(configs);
  const consistencyErrors = validator.validateConfigConsistency(configs);
  return [...errors, ...consistencyErrors];
}
