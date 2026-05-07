import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FONTS_DIR = path.resolve(__dirname, 'src/data/fonts');

const safeId = (raw: string): string | null => {
  // Same character class our UI's sanitizeId produces.
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  return raw;
};

/**
 * Dev-only endpoint to read/write font JSON files in `src/data/fonts/`.
 * Lets the developer save the in-browser font straight back into the repo
 * so edits to the system fonts get version-controlled.
 *   PUT/POST  /__moritz/fonts/:id  body=JSON envelope -> writes <id>.json
 *   DELETE    /__moritz/fonts/:id                     -> removes <id>.json
 *   GET       /__moritz/fonts/:id                     -> reads  <id>.json
 */
function moritzFontFiles(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url || !req.url.startsWith('/__moritz/fonts/')) return next();
    const id = safeId(decodeURIComponent(req.url.slice('/__moritz/fonts/'.length)));
    if (!id) {
      res.statusCode = 400;
      res.end('Bad font id');
      return;
    }
    const file = path.join(FONTS_DIR, `${id}.json`);
    try {
      if (req.method === 'PUT' || req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = Buffer.concat(chunks).toString('utf8');
        JSON.parse(body); // validate
        await fs.mkdir(FONTS_DIR, { recursive: true });
        await fs.writeFile(file, body, 'utf8');
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method === 'DELETE') {
        await fs.rm(file, { force: true });
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method === 'GET') {
        const body = await fs.readFile(file, 'utf8');
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
        return;
      }
      res.statusCode = 405;
      res.end();
    } catch (err) {
      res.statusCode = 500;
      res.end((err as Error).message);
    }
  };
  return {
    name: 'moritz-font-files',
    configureServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), moritzFontFiles()],
  server: {
    watch: {
      // Saving a font writes `src/data/fonts/<id>.json`. We don't want that
      // to trigger HMR / a full reload — it would yank the user out of the
      // glyph they're editing. The file is the source of truth on next
      // reload, but during a session the in-memory state is authoritative.
      ignored: ['**/src/data/fonts/**'],
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
