import '@christof/sigrid/styles.css';
import '@christof/magdalena/styles.css';
import './styles.css';
import { mountMoritzApp } from './app-mount.js';
import { syncLocalOverridesToRepo } from './state/persistence.js';
import { builtInFonts } from './data/builtInFonts.js';
import { getFileFont } from './data/fontFiles.js';

void syncLocalOverridesToRepo(
  builtInFonts.map((f) => f.id),
  (id) => !!getFileFont(id),
);

const el = document.getElementById('root');
if (!el) throw new Error('Missing #root');
mountMoritzApp(el);
