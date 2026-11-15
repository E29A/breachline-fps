// serve.ts — a throwaway static server for playing BREACHLINE locally.
//
//   node serve.ts [--port 8080]
//
// It serves only the game/ directory beside this file, only on 127.0.0.1, and answers
// 404 for anything else. It exists so the game can be opened in a desktop browser
// during development; the entry itself needs no server beyond any static host.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const args = process.argv.slice(2);
const flagAt = args.indexOf('--port');
const wanted = flagAt >= 0 ? Number(args[flagAt + 1]) : 8080;
const port = Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function pathInsideRoot(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.endsWith('/')) decoded += 'index.html';
  const file = resolve(join(gameRoot, normalize(decoded)));
  return file === gameRoot || file.startsWith(gameRoot + sep) ? file : null;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const file = pathInsideRoot(url.pathname);
  if (file === null) {
    response.writeHead(403, { 'content-type': 'text/plain' }).end('outside game/\n');
    return;
  }
  let size: number;
  try {
    const info = statSync(file);
    if (!info.isFile()) throw new Error('directory');
    size = info.size;
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('not in game/\n');
    return;
  }
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`BREACHLINE is playable at http://127.0.0.1:${port}/`);
});
