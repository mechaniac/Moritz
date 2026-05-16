import { THEMES, useThemeStore, type ThemeId } from '../state/themeStore.js';
import { MoritzLabel } from './MoritzText.js';

/**
 * Settings modal — currently only houses the colour-scheme picker.
 *
 * Lives in `ui/` so it can be mounted by `app.tsx` once at the root,
 * outside any module-scope wrapper. Each option draws six little
 * swatches showing the per-module bg + accent of that scheme so the
 * user can compare them at a glance without applying.
 */
export function SettingsModal(): JSX.Element | null {
  const open = useThemeStore((s) => s.settingsOpen);
  const close = useThemeStore((s) => s.closeSettings);
  const active = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  if (!open) return null;

  return (
    <div
      className="mz-modal-backdrop"
      onClick={close}
      role="presentation"
    >
      <div
        className="mz-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <h2>
          <MoritzLabel text="Colour scheme" size={18} />
        </h2>
        {THEMES.map((t) => (
          <ThemeOption
            key={t.id}
            id={t.id}
            name={t.name}
            blurb={t.blurb}
            active={active === t.id}
            onPick={() => setTheme(t.id)}
          />
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={close} aria-label="Close">
            <MoritzLabel text="Close" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** A single picker row. The swatches read the would-be palette values
 *  by setting `data-theme` locally — that way the row previews the
 *  scheme without committing to it. */
function ThemeOption(props: {
  id: ThemeId;
  name: string;
  blurb: string;
  active: boolean;
  onPick: () => void;
}): JSX.Element {
  return (
    <div
      data-theme={props.id}
      className={`mz-theme-option${props.active ? ' mz-theme-option--active' : ''}`}
      onClick={props.onPick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onPick();
        }
      }}
    >
      <div className="mz-theme-option__swatches">
        <span className="mz-theme-option__swatch" style={{ background: 'var(--mz-glyph-panel)' }} />
        <span className="mz-theme-option__swatch" style={{ background: 'var(--mz-glyph-accent)' }} />
        <span className="mz-theme-option__swatch" style={{ background: 'var(--mz-bubble-panel)' }} />
        <span className="mz-theme-option__swatch" style={{ background: 'var(--mz-bubble-accent)' }} />
        <span className="mz-theme-option__swatch" style={{ background: 'var(--mz-style-panel)' }} />
        <span className="mz-theme-option__swatch" style={{ background: 'var(--mz-style-accent)' }} />
        <span className="mz-theme-option__swatch" style={{ background: 'var(--mz-type-panel)' }} />
        <span className="mz-theme-option__swatch" style={{ background: 'var(--mz-type-accent)' }} />
      </div>
      <div className="mz-theme-option__text">
        <span className="mz-theme-option__name">
          <MoritzLabel text={props.name} size={12} />
        </span>
        <span className="mz-theme-option__blurb">
          <MoritzLabel text={props.blurb} size={10} />
        </span>
      </div>
    </div>
  );
}
