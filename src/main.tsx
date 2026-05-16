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
      Pilot Magdalena adoption (see docs/platform-team-wishlist.md):
      wrap the Sift-owned app in MagdalenaProvider so .mg-root exists
      and Magdalena components (starting with MgDevSettingsWindow) can
      render alongside Sift while we migrate surface-by-surface.
    */}
    <MagdalenaProvider
      appId="moritz"
      storageKey="moritz.magdalena.settings.v1"
    >
      <App />
    </MagdalenaProvider>
  </React.StrictMode>,
);
