import type { BakeAdaptation } from '@/recipes/contract';

/** The split-bake line under the bake time, in the same whole minutes the card shows, so the
 * two parts add up to the total. Undefined when the style bakes its toppings throughout. */
export function bakeSplitText(bake: BakeAdaptation): string | undefined {
  if (bake.cheeseMinutes === undefined) return undefined;
  const total = Math.round(bake.bakeTimeMinutes);
  const cheese = Math.min(Math.max(1, Math.round(bake.cheeseMinutes)), total - 1);
  return `Sauce only for ${total - cheese} min, then mozzarella for the last ${cheese} min.`;
}
