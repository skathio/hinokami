// "Do you have a stone or steel?" A pan-baked style asks about setting the pan on one (which still
// speeds the bake) rather than baking the dough directly on it.

export interface StoneOrSteelCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  panBaked: boolean;
}

export default function StoneOrSteelCheckbox({ checked, onChange, panBaked }: StoneOrSteelCheckboxProps) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-base text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-6 w-6 accent-ember"
      />
      {panBaked ? 'I will set the pan on a preheated stone or steel' : 'I have a pizza stone or steel'}
    </label>
  );
}
