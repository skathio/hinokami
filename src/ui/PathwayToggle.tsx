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
      <span className="block text-sm font-medium text-charcoal-200">Fermentation pathway</span>
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
                ? 'border-charcoal-300 bg-charcoal-100 text-charcoal-950'
                : 'border-charcoal-700 text-charcoal-300'
            }`}
          >
            {pathway.name}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
