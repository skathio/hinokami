// Fermentation pathway selector (FR-3). Per FRD F1's validation table, pathway has NO default —
// "no default that hides the timing tradeoff" — so `value` starts unset and `ConfigScreen`
// requires an explicit choice before Generate can proceed.

import type { Pathway, PathwayRef } from '@/recipes/contract';

export interface PathwayToggleProps {
  pathways: ReadonlyArray<Pathway>;
  value: PathwayRef | '';
  onChange: (id: PathwayRef) => void;
  error?: string;
}

export default function PathwayToggle({ pathways, value, onChange, error }: PathwayToggleProps) {
  return (
    <div>
      <span className="block text-sm font-medium text-ink">Fermentation pathway</span>
      <div role="radiogroup" aria-label="Fermentation pathway" className="mt-1 flex flex-wrap gap-2">
        {pathways.map((pathway) => (
          <button
            key={pathway.id}
            type="button"
            role="radio"
            aria-checked={value === pathway.id}
            onClick={() => onChange(pathway.id)}
            className={`min-h-11 rounded-md border px-4 py-2 text-sm ${
              value === pathway.id
                ? 'border-ember bg-ember text-on-ember'
                : 'border-line text-muted'
            }`}
          >
            {pathway.name}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
