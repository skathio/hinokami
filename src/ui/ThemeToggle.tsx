// Theme override: Auto (follows the system), Light, Dark. A radiogroup so the three states are
// all visible and reachable with the arrow keys / Tab; the choice lives in `prefs/prefs.ts`.

import { setTheme, usePrefs, type ThemePref } from '@/prefs/prefs';

const OPTIONS: ReadonlyArray<{ value: ThemePref; label: string }> = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function ThemeToggle() {
  const { theme } = usePrefs();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-full border border-line bg-surface p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          onClick={() => setTheme(option.value)}
          className={`min-h-11 min-w-11 rounded-full px-3 text-sm font-medium ${
            theme === option.value ? 'bg-ember text-on-ember' : 'text-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
