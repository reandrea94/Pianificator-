/**
 * OMAV Suite — server.js
 * Server locale Node.js con API filesystem.
 * Avviare con: node server.js
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 8765;

const MIME = {
  html : 'text/html; charset=utf-8',
  js   : 'application/javascript; charset=utf-8',
  json : 'application/json; charset=utf-8',
  css  : 'text/css; charset=utf-8',
  png  : 'image/png',
  jpg  : 'image/jpeg',
  ico  : 'image/x-icon',
  svg  : 'image/svg+xml',
  txt  : 'text/plain; charset=utf-8',
};

function getMime(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function sendJSON(res, data, code) {
  res.writeHead(code || 200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendError(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: msg }));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function safePath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(ROOT, p);
}

const server = http.createServer(async (req, res) => {
  const url  = new URL(req.url, 'http://localhost');
  const meth = req.method.toUpperCase();

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (meth === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {

    // ════════════════════════════
    //  API FILESYSTEM
    // ════════════════════════════

    // GET /api/ls?path=...
    if (meth === 'GET' && url.pathname === '/api/ls') {
      const p = safePath(url.searchParams.get('path'));
      if (!p) return sendError(res, 400, 'path mancante');
      fs.readdir(p, { withFileTypes: true }, (err, entries) => {
        if (err) return sendError(res, 404, 'Cartella non trovata: ' + err.message);
        const items = entries.map(en => {
          let size = 0;
          if (en.isFile()) {
            try { size = fs.statSync(path.join(p, en.name)).size; } catch (_) {}
          }
          return {
            name : en.name,
            kind : en.isDirectory() ? 'directory' : 'file',
            ext  : en.isFile() ? path.extname(en.name).slice(1).toLowerCase() : '',
            size,
          };
        });
        sendJSON(res, items);
      });
      return;
    }

    // GET /api/read?path=...
    if (meth === 'GET' && url.pathname === '/api/read') {
      const p = safePath(url.searchParams.get('path'));
      if (!p) return sendError(res, 400, 'path mancante');
      fs.readFile(p, (err, data) => {
        if (err) return sendError(res, 404, 'File non trovato: ' + err.message);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(data);
      });
      return;
    }

    // GET /api/exists?path=...
    if (meth === 'GET' && url.pathname === '/api/exists') {
      const p = safePath(url.searchParams.get('path'));
      sendJSON(res, { exists: p ? fs.existsSync(p) : false });
      return;
    }

    // POST /api/write  { path, content } oppure { path, buffer:[...bytes] }
    if (meth === 'POST' && url.pathname === '/api/write') {
      const body = await readBody(req);
      const p = safePath(body.path);
      if (!p) return sendError(res, 400, 'path mancante');
      try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch (_) {}
      const data = body.buffer
        ? Buffer.from(body.buffer)
        : Buffer.from(body.content || '', 'utf8');
      fs.writeFile(p, data, err => {
        if (err) return sendError(res, 500, err.message);
        sendJSON(res, { ok: true });
      });
      return;
    }

    // POST /api/mkdir  { path }
    if (meth === 'POST' && url.pathname === '/api/mkdir') {
      const body = await readBody(req);
      const p = safePath(body.path);
      if (!p) return sendError(res, 400, 'path mancante');
      fs.mkdir(p, { recursive: true }, err => {
        if (err) return sendError(res, 500, err.message);
        sendJSON(res, { ok: true });
      });
      return;
    }

    // POST /api/rename  { oldPath, newPath }
    if (meth === 'POST' && url.pathname === '/api/rename') {
      const body = await readBody(req);
      const op = safePath(body.oldPath);
      const np = safePath(body.newPath);
      if (!op || !np) return sendError(res, 400, 'path mancante');
      fs.rename(op, np, err => {
        if (err) return sendError(res, 500, err.message);
        sendJSON(res, { ok: true });
      });
      return;
    }

    // DELETE /api/delete?path=...
    if (meth === 'DELETE' && url.pathname === '/api/delete') {
      const p = safePath(url.searchParams.get('path'));
      if (!p) return sendError(res, 400, 'path mancante');
      fs.unlink(p, err => {
        if (err) return sendError(res, 500, err.message);
        sendJSON(res, { ok: true });
      });
      return;
    }

    // ════════════════════════════
    //  FILE STATICI
    // ════════════════════════════
    let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);

    // Sicurezza: non servire file fuori dalla cartella del progetto
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': getMime(filePath) });
      res.end(data);
    });

  } catch (e) {
    sendError(res, 500, 'Errore server: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ██████╗ ███╗   ███╗ █████╗ ██╗   ██╗');
  console.log('');
  console.log('  OMAV Suite — Server avviato');
  console.log('  http://localhost:' + PORT);
  console.log('');
  console.log('  API attive:');
  console.log('  GET  /api/ls      — lista cartella');
  console.log('  GET  /api/read    — leggi file');
  console.log('  GET  /api/exists  — verifica esistenza');
  console.log('  POST /api/write   — scrivi file');
  console.log('  POST /api/mkdir   — crea cartella');
  console.log('  POST /api/rename  — rinomina');
  console.log('  DEL  /api/delete  — elimina file');
  console.log('');
  console.log('  Premi Ctrl+C per fermare il server.');
  console.log('');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('  ERRORE: Porta ' + PORT + ' già in uso.');
    console.error('  Chiudi l\'altra istanza del server e riprova.');
  } else {
    console.error('  ERRORE SERVER:', e.message);
  }
  process.exit(1);
});
