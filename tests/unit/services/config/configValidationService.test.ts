/* eslint-disable @typescript-eslint/no-explicit-any */
import { validateConfigs } from '../../../../src/services/config/configValidationService';
import { RateLimitStrategy } from '../../../../src/strategies/base';
import { EndpointConfig } from '../../../../src/config/rateLimitConfig';

describe('ConfigValidationService', () => {
  describe('validateConfigs', () => {
    it('should validate valid configurations without errors', () => {
      const validConfigs: EndpointConfig[] = [
        {
          path: '/api/users',
          method: 'GET',
          rules: [
            {
              strategy: RateLimitStrategy.FIXED_WINDOW,
              windowMs: 60000,
              limit: 100,
              keyBy: ['ip'],
            },
          ],
        },
      ];

      const errors = validateConfigs(validConfigs);
      const errorCount = errors.filter((e: any) => e.severity === 'ERROR').length;
      expect(errorCount).toBe(0);
    });

    it('should return errors for invalid configurations', () => {
      const invalidConfigs: EndpointConfig[] = [
        {
          path: '/api/users',
          rules: [
            {
              strategy: 'invalid-strategy' as RateLimitStrategy,
              windowMs: -1000, // Invalid negative window
              limit: 0, // Invalid zero limit
              keyBy: ['invalid-key' as any],
            },
          ],
        },
      ];

      const errors = validateConfigs(invalidConfigs);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should validate token bucket strategy with burst limits', () => {
      const configs: EndpointConfig[] = [
        {
          path: '/api/heavy',
          rules: [
            {
              strategy: RateLimitStrategy.TOKEN_BUCKET,
              windowMs: 60000,
              limit: 10,
              burstLimit: 20,
              refillRate: 0.167,
              keyBy: ['user'],
            },
          ],
        },
      ];

      const errors = validateConfigs(configs);
      const errorCount = errors.filter((e: any) => e.severity === 'ERROR').length;
      expect(errorCount).toBe(0);
    });
  });
});
