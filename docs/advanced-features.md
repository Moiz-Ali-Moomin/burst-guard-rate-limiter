# Advanced Rate Limiting Features

This document describes the advanced rate limiting features that have been added to the distributed rate limiter.

## Table of Contents
1. [Dynamic Configuration Loading](#dynamic-configuration-loading)
2. [Configuration Validation](#configuration-validation)
3. [Analytics and Reporting](#analytics-and-reporting)
4. [Sophisticated Rate Limiting Policies](#sophisticated-rate-limiting-policies)
5. [Web-based Configuration Interface](#web-based-configuration-interface)

## Dynamic Configuration Loading

The rate limiter now supports dynamic configuration loading from external JSON files. This allows you to modify rate limiting rules without restarting the service.

### Configuration Files

- `config/rate-limit-rules.json` - Basic rate limiting rules
- `config/advanced-rate-limit-rules.json` - Advanced rate limiting rules with hierarchical and time-based policies

### Environment Variables

- `CONFIG_PATH` - Path to the configuration file (defaults to `./config/rate-limit-rules.json`)

### Features

- File watching: The system automatically reloads configuration when the file changes
- Fallback to static configuration if dynamic loading fails
- Environment variable support for configuration path

## Configuration Validation

The system validates rate limiting configurations to ensure they are consistent and well-formed.

### Validation Features

- Structure validation
- Value validation (limits, windows, strategies)
- Error reporting with severity levels
- Graceful degradation when validation fails

## Analytics and Reporting

The system now tracks rate limiting usage and provides analytics capabilities.

### Tracked Metrics

- Total requests
- Allowed vs blocked requests
- Top paths
- User activity
- Strategy effectiveness
- Hourly breakdowns

### Analytics Endpoints

- `/analytics/summary` - Get usage summary
- `/analytics/recommendations` - Get limit recommendations

## Sophisticated Rate Limiting Policies

Advanced rate limiting strategies have been implemented:

### Hierarchical Rate Limiting

Supports parent-child rate limiting relationships where limits can be defined at different levels.

### Time-Based Rate Limiting

Adjusts rate limits based on:
- Time of day
- Day of week
- Business hours vs off-hours

### Adaptive Rate Limiting

Automatically adjusts limits based on usage patterns and system load.

## Web-Based Configuration Interface

A web-based UI allows administrators to manage rate limiting rules without code changes.

### Accessing the UI

Visit `/config-ui` to access the configuration management interface.

### API Endpoints

- `GET /api/config` - Retrieve current configuration
- `POST /api/config` - Update configuration

## Integration with Existing System

The new features integrate seamlessly with the existing rate limiting infrastructure:

1. Dynamic configuration loading uses the same validation service
2. Analytics data is automatically collected during rate limit checks
3. Advanced strategies are available alongside existing ones
4. Web UI provides a user-friendly interface to the configuration system

## Usage Examples

### Dynamic Configuration Example

```json
{
  "rules": [
    {
      "path": "/api/users",
      "method": "GET",
      "rules": [
        {
          "strategy": "time_based",
          "windowMs": 3600000,
          "limit": 1000,
          "priority": 1,
          "keyBy": ["ip"],
          "timeBasedRules": [
            {
              "startTime": "09:00",
              "endTime": "17:00",
              "limitMultiplier": 2.0,
              "daysOfWeek": [1, 2, 3, 4, 5]
            }
          ]
        }
      ]
    }
  ]
}
```

## Conclusion

These advanced features make the rate limiter more flexible, observable, and manageable in production environments.