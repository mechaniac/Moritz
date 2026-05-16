import React from 'react';
import { createRoot } from 'react-dom/client';
import { MagdalenaProvider } from '@christof/magdalena/react';
import '@christof/magdalena/styles.css';
import { App } from './app.js';
import './styles.css';
import { syncLocalOverridesToRepo } from './state/persistence.js';
import { builtInFonts } from './data/builtInFonts.js';
import { getFileFont } from './data/fontFiles.js';

// One-shot migration: in dev, push any in-browser edits of the system fonts
// into the repo as `src/data/fonts/<id>.json` if no file exists yet. This
// captures pre-existing localStorage overrides on the first run after the
// file-based-fonts feature was introduced.
void syncLocalOverridesToRepo(
  builtInFonts.map((f) => f.id),
  (id) => !!getFileFont(id),
);

const el = document.getElementById('root');
if (!el) throw new Error('Missing #root');
createRoot(el).render(
  <React.StrictMode>
    {/*
      Magdalena owns the shell root and dev settings. Moritz still keeps
      app-local module styling while it migrates the remaining UI tokens.
    */}
    <MagdalenaProvider
      appId="moritz"
      storageKey="moritz.magdalena.settings.v1"
    >
      <App />
    </MagdalenaProvider>
  </React.StrictMode>,
);
