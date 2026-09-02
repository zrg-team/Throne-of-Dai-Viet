import { setDynastyFounder } from '../../../state/dynasty';
import { CoronationSheet } from '../../../ui/coronation/CoronationSheet';
import { PROMPT_FOOTER_HEIGHT } from '../constants';
import { promptFoot } from './frame';
import type { ConquestUIScene } from '../../ConquestUIScene';

/**
 * Lễ Đăng Quang, hosted inside a Dragon Ascent prompt.
 *
 * The sheet itself is `ui/coronation/CoronationSheet` and is shared with the Temple on the Tông
 * Phả page; this file is only the prompt's half of the contract — a scroll body, a pinned foot,
 * and the two ways the rite can end.
 *
 * `self.coronationSheet` survives the redraw on purpose. `replaceLanePage` empties the modal
 * layer and destroys the scroll areas, which is exactly what a stepper tap needs to happen; the
 * *choice* must not go with it, or every tap would reset the king to the one the sheet opened on.
 */
export function showCoronation(self: ConquestUIScene): void {
  const sheet = self.coronationSheet ?? new CoronationSheet({
    scene: self,
    ui: self.ui,
    mode: 'coronation',
    redraw: () => self.replaceLanePage(() => showCoronation(self)),
    finish: (founder) => {
      setDynastyFounder(founder);
      self.coronationSheet = undefined;
      // Any id at all: the resolver's `coronation` case takes what the store now holds and
      // seats it on the run's king. Deliberately not an option id — there is nothing here for
      // the systems to choose between, and inventing one would put a second source of truth
      // beside the store.
      self.choose('crowned');
    },
    skip: () => {
      // Nothing is written here. The resolver rolls a complete founder when the store is still
      // empty, so a skip and a finished rite leave the store in exactly the same shape — and no
      // screen downstream ever needs a second path for the uncrowned house.
      self.coronationSheet = undefined;
      self.choose('skip');
    },
  });
  self.coronationSheet = sheet;

  const { body, bodyWidth, content, finish } = self.promptScrollBody(
    sheet.title(),
    sheet.subtitle(),
    PROMPT_FOOTER_HEIGHT,
  );
  const used = sheet.draw(body, bodyWidth);
  finish(used);
  promptFoot(self, content, sheet.foot());
}
