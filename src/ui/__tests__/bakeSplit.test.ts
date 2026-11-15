import { describe, expect, it } from 'vitest';
import { bakeSplitText } from '../bakeSplit';

describe('bakeSplitText', () => {
  it('splits the shown total into a sauce-only part and a cheese part that add up', () => {
    expect(bakeSplitText({ bakeTempC: 290, bakeTimeMinutes: 7.9, cheeseMinutes: 2.3 })).toBe(
      'Sauce only for 6 min, then mozzarella for the last 2 min.',
    );
  });

  it('is absent when the style has no split bake', () => {
    expect(bakeSplitText({ bakeTempC: 250, bakeTimeMinutes: 15 })).toBeUndefined();
  });

  it('always leaves at least a minute of sauce-only bake', () => {
    expect(bakeSplitText({ bakeTempC: 280, bakeTimeMinutes: 2.4, cheeseMinutes: 1.2 })).toBe(
      'Sauce only for 1 min, then mozzarella for the last 1 min.',
    );
  });
});
