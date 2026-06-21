import { ANITA_MANIFEST_SCHEMA_VERSION, type AnitaManifest } from '@christof/anita';
import manifestData from 'virtual:anita-project-status';

export interface AnitaProjectStatus {
  readonly ok: boolean;
  readonly projectRoot: string;
  readonly source: 'runtime-vite-typescript';
  readonly error?: string | undefined;
  readonly manifest?: AnitaManifest | undefined;
}

const EMPTY_ANITA_MANIFEST: AnitaManifest = {
  schemaVersion: ANITA_MANIFEST_SCHEMA_VERSION,
  generated: '1970-01-01T00:00:00.000Z',
  generator: 'moritz',
  packages: [],
  entryPoints: [],
};

export function readAnitaProjectStatus(): AnitaProjectStatus {
  return manifestData as AnitaProjectStatus;
}

export function loadAnitaManifest(): AnitaManifest {
  const status = readAnitaProjectStatus();
  const manifest = status.ok ? status.manifest : undefined;
  return isCurrentAnitaManifest(manifest) ? manifest : EMPTY_ANITA_MANIFEST;
}

function isCurrentAnitaManifest(value: AnitaManifest | undefined): value is AnitaManifest {
  return value?.schemaVersion === ANITA_MANIFEST_SCHEMA_VERSION;
}
