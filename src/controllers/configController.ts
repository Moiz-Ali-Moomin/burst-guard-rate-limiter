import express, { Request, Response } from 'express';
import { writeFileSync } from 'fs';
import { getDynamicConfigService } from '../services/config/dynamicConfigService';

const router = express.Router();

// Serve the configuration management UI
router.get('/config-ui', (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Rate Limiter Configuration</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .container { max-width: 1200px; margin: 0 auto; }
            .form-group { margin-bottom: 20px; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input, select, textarea {
                width: 100%;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                box-sizing: border-box;
            }
            button {
                background: #007cba;
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            button:hover { background: #005a87; }
            .rule-form {
                border: 1px solid #eee;
                padding: 20px;
                margin: 20px 0;
                border-radius: 4px;
            }
            .rule-list { margin-top: 30px; }
            .rule-item {
                border: 1px solid #eee;
                padding: 15px;
                margin: 10px 0;
                border-radius: 4px;
            }
            .delete-btn {
                background: #dc3545;
                color: white;
                padding: 5px 10px;
                border: none;
                border-radius: 3px;
                cursor: pointer;
            }
            .config-section { margin: 20px 0; }
            h1, h2, h3 { color: #333; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Rate Limiter Configuration</h1>

            <div class="config-section">
                <h2>Add New Rate Limit Rule</h2>
                <form id="ruleForm">
                    <div class="form-group">
                        <label for="path">API Path:</label>
                        <input type="text" id="path" name="path" placeholder="/api/users" required>
                    </div>

                    <div class="form-group">
                        <label for="method">HTTP Method:</label>
                        <select id="method" name="method">
                            <option value="ALL">ALL</option>
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="strategy">Strategy:</label>
                        <select id="strategy" name="strategy" required>
                            <option value="fixed_window">Fixed Window</option>
                            <option value="sliding_window">Sliding Window</option>
                            <option value="sliding_window_counter">Sliding Window Counter</option>
                            <option value="token_bucket">Token Bucket</option>
                            <option value="hierarchical">Hierarchical</option>
                            <option value="time_based">Time Based</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="windowMs">Window (ms):</label>
                        <input type="number" id="windowMs" name="windowMs" value="60000" required>
                    </div>

                    <div class="form-group">
                        <label for="limit">Limit:</label>
                        <input type="number" id="limit" name="limit" value="100" required>
                    </div>

                    <div class="form-group">
                        <label>Key By:</label>
                        <div>
                            <input type="checkbox" id="keyByIp" name="keyBy[]" value="ip">
                            <label for="keyByIp">IP Address</label>
                        </div>
                        <div>
                            <input type="checkbox" id="keyByUser" name="keyBy[]" value="user">
                            <label for="keyByUser">User</label>
                        </div>
                        <div>
                            <input type="checkbox" id="keyByTenant" name="keyBy[]" value="tenant">
                            <label for="keyByTenant">Tenant</label>
                        </div>
                    </div>

                    <button type="submit">Add Rule</button>
                </form>
            </div>

            <div class="config-section">
                <h2>Current Configuration</h2>
                <div id="rulesList"></div>
            </div>
        </div>

        <script>
            // This would be implemented with a proper frontend framework in a real application
            console.log('Configuration UI loaded');
        </script>
    </body>
    </html>
  `);
});

// API endpoint to get current configuration
router.get('/api/config', (_req: Request, res: Response) => {
  try {
    const configService = getDynamicConfigService();
    const configs = configService.getEndpointConfigs();
    res.json(configs);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to load configuration' });
  }
});

// API endpoint to update configuration
router.post('/api/config', (req: Request, res: Response) => {
  try {
    // In a real implementation, this would update the config file
    const configPath = process.env.CONFIG_PATH || './config/rate-limit-rules.json';
    writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    res.json({ message: 'Configuration updated successfully' });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

export default router;
