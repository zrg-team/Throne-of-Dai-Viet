import { ANNAL_STORIES } from './annals';
import { CHARGE_STORIES } from './charges';
import { countingHouse } from './countingHouse';
import {
  borrowedSword,
  chamEngineer,
  eatTogether,
  noHeir,
  riceRiot,
  rideTheWind,
  sixtyFiveCitadels,
  slanderedGeneral,
  theAssembly,
  theSubstitution,
  trustedSubordinate,
  unpaidHost,
} from './histories';
import { dienHong } from './dienHong';
import {
  fiveDays,
  ghostInTheSouth,
  mountainAndWater,
  saltRoad,
  theDelayer,
  theSickness,
  thirteenthWarlord,
  withoutSlaughter,
} from './legends';
import { gooseFeathers } from './gooseFeathers';
import { thanhGiong } from './thanhGiong';
import { tienPhat } from './tienPhat';
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

  // The second wave, each built around a different corner of the outcome vocabulary rather than
  // a different anecdote — rules taken and given, hosts that defect, heroes you choose to lose,
  // a rival that comes apart, a capital that turns on you for being rich.
  sixtyFiveCitadels,
  rideTheWind,
  theSubstitution,
  borrowedSword,
  slanderedGeneral,
  trustedSubordinate,
  chamEngineer,
  theAssembly,
  riceRiot,
  noHeir,
  eatTogether,
  unpaidHost,

  // The third wave: the legends, and the parts of the world that had no story attached to them
  // yet — plague, flood, a road nobody is watching, a hero taken alive. Written whisper-heavy on
  // purpose; ambient lines are what make a realm feel inhabited between the decisions.
  fiveDays,
  ghostInTheSouth,
  withoutSlaughter,
  theDelayer,
  theSickness,
  mountainAndWater,
  thanhGiong,
  saltRoad,
  thirteenthWarlord,

  // The fourth wave: the eight that *ask*. Each carries a charge the player accepts or declines,
  // and pays in a card that exists nowhere else — see `data/stories/charges.ts` for why they are
  // deliberately a minority of the catalogue rather than the new default shape.
  ...CHARGE_STORIES.filter((story) => story.id !== 'tien-phat'),
  // Rebuilt as a full campaign in its own file; the charge-story version was the right event
  // with no campaign around it.
  tienPhat,

  // The fifth wave: the annals. Twelve middle-length histories, each built around a *verb* the
  // vocabulary did not have — a diver, a grain fleet, a paper currency, a wall, the examinations,
  // an exile, an amnesty, a captive, a stolen crossbow, a returned sword. Five or six beats each:
  // long enough to have a middle, short enough that a run meets several.
  ...ANNAL_STORIES,
];

const byId = new Map(storyTemplates.map((template) => [template.id, template]));

export function storyTemplate(id: string): StoryTemplate | undefined {
  return byId.get(id);
}
