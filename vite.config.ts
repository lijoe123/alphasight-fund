import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      {
        name: 'configure-server',
        configureServer(server) {
          server.middlewares.use('/api/funds', async (req, res, next) => {
            const fs = await import('fs');
            // const path = await import('path'); // Already imported
            const csvPath = path.resolve(__dirname, '持有股票.csv');

            if (req.method === 'GET') {
              try {
                if (fs.existsSync(csvPath)) {
                  const content = fs.readFileSync(csvPath, 'utf-8');
                  res.setHeader('Content-Type', 'application/json');

                  // Simple CSV Parse
                  const lines = content.split(/\r\n|\n/).filter(l => l.trim().length > 0);
                  const funds = [];
                  // Skip header if present
                  const startIdx = (lines[0] && (lines[0].includes('Code') || lines[0].includes('代码'))) ? 1 : 0;

                  for (let i = startIdx; i < lines.length; i++) {
                    const parts = lines[i].split(',').map(p => p.trim());
                    if (parts.length >= 3) {
                      funds.push({
                        code: parts[0],
                        cost: parseFloat(parts[1]),
                        shares: parseFloat(parts[2]),
                        name: parts[3] || undefined
                      });
                    }
                  }
                  res.end(JSON.stringify(funds));
                } else {
                  res.end(JSON.stringify([]));
                }
              } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: String(e) }));
              }
            } else if (req.method === 'POST') {
              const chunks = [];
              req.on('data', chunk => chunks.push(chunk));
              req.on('end', () => {
                try {
                  const body = JSON.parse(Buffer.concat(chunks).toString());
                  const funds = body.funds; // Expect { funds: [...] }

                  // Convert to CSV
                  const header = "基金代码,持仓成本,持有份额,基金名称\n";
                  const rows = funds.map(f => `${f.code},${f.cost},${f.shares},${f.name || ''}`).join('\n');

                  fs.writeFileSync(csvPath, header + rows, 'utf-8');

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true }));
                } catch (e) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: String(e) }));
                }
              });
            } else {
              next();
            }
          });
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
