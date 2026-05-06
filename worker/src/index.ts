import http from 'http';
import { startWhatsApp } from './whatsapp.js';
import { startScheduler } from './scheduler.js';

const PORT = Number(process.env.PORT || 3001);

// Petit serveur HTTP pour Render (health check + ping cron-job.org)
http
  .createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ts: Date.now() }));
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  })
  .listen(PORT, () => {
    console.log(`[http] listening on ${PORT}`);
  });

startWhatsApp().catch((e) => {
  console.error('fatal', e);
  process.exit(1);
});

startScheduler();
