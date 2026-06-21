# Archived Magdalena integration note

Archived historical note. This file is not the current Moritz/Luise architecture checklist. Use [docs/luise-migration-plan.md](../luise-migration-plan.md) for current work.

# Magdalena Integration â€” pointer

> This file used to be a long inspection report (Nov 2025). Most of its asks
> have since shipped upstream â€” see the "Replies to In-Flight App Asks"
> section in
> [../Luise/docs/CONTRIBUTING-AS-CONSUMER.md](../Luise/docs/CONTRIBUTING-AS-CONSUMER.md).
> Keeping the old text here would silently drift from canonical docs
> (charter rule: "don't duplicate what's already canonical").

## Where to look now

- **How to install / consume `@christof/*` packages:**
  [../Luise/docs/CONTRIBUTING-AS-CONSUMER.md](../Luise/docs/CONTRIBUTING-AS-CONSUMER.md)
- **What Moritz still wants from the platform:**
  [docs/platform-team-wishlist.md](docs/platform-team-wishlist.md)
- **Moritz product principles & UI rules** (incl. Sift / Magdalena adoption
  intent): [.github/copilot-instructions.md](.github/copilot-instructions.md)
  and its mirror [CLAUDE.md](CLAUDE.md).

## Status (2026-06-21)

- Moritz depends on `@christof/magdalena` and `@christof/sigrid` via local
  `file:` deps (see [package.json](package.json)).
- The current Luise package layout no longer exposes the older
  `@christof/magdalena/react`, `@christof/magdalena/core`,
  `@christof/sigrid-curves`, `@christof/sigrid-geometry`, or
  `@christof/sigrid/glyph` entrypoints.
- Moritz keeps the previous app behavior through local compatibility
  boundaries in `src/platform/`: Magdalena shell/skin wrappers and Sigrid
  curve/geometry helpers. These are intentionally local until the platform
  offers replacement public APIs.
- Reserved extension prefix on Sigrid envelopes: `moritz.*`.

If you find anything in `git log` of this file from before this rewrite that
contradicts the canonical docs, the canonical docs win.
