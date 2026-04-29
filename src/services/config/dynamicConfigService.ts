import { EndpointConfig } from '../../config/rateLimitConfig';
import { readFileSync, watch, statSync, FSWatcher } from 'fs';
import { logger } from '../../utils/logger';
import { validateConfigs } from './configValidationService';

export interface DynamicConfigOptions {
  configPath?: string;
  watchConfig?: boolean;
  reloadIntervalMs?: number;
}

export class DynamicConfigService {
  private configPath: string;
  private endpointConfigs: EndpointConfig[] = [];
  private watcher: FSWatcher | null = null;
  private reloadInterval: NodeJS.Timeout | null = null;
  private lastModified: number = 0;

  constructor(options: DynamicConfigOptions = {}) {
    this.configPath =
      options.configPath || process.env.CONFIG_PATH || './config/rate-limit-rules.json';

    // Load initial configuration
    this.loadConfig();

    // Set up file watching if enabled
    if (options.watchConfig) {
      this.setupFileWatcher();
    } else if (options.reloadIntervalMs) {
      this.setupIntervalWatcher(options.reloadIntervalMs);
    }
  }

  private loadConfig(): void {
    try {
      const configContent = readFileSync(this.configPath, 'utf8');
      const config = JSON.parse(configContent);

      // Validate the configuration structure
      this.validateConfig(config);

      this.endpointConfigs = config.rules || [];

      // Validate the loaded configurations
      const validationErrors = validateConfigs(this.endpointConfigs);
      if (validationErrors.length > 0) {
        const errors = validationErrors.filter((e: { severity: string }) => e.severity === 'ERROR');
        const warnings = validationErrors.filter(
          (e: { severity: string }) => e.severity === 'WARNING',
        );

        if (errors.length > 0) {
          logger.error({ errors }, 'Configuration validation failed with errors');
          throw new Error(
            `Configuration validation failed: ${errors.map((e: { message: string }) => e.message).join(', ')}`,
          );
        }

        if (warnings.length > 0) {
          logger.warn({ warnings }, 'Configuration validation has warnings');
        }
      }

      logger.info({ path: this.configPath }, 'Dynamic rate limit configuration loaded');
    } catch (err) {
      logger.error({ err, path: this.configPath }, 'Failed to load dynamic configuration');
      // Don't throw an error to allow fallback to static configuration
      logger.warn('Falling back to static configuration');
    }
  }

  private validateConfig(config: unknown): void {
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration must be an object');
    }

    const configObj = config as Record<string, unknown>;
    if (!Array.isArray(configObj.rules)) {
      throw new Error('Configuration must have a "rules" array');
    }
  }

  private setupFileWatcher(): void {
    try {
      this.watcher = watch(this.configPath, () => {
        logger.info('Configuration file changed, reloading...');
        this.loadConfig();
      });
    } catch (err) {
      logger.error({ err }, 'Failed to set up file watcher');
    }
  }

  private setupIntervalWatcher(intervalMs: number): void {
    this.reloadInterval = setInterval(() => {
      try {
        const stats = statSync(this.configPath);
        if (stats.mtimeMs > this.lastModified) {
          this.lastModified = stats.mtimeMs;
          logger.info('Configuration file modified, reloading...');
          this.loadConfig();
        }
      } catch (_err) {
        logger.error({ err: _err }, 'Failed to check configuration file modification time');
      }
    }, intervalMs);
  }

  public getEndpointConfigs(): EndpointConfig[] {
    return this.endpointConfigs;
  }

  public close(): void {
    if (this.watcher) {
      this.watcher.close();
    }
    if (this.reloadInterval) {
      clearInterval(this.reloadInterval);
    }
  }
}

// Singleton instance
let dynamicConfigService: DynamicConfigService | null = null;

export function getDynamicConfigService(options?: DynamicConfigOptions): DynamicConfigService {
  if (!dynamicConfigService) {
    dynamicConfigService = new DynamicConfigService(options);
  }
  return dynamicConfigService;
}
