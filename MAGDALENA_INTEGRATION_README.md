# Magdalena Integration — pointer

> This file used to be a long inspection report (Nov 2025). Most of its asks
> have since shipped upstream — see the "Replies to In-Flight App Asks"
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

## Status (2026-05-14)

- Moritz depends on `@christof/magdalena` and `@christof/sigrid` via local
  `file:` deps (see [package.json](package.json)).
- No Sift surface has been replaced by Magdalena yet. First pilot target:
  the dev-settings window. See the wishlist for the rolling adoption plan.
- Reserved extension prefix on Sigrid envelopes: `moritz.*`.

If you find anything in `git log` of this file from before this rewrite that
contradicts the canonical docs, the canonical docs win.
