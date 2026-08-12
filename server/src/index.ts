import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import app, { ensureBooted } from './app.js';
import { setBroadcast } from './services/conversation.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

if (!isServerless) {
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.send(JSON.stringify({ event: 'connected', data: { message: 'Connected to SMS Sales Agent' } }));
  });

  setBroadcast((event, data) => {
    const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  });

  void (async () => {
    await ensureBooted();
    server.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════╗
║     SMS Sales Agent - Server Running             ║
╠══════════════════════════════════════════════════╣
║  API:       http://localhost:${PORT}/api           ║
║  WebSocket: ws://localhost:${PORT}/ws              ║
║  Dashboard: http://localhost:5173                ║
║  Mode:      ${process.env.DEMO_MODE !== 'false' ? 'DEMO (no API keys needed)' : 'PRODUCTION'}              ║
╚══════════════════════════════════════════════════╝
      `);
    });
  })();
}

export default app;
