import type { EraRule } from '../../data/history';
import { PIGMENT } from './palette';

/**
 * What the two colours on the Dynasties timeline mean, in one place — the rail, the nodes and the
 * legend all read from here.
 *
 * Two, and never a third. There was a `mixed` state for the ages that began Vietnamese and ended
 * occupied, drawn as a half-and-half disc and labelled "sovereignty lost partway", and it was a
 * fudge: it put the Hồ and the twenty years of Ming rule that followed them under one heading, and
 * the Nguyễn and the French protectorate under another. Those are different things and the fix is
 * to separate the ages, not to invent a colour for the blur.
 */
export const RULE_COLOUR: Record<EraRule, number> = {
  // Sỏi son — the red this game reserves for the player, spent here on the ages the country held
  // itself. It is the same claim in both places.
  self: PIGMENT.son,
  // Chàm. Cold, and the only thing on the timeline that is not warm — which is the point. Soot was
  // the obvious pick and the wrong one: every rule and outline in this interface is already soot,
  // so a thousand years of occupation would have read as ordinary ink.
  foreign: PIGMENT.cham,
};
