import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const skipDirs = new Set([
  ".git",
  ".tmp",
  ".vscode",
  "archive",
  "dist",
  "node_modules",
]);
const skipFiles = new Set([
  "docs\\luise-migration-plan.md",
  "scripts\\check-luise-migration.mjs",
]);
const textExt = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

const forbidden = [
  {
    label: "old Luise checkout path",
    pattern: new RegExp(String.raw`C:[\\/]+WORK[\\/]+Christof[\\/]+Luise`, "i"),
  },
  {
    label: "old Magdalena React entrypoint",
    pattern: new RegExp(`@christof/magdalena/${"react"}`),
  },
  {
    label: "old Magdalena core entrypoint",
    pattern: new RegExp(`@christof/magdalena/${"core"}`),
  },
  {
    label: "old Sigrid curves package",
    pattern: new RegExp(`@christof/${"sigrid-curves"}`),
  },
  {
    label: "old Sigrid geometry package",
    pattern: new RegExp(`@christof/${"sigrid-geometry"}`),
  },
  {
    label: "old Sigrid glyph entrypoint",
    pattern: new RegExp(`@christof/sigrid/${"glyph"}`),
  },
  {
    label: "local Magdalena compatibility shell",
    pattern: /\bmagdalenaCompat\b|\bmagdalenaSkinCompat\b|\bmg-compat\b/,
  },
  {
    label: "local Sigrid geometry compatibility layer",
    pattern: /\bsigridGeometryCompat\b/,
  },
  {
    label: "old compatibility wording",
    pattern: /compatibility boundary|compatibility shim|compatibility layer/i,
  },
];

const failures = [];

for (const file of walk(root)) {
  const rel = relative(root, file);
  if (skipFiles.has(rel)) continue;
  if (!textExt.has(extnameLower(file))) continue;
  const text = readFileSync(file, "utf8");
  for (const rule of forbidden) {
    if (!rule.pattern.test(text)) continue;
    failures.push(`${rel}: ${rule.label}`);
  }
}

if (failures.length > 0) {
  console.error("Luise migration guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Luise migration guard passed");

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const file = join(dir, entry);
    const st = statSync(file);
    if (st.isDirectory()) {
      yield* walk(file);
    } else if (st.isFile()) {
      yield file;
    }
  }
}

function extnameLower(file) {
  const idx = file.lastIndexOf(".");
  return idx === -1 ? "" : file.slice(idx).toLowerCase();
}
