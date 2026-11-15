import type { BakeAdaptation } from '@/recipes/contract';
import { bakeSplitText } from './bakeSplit';

/** The split-bake line under a bake time; renders nothing for a style without a split bake. */
export default function BakeSplitLine({ bake, className }: { bake: BakeAdaptation; className: string }) {
  const text = bakeSplitText(bake);
  return text ? <p className={className}>{text}</p> : null;
}
