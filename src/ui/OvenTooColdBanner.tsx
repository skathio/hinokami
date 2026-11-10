// FR-10 / FRD §F2 exception flow — shown when `adaptBake` (via `startSession`) reports the
// user's oven can't reliably bake this recipe at all (< `pizzaBounds.ovenMin`, currently 200°C).
//
// There is only one action here — "Change temperature" — not a "Proceed anyway" override. The
// phase file's narrative draft mentions offering both; the actually-shipped engine contract
// (`decisions.md P2`, verified) resolves FRD §F2's "(a) hard block or (b) caveated best-effort"
// choice as a firm *combination* rather than a user-facing toggle: adaptBake hard-blocks below
// 200°C (this banner) and *automatically* returns a caveated success for 200–219°C (no banner,
// no confirmation needed — `bakeAdaptation.caveat` is already set on a normal `ok: true` result).
// There is no mechanism in the engine to force a bake below 200°C, and adding one would be an
// engine change (out of scope — this iteration must not touch `src/engine/`/`src/recipes/`
// business logic). See this iteration's coder report for the full reasoning; flagged as a
// documented clarification, not a plan-change (behavior matches the verified P2 decision exactly).
export interface OvenTooColdBannerProps {
  reason: string;
  onChangeTemperature: () => void;
}

export default function OvenTooColdBanner({ reason, onChangeTemperature }: OvenTooColdBannerProps) {
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-100"
    >
      <p className="font-medium">This recipe needs a hotter oven</p>
      <p className="mt-1">{reason}</p>
      <button
        type="button"
        onClick={onChangeTemperature}
        className="mt-3 min-h-11 rounded-md border border-amber-600 px-4 py-2 font-medium text-amber-100 hover:bg-amber-900/40"
      >
        Change temperature
      </button>
    </div>
  );
}
