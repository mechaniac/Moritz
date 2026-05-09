import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FONTS_DIR = path.resolve(__dirname, 'src/data/fonts');
const STYLES_DIR = path.resolve(__dirname, 'src/data/styles');
const PAGES_DIR = path.resolve(__dirname, 'src/data/pages');
const BUBBLES_DIR = path.resolve(__dirname, 'src/data/bubbles');

const safeId = (raw: string): string | null => {
  // Same character class our UI's sanitizeId produces.
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  return raw;
};

/**
 * Dev-only endpoint to read/write JSON files for fonts, styles and pages
 * under `src/data/{fonts,styles,pages}/`. Lets the developer save the
 * in-browser state straight back into the repo so edits get version-
 * controlled.
 *
 *   PUT/POST  /__moritz/<kind>/:id  body=JSON envelope -> writes <id>.json
 *   DELETE    /__moritz/<kind>/:id                     -> removes <id>.json
 *   GET       /__moritz/<kind>/:id                     -> reads  <id>.json
 *
 * `<kind>` is one of `fonts`, `styles`, `pages`.
 */
function moritzFiles(): Plugin {
  const dirs: Record<string, string> = {
    fonts: FONTS_DIR,
    styles: STYLES_DIR,
    pages: PAGES_DIR,
    bubbles: BUBBLES_DIR,
  };
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url) return next();
    const m = /^\/__moritz\/(fonts|styles|pages|bubbles)\/(.+)$/.exec(req.url);
    if (!m) return next();
    const kind = m[1] as 'fonts' | 'styles' | 'pages' | 'bubbles';
    const dir = dirs[kind];
    const id = safeId(decodeURIComponent(m[2]));
    if (!id) {
      res.statusCode = 400;
      res.end(`Bad ${kind.slice(0, -1)} id`);
      return;
    }
    const file = path.join(dir, `${id}.json`);
    try {
      if (req.method === 'PUT' || req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = Buffer.concat(chunks).toString('utf8');
        JSON.parse(body); // validate
        await fs.mkdir(dir, { recursive: true });
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
    name: 'moritz-files',
    configureServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), moritzFiles()],
  server: {
    watch: {
      // Saving writes into `src/data/{fonts,styles,pages}/<id>.json`. We
      // don't want that to trigger HMR / a full reload — it would yank
      // the user out of whatever they're editing. The file is the source
      // of truth on next reload, but during a session the in-memory
      // state is authoritative.
      ignored: [
        '**/src/data/fonts/**',
        '**/src/data/styles/**',
        '**/src/data/pages/**',
        '**/src/data/bubbles/**',
      ],
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
