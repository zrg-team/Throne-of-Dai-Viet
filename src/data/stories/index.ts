import { countingHouse } from './countingHouse';
import { dienHong } from './dienHong';
import { gooseFeathers } from './gooseFeathers';
import { granaries } from './granaries';
import { reedBanner } from './reedBanner';
import { riverStakes } from './riverStakes';
import { theBoyWithTheOrange } from './theBoyWithTheOrange';
import type { StoryTemplate } from '../../systems/story/types';

/**
 * The Chronicle's catalogue.
 *
 * Six deep stories rather than twelve shallow ones: a pool needs enough fragments that it does
 * not visibly repeat inside one run, which is worse than a chain — a chain at least does not
 * repeat itself. Depth per story is what buys the dynamism, so the count stays small on purpose.
 *
 * **Template ids and fragment ids are an append-only compatibility contract.** A live story in
 * the save holds the id of the fragment it last spoke and the memory flags it has written;
 * renaming one loads an old save into a dangling reference. Add freely, never rename, never
 * reuse, and retire by removing the fragment from the pool rather than deleting its id.
 */
export const storyTemplates: StoryTemplate[] = [
  reedBanner,
  gooseFeathers,
  granaries,
  riverStakes,
  countingHouse,
  dienHong,
  theBoyWithTheOrange,
];

const byId = new Map(storyTemplates.map((template) => [template.id, template]));

export function storyTemplate(id: string): StoryTemplate | undefined {
  return byId.get(id);
}
