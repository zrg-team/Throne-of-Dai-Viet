import Phaser from 'phaser';
import { applyPaperFX } from '../ui/ink/PaperFX';
import { RectClip } from '../ui/ink/clipRect';
import { applyRenderScale } from '../game/graphicsQuality';
import { battleTickMs } from '../game/battleOptions';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, PLAYER_KINGDOM_ID } from '../game/constants';
import { codexProgress, storyProgress, getCodex, isHeroUnlocked } from '../state/codex';
import { LEGACY_PERKS, ownsPerk } from '../state/legacy';
import { doctrineBlurb, doctrineName } from '../systems/ascent/RealmDoctrineSystem';
import { powerCardView, skipRefundAmount } from '../systems/ascent/PowerDraftSystem';
import { tierForHero } from '../systems/ascent/SummonSystem';
import { isBossWave, responseCommanderName } from '../systems/ascent/WaveDirector';
import { buildAllConquestTargets, buildConquestTargets, frontWinChance, methodActorLine, methodHasActor, refreshAscentLaneState } from '../systems/ascent/ConquestSystem';
import { landGarrisonPower } from '../systems/ascent/PowerSystem';
import { cancelAcquisition, claimBlockedReason, getClaimRefund, getClaimSlots } from '../systems/AcquisitionSystem';
import {
  armyPower,
  findLandPath,
  getArmyUpgradeOptions,
  getCompositionShares,
  getMusterEstimate,
  issueHuntOrder,
  issueMoveOrder,
  upgradeArmy,
} from '../systems/WarSystem';
import { getCourtBonuses } from '../systems/CourtSystem';
import {
  authorityCap,
  averageCompliance,
  ESTATE_CRISIS,
  estateStanding,
  overreach,
  realisedFactor,
  repealTerms,
  standingWeight,
} from '../systems/DecreeSystem';
import { projectDescription, projectEffectSummary, projectTitle, repealProject } from '../systems/empire/EdictSystem';
import { getProject } from '../data/edicts';
import {
  ALL_SCHOOLS,
  capstoneReady,
  capstonesTaken,
  isSchoolLocked,
  SCHOOL_COMMIT,
  schoolTally,
  takeCapstone,
} from '../systems/decree/SchoolSystem';
import { currentTaxRate, setTaxRate, taxGoldMult, taxGrowthDelta, taxStabilityBase } from '../systems/TaxSystem';
import { lawCardView, seatedEffectSummary } from '../systems/ascent/CourtLaneSystem';
import { envoyOptionDetail } from '../systems/ascent/EnvoySystem';
import { realmStanding } from '../systems/ascent/RivalDirector';
import { ourHosts, theirHosts } from '../systems/ascent/BattleSystem';
import {
  ASCENT_TICK_MS, BATTLE_BEATS_PER_TICK, BATTLE_DEPTH_FAR, BATTLE_DEPTH_NEAR, BATTLE_HIT_STOP_MS,
  BATTLE_FORMATION_WIND, BATTLE_HOST_SCALE, BATTLE_PRESS_TRAVEL, BATTLE_STANCE_RECOVERY,
  ARENA_ROUT_HOLD_MS, BATTLE_ROUT_MORALE, BATTLE_TICK_MS,
  TRIBUTE_REFUSE_TICKS,
} from '../game/ascentConfig';
import { battleTelegraph, battleWindView } from '../systems/ascent/BattleSystem';
import { ALL_COURT_POSITIONS, assignHeroToLand, getCourtPositionLabel } from '../systems/CourtSystem';
import {
  ascentArmyUpkeep,
  buildDistrictBuilding,
  getBuildOptions,
  getLandPopulationGrowth,
  getPlayerTroops,
  getUpgradeOptions,
  heroPayroll,
  refreshAllLandOutputs,
  setLandSpecialization,
  upgradeDistrictBuilding,
} from '../systems/ResourceSystem';
import { buildFocusRows } from '../ui/focusPanel';
import { buildGovernorRows } from '../ui/governorPanel';
import { findFreeCommander } from '../systems/ascent/AutopilotSystem';
import { armyOrders, hostOrderLabel, isAutoHost } from '../systems/ascent/armyOrders';
import { hostOddsAgainst, resupplyPreview } from '../systems/ascent/StandingOrders';
import {
  baggageSeasons,
  defaultMusterPlan,
  fullBaggage,
  musterBlockedReason,
  musterLimits,
  musterRows,
  type MusterPlan,
} from '../systems/ascent/MusterSystem';
import {
  buildHeroPickerRows,
  buildHostPickerRows,
  heroPostingLabel,
  heroTitleLine,
  type HeroPickerRow,
  type HeroPickerTarget,
  type HostPickerRow,
} from '../ui/heroPickerRows';
import { MARCH_MIN_WIN_CHANCE, MIN_ARMY_SOLDIERS, RECRUIT_HUMAN_RESERVE, REMNANT_SHARE, recruitSoldiers } from '../game/ascentConfig';
import { eraLabel } from '../systems/empire/MandateSystem';
import { getEmpirePower, hasPact } from '../systems/DiplomacySystem';
import { compactNumber } from '../utils/format';
import { renderHeroFaceInBox } from '../ui/FaceRenderer';
import { drawStoryBand } from '../ui/ink/storyBand';
import { chronicleTally, countOpenDoors, heldBeat, heldBeatOptions, isMarked, openingFor, openingView, resolveStoryBeat, storyCardsMuted, storyNeedsPlayer, storyOpening, storyParams, storyDrift, storyPath, storyRegard, storySpokenHistory, storyWantsPlayer, takeOpening } from '../systems/story/StorySystem';
import { storyCatalogIds, storyText, storyTitle } from '../i18n/story';
import { chargeTrackerLines } from '../systems/story/charges';
import { INK_UI, INK_UI_HEX, InkUI, scrollGestureConsumedTap, type InkScrollArea, type UIBounds } from '../ui/InkUI';
import { heroTemplates } from '../data/heroes';
import { arrivalPreview } from '../data/heroArrivals';
import { isVassal } from '../systems/ascent/VassalSystem';
import { designLength } from '../game/graphicsQuality';
import { sawtoothBand, seal } from '../ui/ink/devices';
import { faceTravel } from '../ui/ink/life';
import { playArrivalFanfare } from '../ui/ascent/arrivalFanfare';
import { playWaveBanner } from '../ui/ascent/waveBanner';
import { THRONE_HALL_HEIGHT, throneHallDiorama } from '../ui/ascent/throneHall';
import { CARD_STACK_PEEK, CardStack } from '../ui/ascent/CardStack';
import { createMapItemRenderer, type MapItemRenderer } from '../ui/MapItemRenderer';
import { armyShape, compositionFor, figureEraFor, hostKitFor, hostShapeAt } from '../ui/ink/devices';
import {
  formationBeats, formationTier, FORMATION_RING, type BattleFormation,
} from '../data/ascent/formations';
import { areca, bamboo, buffalo, grassTuft, hayStack, softRidge, tree } from '../ui/ink/props';
import { citadel, hamlet, village } from '../ui/ink/settlements';
import { groundTone, inkPath, mulberry32, printedShape } from '../ui/ink/stroke';
import { GROUND_SCALE, PX_PER_M } from '../ui/ink/proportion';
import { PIGMENT } from '../ui/ink/palette';
import { findLand } from '../systems/LandSystem';
import { CARD_ICON_SIZE, drawCardIcon, iconForOption, type CardIconId } from '../ui/CardIcons';
import { ASCENT_HUD_HEIGHT, AscentHud } from '../ui/ascent/AscentHud';
import { AdvisorStrip } from '../ui/ascent/AdvisorStrip';
import { Copilot, type CopilotStep } from '../ui/Copilot';
import { drawFormationCounters } from '../ui/ascent/formationCounters';
import { hasSeenRunTour, markRunTourSeen, takeGuidedRun } from '../state/tour';
import {
  ACTION_BUTTON_HEIGHT, ACTION_BUTTON_Y, ActionBar, actionBarSlots,
} from '../ui/ActionBar';
import { ResourceBar } from '../ui/ResourceBar';
import { staggerIn } from '../ui/animations';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import {
  buildingLabel,
  formatResourceList,
  heroBio,
  heroEffect,
  heroName,
  heroTypeLabel,
  politicsChoiceDescription,
  politicsChoiceLabel,
  politicsDescription,
  politicsTitle,
  rarityLabel,
  resourceLabel,
  t,
} from '../i18n';
import type {
  ActiveStory,
  Historicity,
  Army,
  ArmyComposition,
  ArmyOrders,
  AscentBattle,
  AscentConquestMethod,
  AscentLane,
  AscentLaneStatus,
  AscentLedgerLine,
  AscentPrompt,
  AscentRarity,
  AscentWaveCue,
  BattleBeat,
  FieldStance,
  ConquestMethodOption,
  ConquestTarget,
  CourtPositionId,
  GameState,
  Hero,
  InvasionRecord,
  Land,
  StoryOpening,
} from '../state/types';
import { ESTATE_IDS } from '../state/types';
import { ARMY_RATION_USE_PER_100 } from '../game/gameplayConfig';

/** The three map controls stacked at the right edge, matching the classic modes. */
type MapControlIcon = 'zoom-in' | 'zoom-out' | 'mode';

/** Portrait column on hero cards: below the rarity badge, inset from the right edge. */
const PORTRAIT_W = 74;
const PORTRAIT_TOP = 30;

/**
 * The floating map controls: half their tap area, and the clearance kept below the lowest one.
 * The buttons draw 36×36 but claim 42×42 of touch, and it is the touch area that has to stay
 * off the action bar.
 */
const MAP_CONTROL_RADIUS = 21;
const MAP_CONTROL_GAP = 12;
/** Vertical pitch of the stack. */
const MAP_CONTROL_PITCH = 42;

/**
 * The battle screen's bands.
 *
 * The field used to be a fixed 168px — a fifth of the screen, on which two blocks of figures
 * stood on nothing. It is the thing the screen exists to show, so it now takes whatever is left
 * once the parts that cannot shrink have been paid for.
 *
 * Sized as a band rather than a number because `GAME_HEIGHT` is derived from the device aspect
 * and clamps as low as 620: a fixed height that fits a tall phone pushes the dock off an SE.
 */
const BATTLE_RAILS_HEIGHT = 56;
/**
 * Two strips of deliberately different weight. Fixed: the orders must never scroll.
 *
 * Bottom-up, because that is the order of how often each is touched — the formation strip is worked
 * three to five times an engagement and owns the thumb's own band; the stance strip is worked once
 * or twice and sits above it, smaller and further away. See `docs/14-five-shapes-two-dials.html`.
 *
 *   stance label 12 + segments 30 = 42
 *   gap 6
 *   formation label 12 + chips 52 = 64
 *
 * 112 and not a point more. At 122 this printed five pixels through the lane's Close button on a
 * 620-high screen — the field is already at its 150 floor there, so it cannot give the dock any
 * more room and every extra point comes straight out of the one control that gets you out of a
 * fight. `verify-battle-dock` measures it at 620 for exactly this reason.
 */
const BATTLE_STANCE_HEIGHT = 30;
/**
 * 64, up from 52.
 *
 * The chip carries a glyph, an order and — sometimes — a state line, and in Vietnamese the order
 * itself is two words that wrap: `XUNG PHONG`, `GIƯƠNG KHIÊN`. Glyph 15 + two lines of 13 + a
 * state line of 11 is 54 of content in a 52-point box, so `đang chuyển thế · 1` printed out of the
 * bottom of the chip and into the exits below it. Measured against the longest pair the catalog
 * has, not against the English.
 */
const BATTLE_FORMATION_HEIGHT = 64;
const BATTLE_STRIP_LABEL = 12;
/**
 * The band above both dials: what the enemy is doing, what this beat is costing, and — when an
 * order has just landed — whether it was worth making.
 *
 * It is paid for by deleting the two strip labels it replaces. `THẾ TRẬN — FORMATION` over a row of
 * chips that now carry their own icons and verbs was a caption naming what the reader is looking
 * at, and the dock has no 12 points to spend on that: `BATTLE_DOCK_HEIGHT` was already trimmed
 * 122 → 112 because it printed through the lane's Close button at 620, and the field is at its 150
 * floor there and cannot give any back. Two labels out, one band in, same 112.
 */
const BATTLE_READOUT_HEIGHT = 24;
/**
 * Ten points between the two dials, three above the top one.
 *
 * The strips answer different questions on different clocks — how hard to press, and what shape to
 * stand in — and at a three-point gap they read as one nine-button grid with a size change halfway
 * down it. Ten is enough that the eye takes them as two rows without a rule being drawn between
 * them, and it comes out of the field, which has the points to spare everywhere above the 620 floor.
 */
const BATTLE_DIAL_GAP = 10;
const BATTLE_DOCK_HEIGHT = BATTLE_READOUT_HEIGHT + 3 + BATTLE_STANCE_HEIGHT + BATTLE_DIAL_GAP
  + BATTLE_FORMATION_HEIGHT;
/**
 * Where the two exits sit, measured up from the bottom edge.
 *
 * Its own number rather than the lane's `LANE_CLOSE_BUTTON_OFFSET`, because this screen is the one
 * with a full dock above them: twelve points of daylight between the formation strip and the
 * buttons that end the fight is not enough on a real handset, and every other lane has a whole
 * empty sheet there. Ten lower than the lane's, which is ten more the dock does not have to share.
 */
const BATTLE_EXITS_OFFSET = 56;
/**
 * A glyph per shape, so a chip can be recognised rather than read.
 *
 * Each one draws the *arrangement* its shape puts the men in, seen from above — the same reading
 * the field gives, at 15 points. See `docs/14-five-shapes-two-dials.html` for the ring itself.
 */
const FORMATION_ICON: Record<BattleFormation, CardIconId> = {
  chong: 'spears',
  xung: 'horse',
  tan: 'skirmish',
  quy: 'tortoise',
  no: 'bows',
};
/**
 * The fight's own account used to be printed along the foot of the field, on a plate over the
 * hatching. It is one line in the header now — see `updateBattleLogLine` — because that is where it
 * can be read, and because a plate of type across the bottom third of the picture was covering the
 * one thing this screen exists to show. Nothing draws inside the field any more except the field.
 */
/**
 * The round pips used to be a full-width band between the header and the field, and they are in
 * the header's own top-right corner now — see `battleHeaderFrame`. The band is gone; the field
 * kept the twenty-four points.
 */
/**
 * Most bodies the killing floor will hold.
 *
 * Capped because they are never cleared — the point of them is that they accumulate — and an
 * engagement can run forty beats. Forty marks is a covered field at this size; beyond that it is
 * a texture, and the two armies stop reading against it.
 */
const BATTLE_FALLEN_CAP = 40;
/**
 * How far apart the two lines stand once they have met.
 *
 * Wide enough that both blocks are legible and the ground between them shows, narrow enough that
 * they read as engaged rather than as two armies waiting for permission.
 */
const BATTLE_SEAM_GAP = 34;

/**
 * The battlefield's rectangle: the full width of the sheet, at the content's own vertical place.
 *
 * Its own function because four things have to agree about it — the panel, the ground, the stencil
 * that ends the ground at the paper's edge, and the bounds the coach points at — and when they were
 * four copies of `content.x` arithmetic, widening the field meant finding all four.
 */
function battleFieldBox(content: UIBounds, fieldHeight: number): UIBounds {
  return { x: 0, y: content.y, width: GAME_WIDTH, height: fieldHeight };
}

/**
 * How far the two lines stand in from the edge of the sheet.
 *
 * Not zero. The men are drawn outward from their line, so the inset has to cover half a block, and
 * a block grows with its host: measured against the arena at its largest dial, 4,000 men, 26 put
 * the outer file through the left edge and 40 left it touching. 48 keeps the outermost figure and
 * its shadow on the paper at that size, and still leaves the two lines 234 apart against the 202
 * they had when the field was a card inside a margin.
 */
const BATTLE_FIELD_INSET = 48;

function battleFieldHeight(content: UIBounds): number {
  // `content.height` runs to 20px off the bottom of the screen, but the lane's Close button is
  // pinned inside that band — so the field must pay for it too. Measured on a 620-high screen,
  // leaving it out put the button straight through the order row, which is the exact failure
  // `verify-header-fit` and `verify-scroll` exist to catch and neither of them looks here.
  const closeBand = BATTLE_EXITS_OFFSET - 20 + 12;
  const room = content.height
    - BATTLE_RAILS_HEIGHT - BATTLE_DOCK_HEIGHT - closeBand - 24;
  // A shade under square: wide enough for two camps and a killing ground between them.
  return Math.round(Math.max(150, Math.min(content.width * 0.86, room)));
}

/**
 * Room kept clear at the foot of a scrolling prompt for its fixed buttons.
 *
 * One 40px button, plus breathing space above and below. Prompts that pin buttons below their list
 * pass this to `promptScrollBody` and place them at `GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8`.
 */
const PROMPT_FOOTER_HEIGHT = 56;

/**
 * How long a prompt card must be held before it counts as chosen.
 *
 * Long enough that a brush of the finger does not spend a draft, short enough that a deliberate
 * press never feels like waiting. The card draws the hold filling along its foot, so the
 * requirement is visible rather than a button that mysteriously ignored you.
 *
 * Down from 260, which was past the point where a guard stops feeling like protection and starts
 * feeling like lag — the press was finished before the game agreed it had happened. 140 ms is
 * still roughly twice a brush and comfortably inside the time a finger rests on something it means
 * to press.
 */
const CARD_HOLD_MS = 140;

/**
 * Enemy hosts the player can actually see, and so can act on.
 *
 * Visibility is the honest gate here: offering a hunt against a host standing in the dark would
 * hand the player information the map is deliberately withholding.
 */
function visibleHostileHosts(state: GameState): Army[] {
  return state.armies.filter((army) => {
    if (army.kingdomId === PLAYER_KINGDOM_ID) return false;
    const at = state.lands.find((land) => land.id === army.landId);
    return Boolean(at?.isVisible);
  });
}

/** The lane browser's close button: how far its top sits above the foot of the screen, and its height. */
const LANE_CLOSE_BUTTON_OFFSET = 66;
const LANE_CLOSE_BUTTON_HEIGHT = 42;

/**
 * Room a lane browser keeps clear at its foot, derived from the button that sits there.
 *
 * The list used to reserve a hardcoded 58 while `laneCloseButton` placed itself against
 * `GAME_HEIGHT` independently, so moving either one silently overlapped the other. The 8 is the
 * breathing space between the last row and the button.
 */
const LANE_FOOTER_HEIGHT = LANE_CLOSE_BUTTON_OFFSET - 8;
/** The ghost "back" button a lane sub-page shows above its footer button. */
const LANE_BACK_BUTTON_HEIGHT = 34;
/**
 * A checkbox strip pinned above the footer button: box, label, and a hint under it.
 *
 * Tall enough for the hint to wrap to two lines. At 34 it did not, and the second line ran
 * under the Close button.
 */
const LANE_TOGGLE_HEIGHT = 54;
/** Width of the portrait column beside a hero row. */
const LANE_PORTRAIT_COLUMN = 62;

/** A pigment as CSS, for the few places a Phaser `Text` needs one of the palette's own numbers. */
const cssHex = (colour: number): string => `#${colour.toString(16).padStart(6, '0')}`;

/**
 * One host's marker on the battle field, kept beside the id it belongs to.
 *
 * The strength stamped on a marker is set when it is drawn, and the field is only redrawn when
 * the *set* of hosts changes — so without re-stamping, a column that had bled from 1,500 to
 * 900 still wore "1.5k" while the bar beneath it said otherwise.
 */
interface BattleMarker {
  hostId: string;
  marker: Phaser.GameObjects.Container;
  count?: Phaser.GameObjects.Text;
  /**
   * What this host had when the field opened.
   *
   * Kept here rather than in state because it is a *drawing* fact: it is what lets the formation
   * spend its losses in order — the screen first, then the line, then the bows — instead of every
   * block shrinking together. Nothing in the simulation needs it.
   */
  mustered?: number;
  /** The host broke and is running. It has left the line and the line stops moving it. */
  routed?: boolean;
  /**
   * Figures the block was last drawn with — `men / MEN_PER_MARK`.
   *
   * The block is redrawn when this changes and only then. `hostShapeAt` already sizes a host by
   * its headcount, so the picture of an army shrinking was one recompute away and never made:
   * `slideMarkers` re-stamped the number over the men and moved on, and a host ground down from
   * 1,180 to 300 spent the whole fight drawing twenty-one ranks of men who were already dead.
   */
  marks?: number;
  /**
   * Half the block's drawn width, so the two lines can be kept from standing inside each other.
   *
   * `BATTLE_SEAM_GAP` is a distance between the two *centres*, and 34 units of it was chosen when
   * a host was drawn nineteen units wide. At the battle screen's own scale a large host is over
   * fifty, so the constant alone put the enemy's front rank behind our own back rank.
   */
  halfWidth?: number;
}

/** Men still standing in a host. */
function hostSize(host: { units: { spearmen: number; archers: number; heavyInfantry: number } }): number {
  return host.units.spearmen + host.units.archers + host.units.heavyInfantry;
}

/** Rarity → frame colour. The one visual language shared by draft cards and summons. */
const RARITY_COLOR: Record<AscentRarity, number> = {
  bronze: 0x9c6b3f,
  silver: 0xa8adb4,
  gold: INK_UI.gold,
  jade: INK_UI.jade,
};

/**
 * Rarity → paper wash. Bronze stays bare paper — the ordinary pull must *look* ordinary, or
 * the coloured ones stop meaning anything. The wash climbs with the tier so a jade card reads
 * as a different object across the room, not a footnote in its corner.
 */
const RARITY_WASH: Record<AscentRarity, number> = {
  bronze: 0,
  silver: 0.05,
  gold: 0.11,
  jade: 0.15,
};

/**
 * Dragon Ascent's HUD scene.
 *
 * Written fresh rather than extending `UIScene`: that scene is 3,000 lines built around
 * twenty modals this mode never opens, and its pointer handler hit-tests hardcoded pixel
 * rectangles belonging to the classic screens — inheriting it would mean inheriting a large
 * dormant tap surface that silently swallows presses meant for this HUD. What is reused is
 * the component library (InkUI, ResourceBar, animations, hero portraits), which is where the
 * actual visual work lives.
 *
 * Decisions arrive as full-screen prompt cards, and the standing `ActionBar` at the bottom —
 * the same component the classic modes use — is how the player reaches those same systems on
 * their own initiative. The cards set the rhythm; the bar means you are never stuck waiting
 * for one.
 */

/**
 * Takes the input off a container and everything under it, leaving the picture alone.
 *
 * `setVisible(false)` would also stop the input, and does not leave the picture alone: on the
 * battle screen the controls are the lower half of the paper, so hiding them shows whatever scene
 * is still resident behind this one.
 */
function disarm(object: Phaser.GameObjects.GameObject): void {
  object.disableInteractive();
  const children = (object as Phaser.GameObjects.Container).list;
  if (Array.isArray(children)) {
    for (const child of children) disarm(child);
  }
}
export class ConquestUIScene extends Phaser.Scene {
  private state!: GameState;
  private ui!: InkUI;
  private hud!: AscentHud;
  private resourceBar!: ResourceBar;
  private modalLayer!: Phaser.GameObjects.Container;
  private actionBar!: ActionBar;
  private inspectObjects: Phaser.GameObjects.GameObject[] = [];
  private mapControlObjects: Phaser.GameObjects.GameObject[] = [];
  /** Scroll areas register a global wheel handler, so they must be destroyed explicitly. */
  private activeScrollAreas: InkScrollArea[] = [];
  private openPromptKey = '';
  /** Test-only: skip the ground bake so a harness can diff the baked field against a live one. */
  private skipGroundBake = false;
  private lanePauseBeforeOpen = false;
  /** The "world is stopped" badge, rebuilt with the bar. */
  private pausedBadge?: Phaser.GameObjects.Container;
  /** The standing advisor under the readout band. Never rebuilt, only written into. */
  private advisor!: AdvisorStrip;
  /**
   * The four cards a first run is shown, while they are up.
   *
   * Held rather than fired and forgotten so the scene's shutdown can take the veil down with it:
   * the tour lays a full-screen blocker, and a blocker outliving its scene deafens whatever comes
   * next. This is the same fault the front-page tour had when Settings was opened underneath it.
   */
  private runTour?: Copilot;
  /**
   * Whether this scene has already offered the tour, regardless of what storage thinks.
   *
   * `maybeRunTour` is called from `renderActionBar`, which runs on every economy tick, so the only
   * thing stopping a second tour is the answer to "has it been seen". Leaving that answer entirely
   * to `hasSeenRunTour()` is a loop waiting to happen: under `?tour=1` the storage answer is
   * overridden to "no" forever, so the tour closed and immediately reopened from its first card,
   * every tick, and could not be got rid of. A latch in the scene is the honest guard — the tour is
   * offered once per run because it is about this run, and storage only decides whether it is
   * offered at all.
   */
  private runTourDone = false;
  /**
   * Whether this run was started from the manual's "play a guided run" button.
   *
   * It does one thing: force the walkthrough on for a run that would not otherwise get one. A
   * *first* run is walked through in full regardless — it is exactly the player who needs it —
   * so this is only the door back in for somebody who has already played, or skipped it.
   */
  private guidedRun = false;
  /**
   * Whether this run teaches at all, decided once when it starts.
   *
   * It used to be re-derived on every frame from `runTourDone || hasSeenRunTour()`, and that is
   * wrong the moment the walkthrough is more than one card: the first stage closing marks the tour
   * as seen, which then switched the remaining stages off for the rest of the run. A player got
   * the throne card explained and nothing else, ever.
   *
   * Asked once, here. Storage decides whether a run teaches; it does not get to change its mind
   * halfway through one.
   */
  private tourActive = false;
  /** Stages already shown, by id. Each fires once per run. */
  private tourStagesShown = new Set<string>();
  /** The clock's state before a coach card stopped it, restored when the card closes. */
  private tourPauseBefore = false;
  /** Prompts answered so far, which is how the `decision` stage knows it has something to explain. */
  private promptsAnswered = 0;
  /**
   * What `promptsAnswered` stood at when the scripted part of the walkthrough finished.
   *
   * The `decision` card exists to catch the player just after they have answered their first
   * real decision — it says "that was a decision" and tells them to look at what it moved on the
   * band. It fired on `promptsAnswered > 0`, and by then the count was already three: the
   * mandate, the founder and the court appointment are all prompts, and the walkthrough had just
   * walked the player through every one of them. So the card arrived immediately after "now let
   * it run", announcing a decision whose last act had been closing a coach card, and pointing at
   * a band that had not moved since.
   *
   * -1 until the hand-over, so the stage cannot fire during the scripted opening at all.
   */
  private promptsAtHandover = -1;
  /**
   * The engagement the screen last opened itself for. A battle opens the lane exactly once —
   * closing it is a decision, and the fight carries on underneath — so this is keyed on the
   * battle's identity rather than on "is one live".
   */
  private lastAutoOpenedBattleKey = '';
  /**
   * The proclamation currently unrolled over the map, and the cue id it was raised for.
   *
   * Held so the scene's shutdown can take it down — a banner outliving its scene leaves tweens
   * writing to destroyed text — and so a cue is played exactly once. The director raises a cue and
   * the scene clears it, but `refresh` runs several times a tick (the battle clock drives it at
   * `BATTLE_TICK_MS`), so "clear it as you play it" has to be atomic with the read.
   */
  private waveBanner?: { skip: () => void; destroy: () => void };
  /** Cues taken off the director's queue and not yet played, in the order they were raised. */
  private waveCueQueue: AscentWaveCue[] = [];
  /** The clock's state before a result banner stopped it, restored when the plate leaves. */
  private wavePauseBefore = false;
  private lastWaveCueId = 0;
  /** True from the screen opening itself until the first order: the world is held meanwhile. */
  private battleAwaitingOrder = false;
  /** The Skirmish's post-fight hold, while the beaten side runs off. See `holdArenaRout`. */
  private arenaRoutHold?: Phaser.Time.TimerEvent;
  /**
   * How hard one side has been pushing the other, in [-1, 1]. Positive is ours.
   *
   * Lives on the scene rather than in the simulation on purpose: it is a *reading* of beats the
   * fight already resolved, not a new quantity for the fight to obey. See `battleLines`.
   */
  private battlePress = 0;
  /** A prompt interrupted the battle screen; reopen it once the prompt is answered. */
  private reopenBattleAfterPrompt = false;

  constructor() {
    super('ConquestUIScene');
  }

  init(data: { state: GameState }): void {
    this.state = data.state;
    this.inspectObjects = [];
    this.mapControlObjects = [];
    this.activeScrollAreas = [];
    this.openPromptKey = '';
    this.lanePauseBeforeOpen = false;
    this.battleUi = undefined;
    this.lastAutoOpenedBattleKey = '';
    this.battleAwaitingOrder = false;
    this.reopenBattleAfterPrompt = false;
    window.__hudTapBounds = [];
  }

  create(): void {
    applyRenderScale(this);
    // The chrome is printed on the same sheet as the world, so it takes the same paper pass.
    applyPaperFX(this);
    this.ui = new InkUI(this);
    this.resourceBar = new ResourceBar(this, this.state);
    this.add.existing(this.resourceBar);
    this.resourceBar.setDepth(80);

    // The resource strip is the door to the ledger. A player wondering about a number taps
    // the number — no new bar button, and the books open exactly where the question arose.
    const ledgerHit = this.add
      .rectangle(0, 0, GAME_WIDTH, HEADER_HEIGHT, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setDepth(81)
      .setInteractive();
    ledgerHit.on('pointerup', () => {
      if (this.state.pendingAscentPrompt || this.openPromptKey !== '') return;
      this.openLane('ledger');
    });

    this.hud = new AscentHud(this);

    // Built once and refreshed in place. Rebuilding it every tick would churn a dozen game
    // objects a second for a bar whose labels change only when the run's state does.
    this.actionBar = new ActionBar(this, this.state, (action) => this.handleBarAction(action));
    this.actionBar.statusColor = (action) => this.barStatusColor(action);
    this.actionBar.context = () => ({ battleLive: Boolean(this.state.ascent?.activeBattle) });
    this.actionBar.refresh();

    // The advisor. Built here beside the bar rather than per render for the same reason: it is
    // written into on every economy tick and rebuilding its text would cost a canvas measure a
    // second for a line that usually has not changed.
    //
    // Its action goes through `handleBarAction`, not through a private door of its own — the
    // advice names a lane and the bar already knows how to open every lane there is. A second
    // route into those screens is a second thing to keep correct.
    this.advisor = new AdvisorStrip(this, (lane) => this.handleBarAction(lane));

    // Taken once, here, rather than read where it is used: the flag is a one-shot handoff from the
    // manual and any second reader would find it already spent.
    this.guidedRun = takeGuidedRun();
    // A first run teaches by default, and the manual's button forces it for any run.
    this.tourActive = this.guidedRun || !hasSeenRunTour();

    // The battle clock and the published control bounds both outlive a single render; neither
    // may survive the scene that owns them.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopBattleClock();
      window.__hudTapBounds = [];
      this.advisor.destroy();
      this.runTour?.destroy();
      this.runTour = undefined;
      this.waveBanner?.destroy();
      this.waveBanner = undefined;
      this.waveCueQueue = [];
      this.arenaRoutHold?.remove();
      this.arenaRoutHold = undefined;
    });

    this.modalLayer = this.add.container(0, 0).setDepth(500);

    this.events.on('state-changed', () => this.refresh());
    this.refresh();
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  refresh(): void {
    if (!this.state.ascent) return;

    refreshAscentLaneState(this.state);
    this.resourceBar.refresh();
    this.hud.render(this.state.ascent);
    // Written before the lane guards below: those can return early, and the one line on screen
    // that claims to be reading the run must never be a tick behind the band above it.
    this.advisor.render(this.state);

    // A lane that renders nothing has stranded the player: the bar and the map controls are
    // torn down before the screen is built, so an empty modal layer means no UI at all and no
    // way back. Recovering here rather than only at each lane's own guard makes the whole class
    // of bug survivable instead of fatal.
    if (this.openPromptKey.startsWith('lane:') && this.modalLayer.length === 0) {
      this.closeLane();
      return;
    }

    // The battle lane is the one screen whose contents move on their own — the fight runs on
    // the world's clock whether or not it is being watched — so it updates in place instead of
    // being rebuilt. Rebuilding it would also make its standing-order cards untappable, since a
    // card destroyed between press and release never fires.
    if (this.openPromptKey === 'lane:battle') {
      if (this.state.pendingAscentPrompt) {
        // A card has arrived over the fight. The prompt owns the screen while it is up — the
        // world is paused with it, so the siege waits — and the battle comes straight back after.
        this.reopenBattleAfterPrompt = true;
        this.closeLane();
        return;
      }
      this.updateBattle();
      // A fight that ended closes its own screen, which re-enters `refresh` — let that pass
      // finish the frame rather than carrying on against a key that no longer applies.
      if (this.openPromptKey !== 'lane:battle') return;
    }

    const prompt = this.state.pendingAscentPrompt;
    const key = prompt ? `${prompt.kind}:${this.promptSignature(prompt)}` : '';
    // Chrome overlays own the modal layer until dismissed; don't let a tick tear them down.
    const overlayOpen = this.openPromptKey === 'codex'
      || this.openPromptKey === 'quit'
      || this.openPromptKey === 'menu'
      || this.openPromptKey.startsWith('lane:');

    // The last fight of a run reports itself before the run does.
    //
    // The Reckoning waits for a clear screen — no overlay, no card — and `run-over` is itself a
    // card, raised on the same tick the fight that ended the run resolved. So the one engagement
    // in the whole run that matters most was the one whose result was never shown: the screen went
    // straight from the battlefield to the end of the run, which is exactly what "it doesn't show
    // any results, it jumps immediately to the last page" describes. Every other card can wait its
    // turn behind the Reckoning; this one cannot wait behind anything, because nothing follows it.
    const runEnding = prompt?.kind === 'run-over';
    if (runEnding && this.state.ascent?.pendingAftermath && !overlayOpen) {
      this.openAftermath();
      return;
    }

    if (!overlayOpen && key !== this.openPromptKey) {
      // A decision card leaving the screen is a decision the player has answered. Counted here,
      // where the transition is already being detected, rather than in each of the twenty-odd
      // prompt renderers — the guided run's `decision` stage only needs to know that one has
      // happened, and a counter kept at the single place the key changes cannot drift from it.
      if (this.openPromptKey !== '' && key === '') this.promptsAnswered += 1;
      this.beginOverlay(key);
      if (prompt) this.renderPrompt(prompt);
    }

    // A fight that has just begun brings its own screen up. After the prompt key is reconciled,
    // so a card that arrived on the same tick is answered first and the battle follows it.
    if (this.maybeAutoOpenBattle()) return;

    // A fight that has just ended brings its own screen up too. After the battle, obviously, and
    // after any card that arrived with it — the world is held while it is read, exactly as every
    // other lane holds it.
    if (this.state.ascent?.pendingAftermath && !overlayOpen && !prompt) {
      this.openAftermath();
      return;
    }

    // The proclamation, once the screen is its own again.
    //
    // Deferred rather than dropped when a lane or a card owns the screen: the banner draws at 470
    // and the modal layer at 500, so playing it under a decision would spend the one moment the
    // mode has to say "you won that" on a strip of paper nobody can see. It waits, and a newer cue
    // overwrites an older one, so there is no backlog to drain.
    this.playPendingWaveCue();
    // After the prompt key is reconciled, never before: both of these decide whether to show
    // themselves from it, and reading last tick's value left the bar hidden for a whole frame
    // after the final card of a chain was answered.
    this.renderActionBar();
    this.renderInspect();
  }

  /**
   * Plays the wave director's banner cue, at most once each, and only onto a clear screen.
   *
   * The cue is cleared from state the instant it is read, before the banner is built: `refresh`
   * runs several times a tick — the battle clock drives it at `BATTLE_TICK_MS` — so a read that
   * left the cue standing would stack four proclamations on top of each other. `lastWaveCueId` is
   * the belt to that braces. It is *not* what protects a reloaded save: a new scene starts the
   * counter at zero, so a cue that survived into the save would play again — `sanitiseLoadedState`
   * drops them for that reason.
   */
  private playPendingWaveCue(): void {
    const ascent = this.state.ascent;
    if (!ascent) return;

    // Drained out of state on sight, whether or not one can be played now. The director's queue is
    // capped at three and would otherwise keep the *oldest* three while the scene waited for a
    // clear screen; taking them here and holding them in the scene keeps them in the order they
    // were raised, and `lastWaveCueId` drops any a reloaded save has already shown.
    const raised = ascent.waveCues;
    if (raised && raised.length > 0) {
      for (const cue of raised) {
        if (cue.id > this.lastWaveCueId) {
          this.lastWaveCueId = cue.id;
          this.waveCueQueue.push(cue);
        }
      }
      ascent.waveCues = [];
    }

    if (this.waveBanner || this.waveCueQueue.length === 0) return;
    // Never over a decision. The banner draws at 470 and the modal layer at 500, so playing one
    // under a card would spend the moment on a strip of paper nobody can see.
    if (this.state.pendingAscentPrompt || this.openPromptKey !== '') return;

    const cue = this.waveCueQueue.shift();
    if (!cue) return;

    // **A result stops the world; a landing does not.**
    //
    // The two halves of the lifecycle are not the same kind of event. A landing is a warning about
    // something that is now happening on the map, and the map should keep moving under it - freezing
    // the game to say "you are being invaded" would be the game taking the news away from the
    // player. A result is the opposite: the fight is over, the figures on the plate are final, and
    // the only thing left is to read them. Letting the clock run through that meant the next tick's
    // toast, the next card and the next wave's countdown all arrived over the top of the one moment
    // in the run that exists to be looked at.
    //
    // Held as a *strategy* pause, the same lever the lane screens use, and released the instant the
    // plate leaves - including when a tap cuts it short. The prior value is captured rather than
    // assumed so the release cannot switch the clock back on under a player who had paused it
    // themselves.
    const holdsWorld = cue.phase === 'end';
    if (holdsWorld) {
      this.wavePauseBefore = this.state.isStrategyPause;
      this.state.isStrategyPause = true;
    }

    this.waveBanner = playWaveBanner(this, cue, () => {
      this.waveBanner = undefined;
      if (holdsWorld) this.state.isStrategyPause = this.wavePauseBefore;
      // Straight into the next one. A wave the realm plainly holds is met without a card, so a
      // result and the next landing are raised on the same tick and read as one sentence: this
      // invasion ended, that one is beginning.
      this.playPendingWaveCue();
    });
  }

  /**
   * Opens the battle screen the moment an engagement starts, and holds the world until the
   * player has given a first order.
   *
   * The screen used to wait to be found: `beginBattle` raised no prompt and no toast, the bar
   * grew a small Battle button, and the fight — four to six ticks long — was over before most
   * players noticed it. Now the fight announces itself. The hold is a *strategy* pause, released
   * by the first order (or by closing the screen), so reinforcements can still be marched in
   * once the fight is under way — the battle lane must never keep the world stopped.
   *
   * Returns true when it opened the lane, so the caller lets `openLane`'s own bar render stand.
   */
  private maybeAutoOpenBattle(): boolean {
    const battle = this.state.ascent?.activeBattle;
    if (!battle || battle.over) {
      this.reopenBattleAfterPrompt = false;
      return false;
    }
    if (this.state.pendingAscentPrompt || this.openPromptKey !== '') return false;
    const key = battle.key ?? `${battle.landId}:${battle.invaderArmyId}`;
    const fresh = key !== this.lastAutoOpenedBattleKey;
    if (!fresh && !this.reopenBattleAfterPrompt) return false;
    this.reopenBattleAfterPrompt = false;
    this.lastAutoOpenedBattleKey = key;
    this.openLane('battle');
    // `openLane` bails on a race (the fight ended between the tick and this frame).
    if ((this.openPromptKey as string) !== 'lane:battle') return false;
    if (fresh) {
      this.battleAwaitingOrder = true;
      this.state.isStrategyPause = true;
    }
    return true;
  }

  /**
   * The first order lets the fight run: the opening hold ends and the world resumes.
   *
   * `false`, not `lanePauseBeforeOpen`, and that is the whole bug. The lane captures whatever pause
   * was in force when it opened and every other screen hands it back on the way out — correct for a
   * screen you were *reading*, and wrong for this one. A battle can open itself while the world is
   * already strategy-paused (the player paused it, or a prompt did), and then the player's first
   * order restored the pause it had just been released from: the note said "the fight begins", the
   * dock accepted the tap, and nothing moved. Close was the only control that did anything, which
   * is exactly what a stuck screen looks like.
   *
   * Ordering a fight to start is an explicit instruction to start it.
   */
  private releaseBattleHold(): void {
    if (!this.battleAwaitingOrder) return;
    this.battleAwaitingOrder = false;
    this.lanePauseBeforeOpen = false;
    this.state.isStrategyPause = false;
    // And the hard pause, which is the *other* half of this bug and the half that survived the
    // first fix. `isWorldHalted` is `isDefeated || isPaused || isStrategyPause`, so clearing only
    // the strategy pause still left a fight frozen for a player who had pressed Pause — which is
    // an entirely ordinary thing to do in a real-time game, and after which every tap on the dock
    // did nothing at all and Close was the only control that appeared to work.
    //
    // Ordering a fight to begin is an instruction to begin it, whichever clock was holding it.
    this.state.isPaused = false;
  }

  /** Identity of a prompt's *content*, so a reroll re-renders but a tick does not. */
  private promptSignature(prompt: AscentPrompt): string {
    switch (prompt.kind) {
      case 'power-draft': return `${prompt.level}:${prompt.cards.join(',')}:${prompt.rerollCost}`;
      case 'conquer-target': return prompt.targets.map((target) => target.landId).join(',');
      // The notice is part of the identity: re-opening this sheet against the same province with
      // a refusal to report is a different screen from the one the player just tapped through.
      case 'conquer-method': return `${prompt.target.landId}:${prompt.target.methods.map((m) => m.method).join(',')}:${prompt.notice ?? ''}`;
      case 'hero-choice': return `${prompt.source}:${prompt.heroIds.join(',')}`;
      case 'court-appointment': return `${prompt.heroId}:${prompt.options.map((option) => option.id).join(',')}`;
      case 'law-choice': return `${prompt.points}:${prompt.projectIds.join(',')}`;
      case 'decree-offer': return `${prompt.instrument}:${prompt.targetId ?? ''}:${prompt.projectIds.join(',')}`;
      case 'doctrine': return `doctrine:${prompt.era}`;
      case 'parliament': return prompt.cardId;
      case 'envoy': return `${prompt.kingdomId}:${prompt.relations}`;
      case 'famine': return `famine:${prompt.shortfall}`;
      case 'rival-demand': return `${prompt.demand}:${prompt.kingdomId}`;
      case 'empire-response': return `${prompt.wave}`;
      case 'wave-result': return `${prompt.wave}`;
      case 'story-beat': return `${prompt.storyId}:${prompt.fragmentId}`;
      case 'mandate': return `mandate:${prompt.options.join(',')}`;
      case 'founder': return prompt.options.join(',');
      case 'run-over': return `${prompt.score}`;
    }
  }

  private renderPrompt(prompt: AscentPrompt): void {
    switch (prompt.kind) {
      case 'mandate': this.showMandate(prompt); break;
      case 'founder': this.showFounder(prompt); break;
      case 'power-draft': this.showPowerDraft(prompt); break;
      case 'conquer-target': this.showConquerTarget(prompt); break;
      case 'conquer-method': this.showConquerMethod(prompt.target, prompt.notice); break;
      case 'hero-choice': this.showHeroChoice(prompt); break;
      case 'court-appointment': this.showAppointment(prompt); break;
      case 'law-choice': this.showLawChoice(prompt); break;
      case 'decree-offer': this.showDecreeOffer(prompt); break;
      case 'doctrine': this.showDoctrine(prompt); break;
      case 'parliament': this.showParliament(prompt); break;
      case 'envoy': this.showEnvoy(prompt); break;
      case 'famine': this.showFamine(prompt); break;
      case 'rival-demand': this.showRivalDemand(prompt); break;
      case 'story-beat': this.showStoryBeat(prompt); break;
      case 'empire-response': this.showEmpireResponse(prompt); break;
      case 'wave-result': this.showWaveResult(prompt); break;
      case 'run-over': this.showRunOver(prompt); break;
    }
  }

  /**
   * Full-screen frame shared by every prompt. Returns the content area to lay out into.
   *
   * The dim starts *below* the HUD band on purpose: POWER stays lit and readable while the
   * player chooses, so the "▲ POWER +7%" badge on a card has the number it refers to sitting
   * right above it — and the count-up is visible the moment the choice lands.
   */
  /**
   * The fight's own header: who is commanding, where, and what the screen is shouting about.
   *
   * `promptFrame` centres a title over a subtitle, which is right for a card and wrong for this. The
   * fight is about a *person* holding a field, so: portrait hard left, name and the engagement
   * under it. Left-aligned, because a row that starts at the same x every time is read at a glance
   * where a centred one has to be found first.
   *
   * **The exits used to be a column in this corner and are not any more.** They are pressed once a
   * fight and they sat at the very top of a phone the whole rest of the screen is designed to be
   * played one-handed — reachable only by shifting the grip. They are at the foot now, beside the
   * dock the thumb already works; see `buildBattleExits`.
   *
   * What takes the corner instead is the band's third line: the fight's own notice, in sỏi son.
   * Every urgent red sentence this screen had was somewhere else — "the realm holds its breath"
   * was printed across the sky over the battlefield, the enemy's telegraph was a loose line under
   * the rails — so the one thing the player most needed to notice had no fixed place to appear and
   * two different ones to be hunted for. One line, always in the same spot, right of the commander.
   */
  private battleHeaderFrame(battle: AscentBattle): {
    content: UIBounds;
    exits: UIBounds;
    pips: UIBounds;
    notice: Phaser.GameObjects.Text;
    log: Phaser.GameObjects.Text;
  } {
    const top = HEADER_HEIGHT + ASCENT_HUD_HEIGHT;
    const dim = this.add
      .rectangle(0, top, GAME_WIDTH, GAME_HEIGHT - top, INK_UI.overlay, 0.93)
      .setOrigin(0, 0)
      .setInteractive();
    this.modalLayer.add(dim);

    const left = 20;
    const right = GAME_WIDTH - 20;
    const face = 46;
    const bandY = top + 8;

    // Whoever is actually holding the field. `generalName` is only stamped on delegation, so an
    // unsteered fight has to look its commander up the same way `generalPlaysBeat` does.
    const led = ourHosts(this.state, battle).find((host) => host.generalHeroId)?.generalHeroId;
    const hero = led ? this.state.heroes.find((candidate) => candidate.id === led) : undefined;

    const plate = this.add.graphics();
    plate.fillStyle(INK_UI.parchmentShade, 1);
    plate.fillRoundedRect(left, bandY, face, face, 4);
    plate.lineStyle(1, INK_UI.softBrush, 1);
    plate.strokeRoundedRect(left, bandY, face, face, 4);
    this.modalLayer.add(plate);
    if (hero) {
      this.modalLayer.add(renderHeroFaceInBox(
        this, hero, { x: left, y: bandY, width: face, height: face },
      ));
    } else {
      // No commander: say so, rather than leave a hole where a face should be.
      this.modalLayer.add(this.ui.label(
        left + face / 2, bandY + face / 2, t('ascent.battle.noCommander'), 'caption',
        { fontSize: '8px', align: 'center', wordWrap: { width: face - 6 } },
      ).setOrigin(0.5));
    }

    const textX = left + face + 10;
    /**
     * The clock's own corner, opposite the commander.
     *
     * The round track was a full-width band between the header and the field, and it cost the
     * picture twenty-four points to say a thing that needs about twenty: how many rounds are left.
     * The two facts a player checks in the same glance are *who is holding this* and *how long
     * have I got* — so they take the two ends of one row, and the field gets the band back.
     *
     * Narrower beads, and that is fine. Nobody counts them; the row is read as a bar that fills.
     */
    /**
     * One gap between every row in this band, top to bottom.
     *
     * It was 2 under the name, 5 under the engagement and 13 under the notice — three different
     * spacings in four lines of type, because each row had been added at a different time and set
     * its own. Four rows on one rhythm read as a block; four rows on three rhythms read as things
     * that happen to be near each other.
     */
    const ROW_GAP = 3;
    const pipsW = 132;
    const pips = { x: right - pipsW, y: bandY + 2, width: pipsW, height: 24 };
    const textW = right - textX;
    // Only the two rows that sit beside the clock are held off it. The notice and the log line run
    // the full width underneath, where there is nothing to collide with.
    const topW = textW - pipsW - 10;
    const name = this.add.text(
      textX, bandY + 1, hero ? hero.name : t('ascent.battle.noCommanderName'),
      {
        color: '#2a2118', fontFamily: TITLE_FONT, fontSize: '15px', fontStyle: '700',
        wordWrap: { width: topW },
      },
    ).setOrigin(0, 0);
    this.modalLayer.add(name);

    const offence = battle.role === 'offence';
    // The place, and not the rival with it. The rails name the rival under their own strength bar
    // — in the size that band deserves — so repeating it here bought nothing and wrapped the line
    // to three at the width the clock leaves.
    const where = offence
      ? t('ascent.battle.assaultTitle', { land: battle.landName })
      : battle.isGreat
        ? t('ascent.battle.greatTitle', { land: battle.landName })
        : t('ascent.battle.title', { land: battle.landName });
    const desc = this.add.text(textX, name.y + name.height + ROW_GAP, where, {
      color: '#5a4c39', fontFamily: UI_FONT, fontSize: '10.5px', lineSpacing: 1,
      wordWrap: { width: topW },
    }).setOrigin(0, 0);
    this.modalLayer.add(desc);

    /**
     * One line of room, kept whether or not there is anything to say.
     *
     * Reserved rather than measured because this line changes on the beat — hold, then telegraph,
     * then tempo — and a header that grew and shrank with it would walk the whole screen up and
     * down every couple of seconds. It used to reserve *two* lines against the longest rival name
     * wrapping the telegraph, which is what put a thirteen-point hole between it and the line
     * under it; `updateBattleNotice` shrinks to fit instead, the same way the log line does.
     */
    const noticeY = Math.max(desc.y + desc.height + ROW_GAP, pips.y + pips.height + ROW_GAP);
    const notice = this.add.text(textX, noticeY, '', {
      color: `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}`,
      fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700',
    }).setOrigin(0, 0);
    notice.setMaxLines(1);
    this.modalLayer.add(notice);
    const NOTICE_ROOM = 13 + ROW_GAP;

    /**
     * What just happened, in the header — because on a real phone it could not be read where it was.
     *
     * The fight writes about twenty-one lines an engagement and they are printed along the foot of
     * the battlefield, over hatching, on a plate at 0.82. That is the right place for them as
     * *atmosphere* and a hopeless one as information: photographed off an actual handset, the older
     * of the two lines is not legible at all. So the newest one is repeated here, on paper, at the
     * one place on this screen the eye already goes for words.
     *
     * One line, and the newest. A header that scrolled a feed would be a second thing to read
     * during a fight that already asks for a decision every beat.
     */
    const log = this.add.text(textX, noticeY + NOTICE_ROOM, '', {
      color: INK_UI_HEX.mutedText,
      fontFamily: UI_FONT, fontSize: '10px', fontStyle: '400',
    }).setOrigin(0, 0);
    log.setMaxLines(1);
    this.modalLayer.add(log);
    const LOG_ROOM = 13;

    const bandHeight = Math.max(face, noticeY - bandY + NOTICE_ROOM + LOG_ROOM);
    const cursor = bandY + bandHeight + 6;
    return {
      content: { x: left, y: cursor, width: GAME_WIDTH - 40, height: GAME_HEIGHT - cursor - 20 },
      // The whole row, not one chip: `buildBattleExits` divides it, and the coach lights it. A
      // rectangle that covered only the left button pointed at half of what the card described.
      exits: {
        x: left,
        y: GAME_HEIGHT - BATTLE_EXITS_OFFSET,
        width: GAME_WIDTH - 40,
        // Four taller than a lane's Close button. These two carry a heading and a line under it,
        // in a language whose `tướng đánh nốt thay bạn` is half again the English.
        height: LANE_CLOSE_BUTTON_HEIGHT + 4,
      },
      notice,
      log,
      pips,
    };
  }

  private promptFrame(title: string, subtitle: string): UIBounds {
    const top = HEADER_HEIGHT + ASCENT_HUD_HEIGHT;

    const dim = this.add
      .rectangle(0, top, GAME_WIDTH, GAME_HEIGHT - top, INK_UI.overlay, 0.93)
      .setOrigin(0, 0)
      .setInteractive();
    this.modalLayer.add(dim);

    // Stack, don't place at fixed offsets: titles wrap to two lines in Vietnamese (and for
    // long empire names), which collided with a hardcoded subtitle position.
    let cursor = top + 14;

    const titleText = this.add.text(GAME_WIDTH / 2, cursor, title, {
      color: '#2a2118',
      fontFamily: TITLE_FONT,
      fontSize: '20px',
      fontStyle: '700',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: GAME_WIDTH - 48 },
    }).setOrigin(0.5, 0);
    this.modalLayer.add(titleText);
    cursor += titleText.height + 6;

    const subtitleText = this.add.text(GAME_WIDTH / 2, cursor, subtitle, {
      color: '#5a4c39',
      fontFamily: UI_FONT,
      fontSize: '12px',
      align: 'center',
      lineSpacing: 2,
      wordWrap: { width: GAME_WIDTH - 56 },
    }).setOrigin(0.5, 0);
    this.modalLayer.add(subtitleText);
    cursor += subtitleText.height + 14;

    return { x: 20, y: cursor, width: GAME_WIDTH - 40, height: GAME_HEIGHT - cursor - 20 };
  }

  private choose(choiceId: string): void {
    // A ruler joining is the one draw in a run that changes the board, so it gets the one
    // celebration the mode has. Fired from the tap rather than from the system, because the
    // systems are Phaser-free by design and a tween cannot live there.
    const joining = this.state.heroDeck.find((hero) => hero.id === choiceId);
    if (joining?.arrival) {
      playArrivalFanfare(this, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    }
    this.events.emit('ui:ascent-choice', choiceId);
  }

  /** A tappable prompt option. Everything the player can do is one of these. */
  /** Draws the two hosts on the battle screen, reusing the map's own marker art. */
  private battleItems?: MapItemRenderer;
  private battleClock?: Phaser.Time.TimerEvent;
  /**
   * The live battle screen's three layers, kept apart so each can be refreshed on its own
   * schedule: the field only when the hosts on it change, the readout every beat, the standing
   * orders only when what they offer changes. Rebuilding the lot every beat is what would make
   * the orders untappable — a card destroyed between press and release never fires.
   */
  private battleUi?: {
    content: UIBounds;
    fieldHeight: number;
    field: Phaser.GameObjects.Container;
    readout: Phaser.GameObjects.Container;
    /** The round track above the field: the fight's clock, which nothing used to show. */
    pips: Phaser.GameObjects.Container;
    /** Per-beat casualty numbers, rising and fading. Owns nothing tappable. */
    floaters: Phaser.GameObjects.Container;
    /**
     * The dead, drawn once each and never cleared until the field is rebuilt.
     *
     * The killing floor fills up as the fight runs, so the ground itself becomes a record of how
     * hard it was — and it is still there at the end, under whoever is left standing.
     */
    fallen: Phaser.GameObjects.Graphics;
    /**
     * Where each one fell, kept apart from the graphics that draws them.
     *
     * `buildBattleField` clears the field container with `removeAll(true)` whenever the hosts on
     * it change — relief arriving, a column breaking — which destroyed the layer the dead were
     * drawn into. Measured, `fallen.active` was false while forty had supposedly been laid: they
     * were being drawn onto an object that no longer existed. The positions survive now and the
     * layer is redrawn from them.
     */
    fallenPts: Array<{ x: number; y: number }>;
    fallenCount: number;
    /** The open Moment, over the field. Rebuilt only when the question changes. */
    moment: Phaser.GameObjects.Container;
    /** Which Moment is drawn, so the card is not rebuilt under the player's finger every beat. */
    momentKey: string;
    /**
     * The ground layers the bake flattened and hid.
     *
     * Kept so `verify-battle-ground-bake` can put exactly those back and diff the two pictures. It
     * cannot work the list out for itself: the mask's own source is an invisible rectangle that was
     * already hidden before the bake, and restoring that floods the field with white paper — which
     * is what the check reported as an 85% difference, twice, before this existed.
     */
    groundSources: Phaser.GameObjects.GameObject[];
    /**
     * The clip holding the land inside the frame, kept so a field rebuild can dispose it.
     *
     * Under WebGL the stencil pair are children of `field` and `clearLayer` takes them with it,
     * but the rectangle they are cut from lives off the display list — and on Canvas, where the
     * fallback geometry mask is the live mechanism, that rectangle is all there is.
     */
    groundClip?: RectClip;
    /** Where the two exits sit at the foot, so `buildBattleExits` never has to guess. */
    exitBounds: UIBounds;
    /**
     * The two speech bubbles over the hosts, and the line each is currently saying.
     *
     * Their own layer because `field` is rebuilt whenever the hosts on it change and a bubble must
     * survive that, and because the bubble is redrawn on a different clock from either: only when
     * the *sentence* changes, which across a whole engagement is four or five times rather than
     * once a beat.
     */
    bubbles: Phaser.GameObjects.Container;
    bubbleSaid: { ours: string; theirs: string };
    /** Where the two lines stood when the bubbles were last drawn. See `updateBattleBubbles`. */
    bubbleAt: { ours: number; theirs: number };
    /** Scene time the last shout started, so a redraw cannot cut one short. See `shoutBubble`. */
    bubbleShoutAt: number;
    /**
     * The two bubbles, kept apart so one can be replaced without the other.
     *
     * They used to share a `clearLayer`, which meant the enemy's telegraph changing tore down our
     * own bubble mid-shout — measured, the pop was dead inside 180 ms of a 380 ms tween because
     * the *other* side had said something.
     */
    bubbleOf: { ours?: Phaser.GameObjects.Container; theirs?: Phaser.GameObjects.Container };
    /** The fight's one red line, in the header band. Written in place, never rebuilt. */
    notice: Phaser.GameObjects.Text;
    /** The newest line of `battle.log`, repeated in the header where it can actually be read. */
    logLine: Phaser.GameObjects.Text;
    /** Where the header put the round track, so `buildBattlePips` never has to guess. */
    pipBounds: UIBounds;
    /**
     * Where each part of the fight's furniture ended up, for the coach to point at.
     *
     * Recorded as the dock lays itself out rather than recomputed by whoever wants to highlight
     * something, and for the same reason `exitBounds` is: the arithmetic is four constants deep
     * (the header band's own height, the field's measured height, `BATTLE_RAILS_HEIGHT`,
     * `BATTLE_READOUT_HEIGHT`) and a second copy of it in the tour would come apart the first time
     * anybody moved a row by three pixels. Filled every rebuild, so it is never a beat stale.
     */
    coachBounds: Partial<Record<
      'pips' | 'field' | 'rails' | 'readout' | 'stance' | 'formation', UIBounds
    >>;
    /** Both dials, fixed. They used to scroll, and Retreat sat below the fold. */
    orders: Phaser.GameObjects.Container;
    /**
     * Hand-over and leave, along the foot of the screen.
     *
     * Their own layer because `field` is rebuilt whenever the hosts on it change and these must
     * survive that, and because a hand-over flips what the left one says without anything else on
     * the screen having moved.
     */
    exits: Phaser.GameObjects.Container;
    rivalColor: number;
    /** Identity of the hosts drawn on the field, so relief and routs trigger a redraw. */
    fieldSignature: string;
    /** Identity of what the order cards offer, so a spent one-shot greys out. */
    orderSignature: string;
    /**
     * The shape each side is *standing in*, so the blocks re-arrange on the beat an order lands.
     *
     * Separate from `fieldSignature` on purpose: that one rebuilds the ground, the camps and the
     * banners, and none of them should flicker because a block moved.
     */
    shapeSignature: string;
    /**
     * Identity of the half of the rails a beat does not move, so it is built once per fight.
     *
     * See `buildBattleRails`: rebuilding the whole readout on the beat was two thirds of the
     * screen's per-beat cost, almost all of it re-doing work whose inputs had not changed.
     */
    railsSignature: string;
    /** The four measured lines, drawn into one graphics rather than four fresh containers. */
    railsBars?: Phaser.GameObjects.Graphics;
    /** Where the rails were laid, so the beat can re-ink them without measuring anything. */
    railsGeom?: { barW: number; readoutY: number; ourX: number; theirX: number };
    ourStrength?: Phaser.GameObjects.Text;
    theirStrength?: Phaser.GameObjects.Text;
    /**
     * Spent casualty numbers, kept to be used again.
     *
     * Two `Text` objects a beat is two canvas measures, two texture uploads and two objects for
     * the collector, 1.8 times a second for the length of a siege. They say the same six shapes
     * over and over; there is no reason to build them more than once.
     */
    floaterPool?: Phaser.GameObjects.Text[];
    /** The round track, redrawn into one graphics instead of rebuilt out of two objects a beat. */
    pipTrack?: Phaser.GameObjects.Graphics;
    pipsLeft?: Phaser.GameObjects.Text;
    /** The mark over the seam. Kept, because its pulse never ends and one a fight is plenty. */
    clashMark?: Phaser.GameObjects.Container;
    /** Whether the lines have met yet, so the hit-stop fires on the first contact only. */
    hadContact?: boolean;
    /** Marker plus the host it stands for, so its strength can be re-stamped as men fall. */
    ourMarkers: BattleMarker[];
    theirMarkers: BattleMarker[];
    geometry: { leftX: number; rightX: number; span: number; groundY: number };
    /**
     * The beat currently on screen, drained from `battle.beats`.
     *
     * The view renders from this rather than from the live battle whenever it has one: the
     * simulation runs six beats in a burst on the economy tick, and reading live state would
     * show only the last of them. Undefined means the queue has run dry and the picture has
     * caught up with the truth — which is exactly when it should show the truth.
     */
    shown?: BattleBeat;
    /** The last log line shown, so the same sentence is not re-inked every beat. */
    lastLine?: string;
  };

  /** Left gutter a card icon occupies, glyph plus breathing room. */
  private static readonly ICON_GUTTER = CARD_ICON_SIZE + 12;

  /** Width kept clear on a badged card's title line, covering the longest badge label. */
  private static readonly BADGE_CLEARANCE = 86;

  private optionCard(
    bounds: UIBounds,
    opts: {
      title: string;
      body: string;
      note?: string;
      noteColor?: string;
      /** Width kept clear on the right (a portrait column), so text wraps before it. */
      reserveRight?: number;
      /** Glyph drawn in a left gutter. Resolved from the option id by `iconForOption`. */
      icon?: CardIconId;
      accent: number;
      /**
       * Tints the whole card face with the accent at this alpha. Rarity's second voice: the
       * rail and badge said "jade" only to a player who already knew the code; a card whose
       * paper itself is washed green or gold reads at a glance, which is the point of rarity.
       */
      washAlpha?: number;
      badge?: string;
      disabled?: boolean;
      parent?: Phaser.GameObjects.Container;
      onTap: () => void;
    },
  ): Phaser.GameObjects.Container {
    const container = this.add.container(bounds.x, bounds.y);
    const alpha = opts.disabled ? 0.45 : 1;
    // A glyph shifts the whole text column right rather than overlapping it, so a card
    // with an icon wraps exactly as one without it does — the auto-fit height logic below
    // depends on the measured text being honest.
    const gutter = opts.icon ? ConquestUIScene.ICON_GUTTER : 0;
    const textX = 16 + gutter;
    const textWidth = bounds.width - 32 - gutter - (opts.reserveRight ?? 0);

    // Text first, panel afterwards — the card grows to fit what it holds.
    //
    // `bounds.height` used to be final, and a long description was simply clipped by it (this
    // comment used to admit as much). It is now a *minimum*: everything below measures Phaser's
    // real laid-out text height, exactly as `InkUI.card` does, and publishes the result on
    // `cardHeight` so a caller can stride by it instead of by a constant.
    const titleWidth = textWidth - (opts.badge ? ConquestUIScene.BADGE_CLEARANCE : 0);
    const titleText = this.ui.label(textX, 10, opts.title, 'label', {
      fontSize: '14px',
      wordWrap: { width: titleWidth },
    }).setAlpha(alpha);
    container.add(titleText);

    // Body follows the title's *measured* height rather than a fixed offset: reserving width
    // for the badge means a long title can now wrap to two lines, and a hard-coded y drew the
    // body straight through the second one.
    const bodyText = this.ui.label(textX, 10 + titleText.height + 4, opts.body, 'body', {
      fontSize: '11px',
      color: INK_UI_HEX.mutedText,
      wordWrap: { width: textWidth },
    }).setAlpha(alpha);
    container.add(bodyText);

    // The note is pinned to the card's foot, so its height has to be reserved before the card's
    // own height is settled — and *measured*, not assumed.
    //
    // This reserved a flat 20px and drew the note at `height - 20`. One line fits in 20px and a
    // wrapped one does not, so any note long enough to wrap — which in Vietnamese is most of the
    // longer ones, the language running wider than the English it was laid out against — spilled
    // through the card's own border and over the card below it. Two separate screens reported it.
    const noteText = opts.note
      ? this.add.text(textX, 0, opts.note, {
        color: opts.noteColor ?? '#4c6b46',
        fontFamily: UI_FONT,
        fontSize: '11px',
        fontStyle: '700',
        wordWrap: { width: bounds.width - 32 - textX + 16 },
      }).setAlpha(alpha)
      : undefined;
    const noteHeight = noteText ? noteText.height + 8 : 0;
    const contentBottom = bodyText.y + bodyText.height + 10 + noteHeight;
    const height = Math.max(bounds.height, contentBottom);

    if (noteText) {
      noteText.setY(height - noteHeight);
      container.add(noteText);
    }

    // A thin ink contour, the same weight as every other line on the page — the accent is spent
    // on the rail down the left edge instead. A card outlined in its own accent reads as a
    // coloured box; a card on paper with one stamped edge reads as a choice.
    //
    // Inserted behind the text that has already been laid out, the same way `InkUI.card` does it.
    const surface = this.ui.panel(
      { x: 0, y: 0, width: bounds.width, height },
      { border: INK_UI.brush, borderWidth: 1.2, borderAlpha: opts.disabled ? 0.3 : 0.52, muted: opts.disabled },
    );
    container.addAt(surface, 0);

    const rail = this.add.graphics();
    rail.fillStyle(opts.accent, alpha);
    rail.fillRect(1, 5, 4.5, height - 10);
    container.addAt(rail, 1);

    if (opts.washAlpha) {
      const wash = this.add.graphics();
      wash.fillStyle(opts.accent, opts.washAlpha * (opts.disabled ? 0.5 : 1));
      wash.fillRect(2, 2, bounds.width - 4, height - 4);
      // Above the paper, below the rail and everything written on the card.
      container.addAt(wash, 1);
    }

    if (opts.icon) {
      const glyph = drawCardIcon(this, opts.icon, opts.accent);
      glyph.setPosition(16 + CARD_ICON_SIZE / 2, height / 2).setAlpha(alpha);
      container.addAt(glyph, 2);
    }

    // The badge sits top-right on the title's own line, so the title has to wrap before it.
    // Without this a longer title runs underneath and is clipped mid-word.
    if (opts.badge) {
      // A letter-spaced small-caps label rather than a filled chip. On paper a coloured pill reads
      // as a sticker pasted on the page; the accent survives as the ink colour instead.
      const badge = this.add.text(bounds.width - 12, 11, opts.badge.toLocaleUpperCase(), {
        color: `#${opts.accent.toString(16).padStart(6, '0')}`,
        fontFamily: UI_FONT,
        fontSize: '9px',
        fontStyle: '700',
      }).setOrigin(1, 0).setAlpha(0.85);
      badge.setLetterSpacing?.(1.4);
      container.add(badge);
    }

    if (!opts.disabled) {
      const hit = this.add
        .rectangle(bounds.width / 2, height / 2, bounds.width, height, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });

      // A prompt card has to be *held*, not tapped.
      //
      // These are the irreversible choices in the run — the power you draft, the champion you keep,
      // the province you commit to — and they sit under the finger in a list that scrolls. A stray
      // tap while reading spends a decision that cannot be taken back, and the scroll guard only
      // catches gestures that travelled; a clean accidental tap is indistinguishable from a
      // deliberate one *unless the interface asks for more*.
      //
      // Deliberately not applied to `laneList` rows: those are navigation, they can be undone by
      // going back, and making the player hold to open a screen would be tiresome. The rule is that
      // a hold guards a commitment, never a look.
      const fill = this.add.graphics();
      container.add(fill);
      let armedAt = 0;
      let timer: Phaser.Time.TimerEvent | undefined;

      const clearArm = () => {
        timer?.remove();
        timer = undefined;
        armedAt = 0;
        fill.clear();
      };
      const paintArm = (progress: number) => {
        fill.clear();
        if (progress <= 0) return;
        // A line growing along the foot of the card. It reads as the choice being made rather than
        // as a loading bar, and it tells the player the hold is the point.
        fill.fillStyle(opts.accent, 0.55);
        fill.fillRect(1, height - 3.5, (bounds.width - 2) * Math.min(1, progress), 2.5);
      };

      hit.on('pointerdown', () => {
        armedAt = this.time.now;
        timer = this.time.addEvent({
          delay: 16,
          loop: true,
          callback: () => {
            // Ends itself when the finger lifts anywhere, rather than on `pointerout`. Clearing on
            // `pointerout` looked equivalent and was not: holding still scrolls the list a little,
            // the card moves under the stationary finger, Phaser reports the pointer as having left
            // it, and a press the player was still making was cancelled underneath them.
            if (!this.input.activePointer.isDown) {
              clearArm();
              return;
            }
            paintArm((this.time.now - armedAt) / CARD_HOLD_MS);
          },
        });
      });
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const held = armedAt > 0 ? this.time.now - armedAt : 0;
        clearArm();
        // A drag that ends over this card scrolled the list; it did not choose it.
        if (scrollGestureConsumedTap(pointer)) {
          return;
        }
        if (held < CARD_HOLD_MS) {
          // A press released early used to die without a trace, and a card that swallows taps
          // reads as broken. Leave the partial hold-line on screen for a beat so the player
          // sees the card responding — and sees that it wants to be held, not tapped.
          paintArm(held / CARD_HOLD_MS);
          this.tweens.add({
            targets: fill,
            alpha: 0,
            duration: 300,
            onComplete: () => {
              fill.clear();
              fill.setAlpha(1);
            },
          });
          return;
        }
        opts.onTap();
      });
      container.add(hit);
    }

    container.setData('cardHeight', height);
    (opts.parent ?? this.modalLayer).add(container);
    return container;
  }

  /**
   * A prompt body that scrolls, with a fixed footer below it.
   *
   * The counterpart of `laneList` for the decision prompts. Every prompt renderer used to lay its
   * cards out at a fixed stride straight into `modalLayer` and discard the `content.height` that
   * `promptFrame` returns, so nothing ever compared what it was drawing against the room it had.
   * `GAME_HEIGHT` is clamped to **620 on a desktop browser** (`constants.ts`), where a four-card
   * draft plus its footer needs about 775px — the last card and both buttons were simply below the
   * bottom edge, unreachable. It fits on a 390x844 phone, which is why it looked fine in testing.
   *
   * `footerHeight` is the room to keep clear at the foot for fixed buttons; pass 0 for none.
   */
  private promptScrollBody(
    title: string,
    subtitle: string,
    footerHeight: number,
  ): { content: UIBounds; body: Phaser.GameObjects.Container; bodyWidth: number; finish: (usedHeight: number) => void } {
    const content = this.promptFrame(title, subtitle);
    // Measured once and used for both the mask and the content floor below. Deriving them separately
    // let a very short sheet floor the viewport at 80 while the content height stayed under it, which
    // pinned `maxScroll` to 0 and made the sheet unscrollable exactly when it needed to scroll most.
    const viewportHeight = Math.max(80, content.height - footerHeight);
    const scroll = this.ui.scrollArea({
      x: content.x,
      y: content.y,
      width: content.width,
      height: viewportHeight,
    });
    scroll.addTo(this.modalLayer);
    // Required: `releaseOverlay` destroys these, and an InkScrollArea that is never destroyed
    // leaves its global wheel handler hooked to a dead scene.
    this.activeScrollAreas.push(scroll);

    return {
      content,
      body: scroll.content,
      // The scroll area's own width, less a little so a card's right edge never sits under the mask.
      bodyWidth: content.width - 6,
      finish: (usedHeight: number) => {
        scroll.setContentHeight(Math.max(viewportHeight, usedHeight));
      },
    };
  }

  // ── Three Lane Surface ───────────────────────────────────────────────────

  /**
   * Keeps the bar current and hides it while something owns the modal layer — behind the dim
   * its buttons would be half-visible and untappable.
   */
  private renderActionBar(): void {
    const hidden = Boolean(this.state.pendingAscentPrompt) || this.openPromptKey !== '';
    this.actionBar.setVisible(!hidden);
    if (!hidden) this.actionBar.refresh();
    this.advisor.setVisible(!hidden);
    // AFTER `renderMapControls`, which rewrites `__hudTapBounds` wholesale — the advisor's own
    // rectangle has to be appended to that list rather than published before it and overwritten.
    this.renderMapControls(hidden);
    if (!hidden) window.__hudTapBounds!.push(...this.advisor.tapBounds());
    this.renderPausedBadge(hidden);
    this.maybeRunTour(hidden);
  }

  /**
   * The four cards a first run is shown, once.
   *
   * Deliberately gated on the run being *playable* — no prompt up, the bar and the advisor both on
   * screen. A tour that opened over the founder card would be pointing at a band the player cannot
   * see and a bar that is not drawn, and its own blocker would sit on top of a decision that has
   * to be answered before anything else can happen.
   *
   * The flag is separate from the front page's. They teach different things, a player may well
   * arrive here having skipped the other, and a first run reached from a saved game never saw the
   * front page's at all.
   */
  private maybeRunTour(hidden: boolean): void {
    if (this.runTour || !this.tourActive) return;

    /**
     * A stage may speak over a decision card only if it is *about* that card.
     *
     * The first three are, and they have to be: the throne card is the very first thing a run
     * puts on the screen, and it asks a permanent question about three options a new player has
     * never seen. Waiting for a clear frame meant the walkthrough opened by explaining the band
     * to somebody who had already guessed at it. Everything after them describes the map, the
     * bar or the clock, and none of that is visible behind a card — those wait.
     */
    const stage = this.tourStages().find((candidate) => !this.tourStagesShown.has(candidate.id)
      && (candidate.overCard || !hidden)
      && candidate.when());
    if (!stage) return;

    this.tourStagesShown.add(stage.id);
    /**
     * The world stops while a card is being read.
     *
     * Not politeness — correctness. A stage is chosen against the state of the screen at the
     * moment it opens, but a `Copilot` then runs its own steps to the end without asking again,
     * and the clock underneath was still turning. So the walkthrough would reach "here is the
     * action bar", pointing at a bar that a doctrine card arriving two seconds earlier had
     * already hidden — the coach describing one screen while the player looks at another.
     *
     * Stopping the clock removes the race rather than papering over it: no prompt can be raised
     * between the first card of a stage and the last, so what the coach points at is still there
     * when it points at it. The previous pause state is restored, exactly as `openLane` does,
     * because a player who had deliberately stopped the clock must not find it running again.
     */
    this.tourPauseBefore = this.state.isStrategyPause;
    this.state.isStrategyPause = true;
    this.runTour = new Copilot(this, {
      steps: stage.steps(),
      // Only the stage that ends with "now let it run" may offer to start playing. Every other
      // card in the walkthrough is read in the middle of a run that is already going.
      finishLabel: stage.id === 'opening' ? undefined : 'copilot.gotIt',
      onClose: () => {
        this.state.isStrategyPause = this.tourPauseBefore;
        // Marked on the first stage, not the last. A player who leaves after two cards has still
        // had the introduction offered, and a walkthrough that restarts from the throne every time
        // a run is abandoned is the most irritating thing this could possibly do. The rest of the
        // stages keep coming for the remainder of *this* run, which `tourActive` already decided.
        markRunTourSeen();
        this.runTourDone = true;
        this.runTour = undefined;
      },
    });
  }

  /**
   * The coached moments of a run, in the order they can happen.
   *
   * Each is keyed to a condition rather than to a tick, and fires once. The point of the later
   * three is that they arrive **while the thing they describe is on the screen**: a paragraph
   * about what a decision costs you is worth very little in a manual and quite a lot immediately
   * after the first one has been answered, with the band showing what it did.
   */
  private tourStages(): Array<{
    id: string;
    /** May be raised while a decision card owns the screen. Only for stages about that card. */
    overCard?: boolean;
    when: () => boolean;
    steps: () => CopilotStep[];
  }> {
    const ascent = this.state.ascent;
    // A one-card stage. Placement is no longer the caller's business: every card is anchored to
    // the foot of the sheet so its buttons are inside a thumb's reach, and the arrow drawn from
    // the card is what connects it to whatever it is describing.
    const card = (id: string, heading: string, body: string): CopilotStep[] =>
      [{ id, heading: heading as CopilotStep['heading'], body: body as CopilotStep['body'] }];
    const showing = (kind: string) => this.openPromptKey.startsWith(kind);

    return [
      // ── The opening cards, explained while they are on the screen ────────
      {
        id: 'mandate',
        overCard: true,
        when: () => showing('mandate'),
        steps: () => card('mandate', 'copilot.run.mandate.h', 'copilot.run.mandate.b'),
      },
      {
        id: 'founder',
        overCard: true,
        when: () => showing('founder'),
        steps: () => card('founder', 'copilot.run.founder.h', 'copilot.run.founder.b'),
      },
      {
        id: 'court',
        overCard: true,
        when: () => showing('court-appointment'),
        steps: () => card('court', 'copilot.run.court.h', 'copilot.run.court.b'),
      },
      {
        id: 'opening',
        when: () => true,
        steps: () => [
          /**
           * The four stores, one card each, pointed at individually.
           *
           * The strip was the last unexplained thing on the screen and the first thing a player
           * looks at: four icons, four numbers and four signed rates, none of which says what it
           * is or what it is for. One card naming all four would have been cheaper and would have
           * taught nobody which icon was which — so each card lights its own slot, and the slot is
           * read from the strip rather than guessed, because `reflow` packs the row by measured
           * width and a realm holding 29.1k gold puts the people icon somewhere else entirely.
           */
          {
            id: 'res-food',
            heading: 'copilot.run.food.h',
            body: 'copilot.run.food.b',
            target: () => this.resourceBar.slotBounds('food'),
          },
          {
            id: 'res-supplies',
            heading: 'copilot.run.supplies.h',
            body: 'copilot.run.supplies.b',
            target: () => this.resourceBar.slotBounds('supplies'),
          },
          {
            id: 'res-gold',
            heading: 'copilot.run.gold.h',
            body: 'copilot.run.gold.b',
            target: () => this.resourceBar.slotBounds('gold'),
          },
          {
            id: 'res-people',
            heading: 'copilot.run.people.h',
            body: 'copilot.run.people.b',
            target: () => this.resourceBar.slotBounds('humans'),
          },
          {
            id: 'band',
            heading: 'copilot.run.band.h',
            body: 'copilot.run.band.b',
            target: () => ({ x: 0, y: HEADER_HEIGHT, width: GAME_WIDTH, height: ASCENT_HUD_HEIGHT }),
          },
          {
            id: 'coach',
            heading: 'copilot.run.coach.h',
            body: 'copilot.run.coach.b',
            target: () => this.advisor.tapBounds()[0],
          },
        ],
      },
      /**
       * The bar, one button at a time.
       *
       * It used to be a single card naming all six screens in a row, which is a paragraph rather
       * than an explanation: a reader finishes it knowing there are six of something and not which
       * is which. Every button now lights on its own and is told what is behind it and — the part
       * that actually changes how the game is played — what its status dot means, because the dot
       * is the game telling you when to open that screen and nothing anywhere says so.
       *
       * Built from `actionBarSlots`, the same function the bar itself lays out from, so the lit
       * rectangle is the button rather than an approximation of where a button probably is. The
       * keys come from the live bar too: `battle` exists only while a siege does, and a card
       * pointing at a button that is not drawn would light up an empty patch of the bar.
       */
      {
        id: 'bar',
        when: () => true,
        steps: () => {
          const context = { battleLive: Boolean(this.state.ascent?.activeBattle) };
          const slots = actionBarSlots(this.state.gameMode, context);
          const known = ['battle', 'build', 'heroes', 'court', 'army', 'affairs', 'chronicle', 'pause', 'menu'];
          return slots
            .filter((slot) => known.includes(slot.action))
            .map((slot) => ({
              id: `bar-${slot.action}`,
              heading: `copilot.bar.${slot.action}.h` as CopilotStep['heading'],
              body: `copilot.bar.${slot.action}.b` as CopilotStep['body'],
              target: () => ({
                x: slot.x,
                y: ACTION_BUTTON_Y - ACTION_BUTTON_HEIGHT / 2,
                width: slot.width,
                height: ACTION_BUTTON_HEIGHT,
              }),
            }));
        },
      },
      {
        id: 'go',
        when: () => true,
        steps: () => {
          // The scripted part ends here, so this is the line the `decision` card measures from.
          this.promptsAtHandover = this.promptsAnswered;
          return card('go', 'copilot.run.go.h', 'copilot.run.go.b');
        },
      },
      /**
       * The fight, the first time one is watched.
       *
       * The screen the coach had least business skipping and skipped anyway: it is a whole
       * interface of its own — two hosts, a round clock, a telegraph line, four stances, five
       * shapes and two ways out — and none of it appears anywhere else in the game. It was
       * skipped because a lane sets `openPromptKey`, which is how `maybeRunTour` decides a card
       * owns the glass; `overCard` is what lets a stage speak when the thing it is about IS the
       * thing owning the glass.
       *
       * Every rectangle comes off `battleUi.coachBounds`, recorded by the dock as it lays itself
       * out. The dock is four constants deep and another session is actively moving it; a second
       * copy of that arithmetic here would be wrong within the week.
       */
      {
        id: 'fight',
        overCard: true,
        when: () => this.openPromptKey === 'lane:battle' && Boolean(this.battleUi?.coachBounds.stance),
        steps: () => {
          const box = (key: 'pips' | 'field' | 'rails' | 'readout' | 'stance' | 'formation') =>
            () => this.battleUi?.coachBounds[key];
          return [
            {
              id: 'fight-rails',
              heading: 'copilot.fight.rails.h',
              body: 'copilot.fight.rails.b',
              target: box('rails'),
            },
            {
              id: 'fight-pips',
              heading: 'copilot.fight.pips.h',
              body: 'copilot.fight.pips.b',
              target: box('pips'),
            },
            {
              // The bubbles, not the dock. What each side is doing is said over its own men now,
              // and the card that explains that has to light the men rather than a band of type
              // three rows below them.
              id: 'fight-read',
              heading: 'copilot.fight.read.h',
              body: 'copilot.fight.read.b',
              target: box('field'),
            },
            {
              id: 'fight-stance',
              heading: 'copilot.fight.stance.h',
              body: 'copilot.fight.stance.b',
              target: box('stance'),
            },
            {
              /**
               * The one card in the game that carries a drawing, and the reason `CopilotStep.art`
               * exists at all.
               *
               * The counter ring is the whole of the fight's decision and the only way the coach
               * had to state it was "laid out in the ring order they beat each other in" — a
               * sentence describing a picture. Nobody holds five names, a direction and a step
               * count in their head with a host closing on them. The table says it in one look.
               */
              id: 'fight-shapes',
              heading: 'copilot.fight.shapes.h',
              body: 'copilot.fight.shapes.b',
              target: box('formation'),
              art: (x, y, width) => drawFormationCounters(this, x, y, width, {
                // Lit on the row the fight is actually asking about, when it is asking one.
                highlight: battleTelegraph(this.state)?.formation,
              }),
            },
            {
              id: 'fight-exits',
              heading: 'copilot.fight.exits.h',
              body: 'copilot.fight.exits.b',
              target: () => this.battleUi?.exitBounds,
            },
          ];
        },
      },
      // ── The rest of a real run, each at the moment it first happens ─────
      {
        id: 'decision',
        // A decision answered in ordinary play, after the walkthrough let go — not one of the
        // opening cards the walkthrough itself just talked the player through.
        when: () => this.promptsAtHandover >= 0 && this.promptsAnswered > this.promptsAtHandover,
        steps: () => card('decision', 'copilot.run.decision.h', 'copilot.run.decision.b'),
      },
      {
        // The first wave, while it is still coming. `wave` is 0 until one has actually landed, so
        // this is the muster before the first — the one moment in a run where the countdown means
        // something the player has not seen before.
        id: 'muster',
        when: () => Boolean(ascent) && ascent!.wave === 0 && ascent!.ticksToWave <= 2,
        steps: () => card('muster', 'copilot.run.muster.h', 'copilot.run.muster.b'),
      },
      {
        id: 'aftermath',
        when: () => Boolean(ascent) && ascent!.wavesSurvived >= 1,
        steps: () => card('aftermath', 'copilot.run.aftermath.h', 'copilot.run.aftermath.b'),
      },
    ];
  }

  /**
   * A standing "the world is stopped" mark.
   *
   * Pause is now a real toggle rather than a door into the quit sheet, which means the player
   * can leave the game stopped and walk away from the bar — so the state has to be visible from
   * the map, not only from the shape of one 34px glyph. Deliberately not interactive: anything
   * tappable floating over the map has to be excluded from the map's own tap handling, and an
   * indicator that only reports does not earn that cost.
   */
  private renderPausedBadge(hidden: boolean): void {
    this.pausedBadge?.destroy();
    this.pausedBadge = undefined;
    if (hidden || !this.state.isStrategyPause) return;

    const width = 128;
    const height = 24;
    const x = (GAME_WIDTH - width) / 2;
    const y = GAME_HEIGHT - ACTION_BAR_HEIGHT - height - 10;

    const badge = this.add.container(0, 0).setDepth(430);
    badge.add(this.ui.panel({ x, y, width, height }, {
      fill: INK_UI.backgroundInk,
      fillShade: INK_UI.brush,
      border: INK_UI.gold,
      radius: 12,
    }));
    badge.add(this.add.text(GAME_WIDTH / 2, y + height / 2, t('ascent.hud.paused'), {
      color: '#2a2118',
      fontFamily: UI_FONT,
      fontSize: '11px',
      fontStyle: '700',
    }).setOrigin(0.5));
    this.pausedBadge = badge;
  }

  /**
   * Zoom and the terrain/control toggle, in the same right-edge stack the classic modes use.
   *
   * These are map controls, not menu entries, so they belong on the map rather than in the
   * action bar — and without the mode toggle the player has no way to reach the control view,
   * which is the one view that answers "who holds what" across the whole board at once.
   */
  private renderMapControls(hidden: boolean): void {
    for (const object of this.mapControlObjects) object.destroy();
    this.mapControlObjects = [];
    if (hidden) {
      // A prompt or lane overlay covers the map, so nothing below it is a map tap. The world
      // scene's canvas-level tap handler is not part of Phaser's input system and so is not
      // stopped by the overlay's own hit areas — without this, pressing a button on a
      // full-screen card also selected whatever province happened to be behind it.
      window.__hudTapBounds = [{ x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT }];
      return;
    }
    window.__hudTapBounds = [];

    const x = GAME_WIDTH - 30;
    // The inspect card spans the full width, so when one is up the stack sits above it
    // rather than on top of it.
    //
    // Measured from the *edge* of the lowest button rather than its centre. Clearing the bar by
    // 16px from the centre left only 16 − 21 = −5px between its tap area and the bar's, so the
    // bottom control sat on the bar it was supposed to float above.
    const inspectTop = this.inspectCardTop();
    const floor = inspectTop ?? GAME_HEIGHT - ACTION_BAR_HEIGHT;
    const bottom = floor - MAP_CONTROL_GAP - MAP_CONTROL_RADIUS;
    const controls: Array<[MapControlIcon, () => void]> = [
      ['zoom-in', () => this.events.emit('ui:zoom-map', 1)],
      ['zoom-out', () => this.events.emit('ui:zoom-map', -1)],
      ['mode', () => {
        this.events.emit('ui:toggle-render-mode');
        this.refresh();
      }],
    ];

    controls.forEach(([icon, onTap], index) => {
      const y = bottom - (controls.length - 1 - index) * MAP_CONTROL_PITCH;
      this.mapControlObjects.push(this.createMapIconButton(x, y, icon, onTap));
      // Published, not hardcoded: the stack shifts up when a province is selected, so a fixed
      // band in the world scene would guard the wrong pixels half the time. Without this the
      // canvas-level tap handler underneath treated a press on + / − as a tap on the province
      // behind it, selected that land, and the re-render destroyed the button before Phaser
      // could deliver the release — so the zoom controls never fired at all.
      window.__hudTapBounds!.push({ x: x - 22, y: y - 22, width: 44, height: 44 });
    });
  }

  /** The classic modes' round map button, redrawn here rather than reaching into UIScene. */
  private createMapIconButton(
    x: number,
    y: number,
    icon: MapControlIcon,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(430);
    const g = this.add.graphics();
    g.fillStyle(INK_UI.parchment, 0.96);
    g.fillRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(2, INK_UI.brush, 0.9);
    g.strokeRoundedRect(-18, -18, 36, 36, 8);
    g.lineStyle(3, INK_UI.brush, 0.9);

    if (icon === 'zoom-in' || icon === 'zoom-out') {
      g.lineBetween(-8, 0, 8, 0);
      if (icon === 'zoom-in') g.lineBetween(0, -8, 0, 8);
    } else if (this.state.mapRenderMode === 'terrain') {
      // Showing terrain → the button offers the control view, drawn as two owner blocks.
      g.fillStyle(INK_UI.jade, 0.95);
      g.fillRect(-10, -9, 9, 18);
      g.fillStyle(INK_UI.cinnabar, 0.95);
      g.fillRect(1, -9, 9, 18);
      g.lineStyle(2, INK_UI.brush, 0.82);
      g.strokeRect(-10, -9, 20, 18);
    } else {
      // Showing control → the button offers terrain, drawn as a mountain over water.
      g.fillStyle(INK_UI.softBrush, 0.95);
      g.fillTriangle(-10, 8, 0, -9, 10, 8);
      g.fillStyle(0x5bb6d6, 0.9);
      g.fillRect(-10, 9, 20, 3);
    }

    const hit = this.add.rectangle(0, 0, 42, 42, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    const stop = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => event.stopPropagation();
    hit.on('pointerdown', stop);
    hit.on('pointerup', (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      onClick();
    });

    container.add([g, hit]);
    return container;
  }

  /** The bottom bar's routing — the same screens the classic modes open, plus the Codex. */
  private handleBarAction(action: string): void {
    if (action === 'pause') {
      this.togglePause();
      return;
    }
    if (action === 'menu') {
      this.showSystemMenu();
      return;
    }
    if (action === 'codex') {
      this.showCodex();
      return;
    }
    this.openLane(action as AscentLane);
  }

  /**
   * Stop and start the world's clock. Nothing else.
   *
   * This is the "let me think" pause, and it used to be impossible to reach: the button
   * labelled Pause/Resume opened the save-and-quit sheet instead, so the only way to stop time
   * was through a menu whose other two options left the run. Two different jobs now have two
   * different buttons — this one, and the ☰ beside it.
   */
  private togglePause(): void {
    this.state.isStrategyPause = !this.state.isStrategyPause;
    this.refresh();
  }

  /**
   * The dot on a bar button: a standing invitation to open that screen. Each condition is
   * about that screen specifically, so a lit button always means there is something real
   * behind it — never a decorative badge.
   */
  private barStatusColor(action: string): number | undefined {
    const state = this.state;
    const ascent = state.ascent;
    if (!ascent) return undefined;

    switch (action) {
      // A live siege is the loudest thing the bar can say.
      case 'battle':
        return ascent.activeBattle ? INK_UI.cinnabar : undefined;
      case 'heroes':
        return state.heroes.some((hero) => !hero.assignedTo) ? INK_UI.jade : undefined;
      case 'court':
        if (state.court.stability < 35) return INK_UI.cinnabar;
        return (state.mandate?.edictPoints ?? 0) > 0 ? INK_UI.gold : undefined;
      case 'army':
        // The one number that decides whether the run survives the next wave.
        return ascent.defensePower > 0 && ascent.threat > ascent.defensePower ? INK_UI.cinnabar : undefined;
      case 'affairs':
        return ascent.laneState.world === 'alert' ? INK_UI.cinnabar : undefined;
      case 'build':
        return state.buildOrders.length === 0 && state.resources.gold > 60 ? INK_UI.gold : undefined;
      // Lit while any story has said something within living memory. Not a badge for its own
      // sake: an unlit Chronicle button means nothing has happened worth reading.
      case 'chronicle': {
        // Red means a door is open — never lit for atmosphere. A lit button that leads to
        // nothing is how the Codex lost this slot.
        if (countOpenDoors(state) > 0) return INK_UI.cinnabar;
        return (state.stories ?? []).some((story) => state.turn - story.lastSpokeTurn <= 6)
          ? INK_UI.jade
          : undefined;
      }
      default:
        return undefined;
    }
  }

  private openLane(lane: AscentLane): void {
    if (this.state.pendingAscentPrompt) return;
    // The bar only offers Battle while a siege is live, but the siege can end between the bar
    // being drawn and the button being released. Checking here as well means that race costs a
    // wasted tap rather than the whole screen.
    if (lane === 'battle' && !this.state.ascent?.activeBattle) return;

    this.lanePauseBeforeOpen = this.state.isStrategyPause;
    // Every lane freezes the world so the player can read it — except the battle, which *is* the
    // world happening. Pausing here stopped the economy tick, which stopped `advanceBattle`,
    // which froze the siege at beat 0 for as long as anyone watched it: the exact freeze this
    // whole design removed, reintroduced through the lane mechanism. Only caught by finally
    // opening the screen and waiting sixteen seconds.
    this.state.isStrategyPause = lane === 'battle' ? this.lanePauseBeforeOpen : true;
    this.beginOverlay(`lane:${lane}`);

    switch (lane) {
      case 'build': this.showBuildScreen(); break;
      case 'heroes': this.showHeroesScreen(); break;
      case 'court': this.showCourtScreen(); break;
      case 'battle': this.showBattle(); break;
      case 'army': this.musterDraft = undefined; this.showArmyScreen(); break;
      case 'affairs': this.showAffairsScreen(); break;
      case 'chronicle': this.showChronicleScreen(); break;
      case 'ledger': this.showLedgerScreen(); break;
    }

    // Checked here as well as in `refresh` so a lane that declines to draw costs the player a
    // wasted tap rather than a blank screen until the next tick.
    if (this.modalLayer.length === 0) this.closeLane();
  }

  /**
   * The scrolling body every bar screen shares: a titled frame, a scroll area, and a helper
   * that appends one tappable row. Factored out so the five screens differ only in content.
   */
  private laneList(
    title: string,
    subtitle: string,
    laneOpts: {
      /** A primary action in the close button's slot, in place of Close. */
      footer?: { label: string; onTap: () => void; disabled?: boolean };
      /**
       * A checkbox pinned just above the footer button, in the same thumb reach.
       *
       * A setting the player toggles while reading belongs at the foot for the same reason
       * the battle exits were moved there: the top of a phone is where a one-handed grip
       * cannot go without shifting, and a control nobody can reach is a control nobody uses.
       * The whole row is the hit area, label included.
       */
      footerToggle?: { label: string; hint?: string; checked: boolean; onToggle: () => void };
      /** A ghost "back" above the footer button, for pages one step inside a lane. */
      back?: () => void;
    } = {},
  ): {
    content: UIBounds;
    addRow: (
      opts: { title: string; subtitle: string; border: number; muted?: boolean; portrait?: Hero },
      onTap?: () => void,
    ) => void;
    addHeading: (title: string, hint?: string) => void;
    addNote: (text: string, tone?: number) => void;
    addWidget: (
      height: number,
      build: (parent: Phaser.GameObjects.Container, width: number) => number | void,
    ) => void;
    finish: () => void;
  } {
    const content = this.promptFrame(title, subtitle);
    const footerExtra = (laneOpts.back ? LANE_BACK_BUTTON_HEIGHT + 8 : 0)
      + (laneOpts.footerToggle ? LANE_TOGGLE_HEIGHT + 8 : 0);
    const scroll = this.ui.scrollArea({
      x: content.x,
      y: content.y,
      width: content.width,
      height: content.height - LANE_FOOTER_HEIGHT - footerExtra,
    });
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);

    const rowWidth = content.width - 6;
    let y = 0;

    const addRow = (
      opts: { title: string; subtitle: string; border: number; muted?: boolean; portrait?: Hero },
      onTap?: () => void,
    ) => {
      // A portrait sits in its own column beside the card, so a hero row is recognisable at a
      // glance and the card's own auto-fit is untouched.
      const faceCol = opts.portrait ? LANE_PORTRAIT_COLUMN : 0;
      const row = this.ui.card({ x: faceCol, y, width: rowWidth - faceCol, height: 54 }, opts);
      const height = (row.getData('cardHeight') as number) ?? 54;
      let holder: Phaser.GameObjects.Container = row;
      if (opts.portrait) {
        holder = this.add.container(0, y);
        row.setPosition(faceCol, 0);
        holder.add(row);
        holder.add(renderHeroFaceInBox(this, opts.portrait, { x: 0, y: 2, width: faceCol - 6, height: Math.max(40, height - 4) }));
      }
      if (onTap) {
        const hit = this.add
          .rectangle(rowWidth / 2 - (opts.portrait ? 0 : 0), height / 2, rowWidth, height, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true });
        if (opts.portrait) hit.setPosition(rowWidth / 2, height / 2);
        // A drag that ends over this row scrolled the list; it did not pick it.
        hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
          if (scrollGestureConsumedTap(pointer)) {
            return;
          }
          onTap();
        });
        (opts.portrait ? holder : row).add(hit);
      }
      scroll.content.add(holder);
      y += height + 8;
    };

    /**
     * A divider between groups of rows — **not a row**.
     *
     * Written first as `addRow` with a muted border, which is the obvious thing and is wrong: a
     * card is a card, so the headings arrived as five more boxes in a column of boxes and the
     * screen read as a longer list rather than a divided one. A heading has to be a different
     * *kind* of mark, so it is set as small letter-spaced caps against the paper with a hairline
     * rule beside it, and no surface at all.
     */
    const addHeading = (headingTitle: string, hint?: string) => {
      // Air above the heading, but never above the first one — a gap at the top of the list reads
      // as the frame being misaligned.
      if (y > 0) {
        y += 14;
      }
      const label = this.add.text(2, y, headingTitle.toLocaleUpperCase(), {
        color: INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '10px',
        fontStyle: '700',
      }).setOrigin(0, 0);
      label.setLetterSpacing?.(1.6);
      scroll.content.add(label);

      // The rule runs from the end of the label to the far edge, so the heading sits *in* the line
      // rather than above it.
      const rule = this.add.graphics();
      rule.lineStyle(1, INK_UI.brush, 0.22);
      rule.lineBetween(label.width + 10, y + 6, rowWidth, y + 6);
      scroll.content.add(rule);
      y += 16;

      if (hint) {
        const note = this.add.text(2, y, hint, {
          color: INK_UI_HEX.mutedText,
          fontFamily: UI_FONT,
          fontSize: '10px',
          wordWrap: { width: rowWidth - 4 },
        }).setOrigin(0, 0).setAlpha(0.85);
        scroll.content.add(note);
        y += note.height + 4;
      }
      y += 4;
    };

    /**
     * A statement in the list's flow: text on the paper, with no surface at all.
     *
     * Half of what these screens say is not a control — "no enemy host stands inside the realm's
     * sight", "the next wave lands in ten seasons", "the realm can court only so many provinces at
     * once". Given a card each, as they were, they read as things to press, and each one costs the
     * room of a thing you can press. A statement should take the room a sentence takes.
     */
    const addNote = (text: string, tone?: number) => {
      const note = this.add.text(2, y, text, {
        color: tone ? cssHex(tone) : INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '11px',
        lineSpacing: 1,
        wordWrap: { width: rowWidth - 4 },
      }).setOrigin(0, 0);
      scroll.content.add(note);
      y += note.height + 8;
    };

    /**
     * A custom widget (a slider, a chart, a grid of tiles) slotted into the list's flow.
     *
     * The builder may RETURN its height, for anything whose size is only known once its text has
     * been measured — a two-column grid of tiles cannot be told how tall it is in advance, and
     * guessing leaves either a gap under it or the next block written over it. `height` stays as
     * the answer for widgets that do know.
     */
    const addWidget = (
      height: number,
      build: (parent: Phaser.GameObjects.Container, width: number) => number | void,
    ) => {
      const holder = this.add.container(0, y);
      const measured = build(holder, rowWidth);
      scroll.content.add(holder);
      y += (typeof measured === 'number' ? measured : height) + 8;
    };

    const finish = () => {
      scroll.setContentHeight(Math.max(content.height - LANE_FOOTER_HEIGHT - footerExtra, y));
      if (laneOpts.footerToggle) {
        const cfg = laneOpts.footerToggle;
        const ty = GAME_HEIGHT - LANE_CLOSE_BUTTON_OFFSET
          - (laneOpts.back ? LANE_BACK_BUTTON_HEIGHT + 8 : 0)
          - LANE_TOGGLE_HEIGHT - 8;
        // The whole strip is the target, not the 13px box: a checkbox you have to hit exactly is
        // a checkbox on a phone that misses.
        const hit = this.add.rectangle(content.x, ty, content.width, LANE_TOGGLE_HEIGHT,
          INK_UI.brush, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', cfg.onToggle);
        this.modalLayer.add(hit);

        const box = this.add.graphics();
        box.lineStyle(1.2, cfg.checked ? INK_UI.gold : INK_UI.softBrush, 1);
        box.strokeRect(content.x + 2, ty + 6, 14, 14);
        if (cfg.checked) {
          box.lineStyle(2, INK_UI.gold, 1);
          box.beginPath();
          box.moveTo(content.x + 5, ty + 13);
          box.lineTo(content.x + 8, ty + 16);
          box.lineTo(content.x + 14, ty + 8);
          box.strokePath();
        }
        this.modalLayer.add(box);

        // No `color: undefined` here. `InkUI.label` spreads these over the variant style, so an
        // undefined colour erases the ink and Phaser falls back to white — invisible on parchment.
        const style: Record<string, unknown> = { fontSize: '12px' };
        if (cfg.checked) style.fontStyle = '700';
        else style.color = INK_UI_HEX.mutedText;
        this.modalLayer.add(this.ui.label(content.x + 24, ty + 4, cfg.label, 'body', style));

        if (cfg.hint) {
          this.modalLayer.add(this.ui.label(content.x + 24, ty + 20, cfg.hint, 'caption', {
            fontSize: '10px',
            wordWrap: { width: content.width - 26 },
          }));
        }
      }

      if (laneOpts.back) {
        this.modalLayer.add(this.ui.button(
          {
            x: content.x,
            y: GAME_HEIGHT - LANE_CLOSE_BUTTON_OFFSET - LANE_BACK_BUTTON_HEIGHT - 8,
            width: content.width,
            height: LANE_BACK_BUTTON_HEIGHT,
          },
          t('ascent.pick.back'),
          laneOpts.back,
          { variant: 'ghost', fontSize: '12px' },
        ));
      }
      if (laneOpts.footer) {
        const footer = laneOpts.footer;
        this.modalLayer.add(this.ui.button(
          {
            x: content.x,
            y: GAME_HEIGHT - LANE_CLOSE_BUTTON_OFFSET,
            width: content.width,
            height: LANE_CLOSE_BUTTON_HEIGHT,
          },
          footer.label,
          () => { if (!footer.disabled) footer.onTap(); },
          { variant: footer.disabled ? 'disabled' : 'primary', fontSize: '13px' },
        ));
      } else {
        this.laneCloseButton(content);
      }
    };

    return { content, addRow, addHeading, addNote, addWidget, finish };
  }

  /**
   * Compact pieces for a sheet that is a *screen* rather than a column of cards.
   *
   * The host sheet was thirteen full-width cards in one scroll: every figure, every order, every
   * upgrade and the commander, each in its own box, each the same size and weight as the next. A
   * card says "one thing, and it is as important as every other thing" — so a page made entirely
   * of them has no shape, no reading order and no bottom, and the player scrolls past what they
   * came for. These three give the page its levels: figures are read across, choices are read as a
   * grid, and a question with two answers is a switch and not two cards.
   */

  /** The host's figures, read across one surface. */
  private statPanel(
    parent: Phaser.GameObjects.Container,
    width: number,
    cells: Array<{ label: string; value: string; accent?: string }>,
  ): number {
    const height = 44;
    parent.add(this.ui.panel({ x: 0, y: 0, width, height }, {
      border: INK_UI.softBrush,
      borderAlpha: 0.45,
      fillAlpha: 0.5,
    }));
    const cellWidth = width / cells.length;
    cells.forEach((cell, index) => {
      const centre = cellWidth * (index + 0.5);
      if (index > 0) {
        const rule = this.add.graphics();
        rule.lineStyle(1, INK_UI.brush, 0.14);
        rule.lineBetween(cellWidth * index, 8, cellWidth * index, height - 8);
        parent.add(rule);
      }
      const label = this.add.text(centre, 7, cell.label.toLocaleUpperCase(), {
        color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '8px', fontStyle: '700',
      }).setOrigin(0.5, 0);
      label.setLetterSpacing?.(1.1);
      parent.add(label);
      parent.add(this.add.text(centre, 18, cell.value, {
        color: cell.accent ?? INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '17px', fontStyle: '700',
      }).setOrigin(0.5, 0));
    });
    return height;
  }

  /**
   * Choices as a grid of small tiles, two across.
   *
   * Seven orders as seven full-width cards is a page you scroll; seven as a grid is a page you
   * look at. The tiles share one height per row so the grid reads as a grid, which means the text
   * is measured before any surface is drawn.
   */
  private actionTiles(
    parent: Phaser.GameObjects.Container,
    width: number,
    tiles: Array<{ title: string; note?: string; border: number; muted?: boolean; onTap?: () => void }>,
  ): number {
    const GAP = 6;
    const COLUMNS = 2;
    const tileWidth = (width - GAP * (COLUMNS - 1)) / COLUMNS;
    const inner = tileWidth - 18;
    let y = 0;

    for (let index = 0; index < tiles.length; index += COLUMNS) {
      const row = tiles.slice(index, index + COLUMNS);
      const built = row.map((tile) => {
        const title = this.add.text(0, 0, tile.title, {
          color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '12px', fontStyle: '700',
          wordWrap: { width: inner }, lineSpacing: -1,
        });
        const note = tile.note
          ? this.add.text(0, 0, tile.note, {
              color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px',
              wordWrap: { width: inner }, lineSpacing: -1,
            })
          : undefined;
        return { tile, title, note };
      });
      const height = Math.max(42, ...built.map(({ title, note }) => 9 + title.height + (note ? note.height + 3 : 0) + 9));

      built.forEach(({ tile, title, note }, column) => {
        const holder = this.add.container(column * (tileWidth + GAP), y);
        holder.add(this.ui.panel({ x: 0, y: 0, width: tileWidth, height }, {
          border: tile.border,
          borderWidth: 1.5,
          muted: tile.muted,
        }));
        title.setPosition(9, 9).setAlpha(tile.muted ? 0.55 : 1);
        holder.add(title);
        if (note) {
          note.setPosition(9, 9 + title.height + 3).setAlpha(tile.muted ? 0.5 : 0.9);
          holder.add(note);
        }
        if (tile.onTap) {
          const hit = this.add
            .rectangle(tileWidth / 2, height / 2, tileWidth, height, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
          hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (scrollGestureConsumedTap(pointer)) return;
            tile.onTap?.();
          });
          holder.add(hit);
        }
        parent.add(holder);
      });
      y += height + GAP;
    }
    return Math.max(0, y - GAP);
  }

  /**
   * A question with two answers, as one switch.
   *
   * Two cards would ask it twice and answer it never — the selected state of a card is a border
   * colour, which is not what a player reads a card for. A segmented pair reads as one control
   * with one answer showing, and the note under it belongs to whichever side is chosen.
   */
  private segmentedRow(
    parent: Phaser.GameObjects.Container,
    width: number,
    opts: { label: string; options: string[]; note: string; selected: number; onPick: (index: number) => void },
  ): number {
    const heading = this.add.text(2, 0, opts.label.toLocaleUpperCase(), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px', fontStyle: '700',
    }).setOrigin(0, 0);
    heading.setLetterSpacing?.(1.2);
    parent.add(heading);

    const top = heading.height + 5;
    const GAP = 5;
    const tileHeight = 30;
    const tileWidth = (width - GAP * (opts.options.length - 1)) / opts.options.length;
    opts.options.forEach((option, index) => {
      const selected = index === opts.selected;
      const x = index * (tileWidth + GAP);
      // Deliberately NOT `crayonTile`. Its "selected" surface is paper with a cinnabar edge and its
      // unselected one is filled gold — which is the game's convention for *action* versus *quiet*,
      // and on a two-way switch it reads exactly backwards: the loud gold half looks like the
      // answer that is chosen. Here the chosen half is filled and edged in red, and the other is
      // flat paper.
      parent.add(this.ui.panel({ x, y: top, width: tileWidth, height: tileHeight }, selected
        ? { fill: INK_UI.goldLight, fillShade: INK_UI.gold, border: INK_UI.cinnabar, borderWidth: 2 }
        : { fill: INK_UI.parchment, fillAlpha: 0.45, border: INK_UI.softBrush, borderWidth: 1.2, muted: true }));
      const label = this.add.text(x + tileWidth / 2, top + tileHeight / 2, option, {
        color: selected ? cssHex(INK_UI.cinnabarDark) : INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '11px',
        fontStyle: '700',
        align: 'center',
        wordWrap: { width: tileWidth - 8 },
      }).setOrigin(0.5);
      parent.add(label);
      if (!selected) {
        const hit = this.add
          .rectangle(x + tileWidth / 2, top + tileHeight / 2, tileWidth, tileHeight, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true });
        hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
          if (scrollGestureConsumedTap(pointer)) return;
          opts.onPick(index);
        });
        parent.add(hit);
      }
    });

    const note = this.add.text(2, top + tileHeight + 5, opts.note, {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '9px', wordWrap: { width: width - 4 },
    }).setOrigin(0, 0);
    parent.add(note);
    return top + tileHeight + 5 + note.height;
  }

  /** Standard footer for a lane browser: one button back to the map. */
  private laneCloseButton(content: UIBounds): void {
    this.modalLayer.add(this.ui.button(
      {
        x: content.x,
        y: GAME_HEIGHT - LANE_CLOSE_BUTTON_OFFSET,
        width: content.width,
        height: LANE_CLOSE_BUTTON_HEIGHT,
      },
      t('ascent.lane.close'),
      () => this.closeLane(),
      { variant: 'primary', fontSize: '13px' },
    ));
  }

  /** Leaves a lane browser, restoring whatever pause state the player had before opening it. */
  private closeLane(): void {
    // Leaving the battle screen unanswered is an answer: the generals fight on and the world
    // moves. The hold only ever lasts as long as the screen that asked for it.
    this.battleAwaitingOrder = false;
    this.state.isStrategyPause = this.lanePauseBeforeOpen;

    // In the arena there is nothing behind this screen. Closing it dropped the player onto a map
    // with one province, no economy and no way back — the fight *is* the session, so leaving it
    // means leaving the fight, not stepping out of it onto a world that is not there.
    if (this.openPromptKey === 'lane:aftermath') {
      this.dismissAftermath();
      return;
    }
    if (this.state.ascent?.arena && this.openPromptKey === 'lane:battle') {
      this.events.emit('ui:arena-leave');
      return;
    }
    this.closeOverlay();
  }

  // ── Bar screens ───────────────────────────────────────────────────────────
  //
  // The same five screens the classic modes reach from their action bar, rebuilt on this
  // scene's card components against the same systems. The autopilot still runs everything
  // between decisions; these exist so the player can *overrule* it at any moment rather than
  // waiting for a card to offer the choice.

  /** Build / upgrade a district by hand, ahead of whatever the autopilot would have picked. */
  /**
   * Draws the offer a story is hanging on this surface, if one is.
   *
   * `openingFor` used to be called from exactly one place — the land panel — so an opening
   * declared `on: 'treasury' | 'army' | 'rival'` existed in the catalogue and appeared nowhere in
   * the world. The whole design of an opening is that it waits somewhere the player already goes.
   */
  private addStoryOpening(
    on: 'land' | 'hero' | 'army' | 'rival' | 'treasury',
    subjectId: string | undefined,
    addHeading: (label: string) => void,
    addRow: (opts: { title: string; subtitle: string; border: number }, onTap?: () => void) => void,
  ): void {
    const opening = openingFor(this.state, on, subjectId);
    if (!opening) return;
    addHeading(t('land.section.spokenOf'));
    addRow(
      {
        title: storyText(opening.actionKey, opening.params),
        subtitle: storyText(opening.textKey, opening.params),
        border: INK_UI.gold,
      },
      () => {
        if (takeOpening(this.state, opening.storyId, opening.fragmentId)) this.closeLane();
      },
    );
  }

  private showBuildScreen(): void {
    const state = this.state;
    const lands = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
    const { addRow, addHeading, addWidget, finish } = this.laneList(
      t('action.build'),
      t('ascent.screen.buildBody', { lands: lands.length }),
    );

    // Claims live at the top of this screen because taking ground and developing it are the same
    // decision — what the realm should spend its next season on. They were previously reachable
    // only by tapping a province on the map and finding the inspect card's "Claim this" button,
    // which meant the cap, the progress and the option to call one off had nowhere to live.
    const claims = state.acquisitionOrders.filter((order) => order.buyerId === PLAYER_KINGDOM_ID);
    const slots = getClaimSlots(state);
    addHeading(
      t('ascent.claim.heading', { used: claims.length, cap: slots }),
      t('ascent.claim.headingHint'),
    );

    for (const order of claims) {
      const target = state.lands.find((candidate) => candidate.id === order.landId);
      addRow(
        {
          title: target?.name ?? order.landId,
          subtitle: t('ascent.claim.row', {
            method: t(`ascent.claim.method.${order.method}` as Parameters<typeof t>[0]),
            progress: Math.round(order.progress),
            required: Math.round(order.required),
          }),
          border: INK_UI.gold,
        },
        () => this.showClaimDetail(order.landId),
      );
    }

    // The cap on the heading is the whole answer for this row. `1/1` means no claim can be opened,
    // so the control that opens one is shut — greyed, no handler, and carrying the reason.
    //
    // It asked whether any province was within reach, which is a different question and left the
    // row jade and tappable at the cap, leading to a browser of provinces whose every method was
    // greyed. Then it asked whether *any* method was open, which is closer but still not this
    // question: siege and occupation spend no claim slot, so force kept the row alive at `1/1` and
    // the screen went on offering an envoy under a heading that said there were none. A limit the
    // player can tap straight through is not a limit. Force is still reachable the classic way, by
    // selecting the province on the map — the inspect card raises the same sheet.
    const targets = buildAllConquestTargets(state);
    const openTargets = targets.filter(
      (target) => target.methods.some((method) => !method.blockedReason),
    );
    const claimBlocked = claimBlockedReason(state);
    const canClaim = !claimBlocked && openTargets.length > 0;
    addRow(
      {
        title: t('ascent.claim.start'),
        subtitle: claimBlocked
          ?? (openTargets.length > 0
            ? t('ascent.claim.startHint', { n: openTargets.length })
            : t('ascent.claim.startNone')),
        border: canClaim ? INK_UI.jade : INK_UI.softBrush,
        muted: !canClaim,
      },
      canClaim ? () => this.showClaimTargets() : undefined,
    );

    // **Every province opens, always.**
    //
    // This row used to pass no handler at all while a building was going up — `order ? undefined :
    // …` — on the reasoning that there is nothing to build while something is already being built.
    // That reasoning is about one third of the screen behind it. The province sheet is also where
    // the focus is set and where a governor is posted, and neither of those has anything to do with
    // the build queue. A realm whose provinces happened to be under construction — which is the
    // normal state of a working realm, and is *guaranteed* early on when the autopilot has just
    // filed an order on each — found the entire Build page inert, with no way to tell that the rows
    // were disabled rather than the game broken.
    //
    // The order is worth showing, so it stays in the subtitle. It is not worth locking the door.
    addHeading(t('land.section.holdings'));
    // A province is a name and one line of state — two of them fit across the sheet, and a realm of
    // eight provinces is a page you look at instead of a page you scroll. Full-width cards spent
    // the whole width on a four-word name.
    addWidget(0, (parent, width) => this.actionTiles(parent, width, lands.map((land) => {
      const order = state.buildOrders.find((candidate) => candidate.landId === land.id);
      return {
        title: land.name,
        note: order
          ? t('ascent.screen.building', { n: Math.max(0, order.required - order.progress) })
          : t('ascent.screen.slots', {
              used: land.buildings.length,
              cap: land.buildingCapacity,
              defense: land.defense,
            }),
        border: order ? INK_UI.gold : INK_UI.jade,
        onTap: () => this.showBuildOptions(land.id),
      };
    })));
    this.addStoryOpening('treasury', undefined, addHeading, addRow);

    finish();
  }

  /**
   * The provinces within reach, as a lane browser.
   *
   * Tapping one emits `ui:ascent-conquer` — the same event the map's inspect card raises — so the
   * method sheet behind it is the existing one rather than a second copy of it.
   */
  private showClaimTargets(): void {
    const state = this.state;
    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);

    // The whole border, not the card prompt's short hand: a province left off this list did not
    // exist to the player. Open provinces first, then by odds — the same order as before.
    const targets = buildAllConquestTargets(state);
    const { addRow, finish } = this.laneList(t('ascent.claim.start'), `${t('ascent.claim.headingHint')}\n${t('ascent.claim.count', { n: targets.length })}`);

    for (const target of targets) {
      const open = target.methods.filter((method) => !method.blockedReason);
      const best = open.slice().sort((a, b) => b.chance - a.chance)[0];
      const actor = best ? methodActorLine(state, best) : undefined;
      const bestLine = best
        ? t('ascent.claim.bestWay', {
            method: t(`ascent.method.${best.method}` as Parameters<typeof t>[0]),
            actor: actor ? actor.split(' — ')[0] : t('ascent.conquer.actorNone'),
          })
        : '';
      addRow(
        {
          title: target.landName,
          subtitle: `${open.length > 0 ? t('ascent.conquer.ways', { n: open.length }) : target.busyReason ?? t('ascent.conquer.noWay')}  ·  ${t('ascent.march.garrison', { value: target.garrison })}${bestLine ? `\n${bestLine}` : ''}`,
          border: open.length > 0 ? INK_UI.jade : INK_UI.softBrush,
          muted: open.length === 0,
        },
        () => {
          this.closeLane();
          this.events.emit('ui:ascent-conquer', target.landId);
        },
      );
    }

    finish();
  }

  /**
   * One claim in progress, and the option to call it off.
   *
   * The refund is stated before the tap, not after, because it is usually nothing — a bribe's gold
   * is already in the noble's hands and settlers have already left — and a player who is not told
   * that will read a cancel button as a full undo.
   */
  private showClaimDetail(landId: string): void {
    const state = this.state;
    const order = state.acquisitionOrders.find(
      (candidate) => candidate.landId === landId && candidate.buyerId === PLAYER_KINGDOM_ID,
    );
    const land = state.lands.find((candidate) => candidate.id === landId);
    if (!order || !land) return;

    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);

    const { addRow, finish } = this.laneList(
      land.name,
      t('ascent.claim.row', {
        method: t(`ascent.claim.method.${order.method}` as Parameters<typeof t>[0]),
        progress: Math.round(order.progress),
        required: Math.round(order.required),
      }),
    );

    const refund = getClaimRefund(state, order);
    const refundText = formatResourceList(refund);
    addRow(
      {
        title: t('ascent.claim.cancel'),
        subtitle: refundText
          ? t('ascent.claim.cancelRefund', { refund: refundText })
          : t('ascent.claim.cancelNothing'),
        border: INK_UI.cinnabar,
      },
      () => {
        cancelAcquisition(state, landId);
        this.showBuildScreen();
      },
    );

    finish();
  }

  /** The options for one district: every build and upgrade it admits, priced. */
  private showBuildOptions(landId: string): void {
    const state = this.state;
    const land = state.lands.find((candidate) => candidate.id === landId);
    if (!land) return;

    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);

    const { addRow, addHeading, finish } = this.laneList(
      // The mark. One glyph, and the only signal a story ever gives about a subject: something
      // has taken an interest here. It says nothing at all about what that something wants.
      isMarked(state, 'land', land.id) ? `${land.name} ◈` : land.name,
      t('ascent.screen.slots', { used: land.buildings.length, cap: land.buildingCapacity, defense: land.defense }),
    );

    // Closing re-runs `refresh`, which repaints the resource bar and the bar's status dots
    // against the order just filed — so there is nothing else to notify.
    const act = (run: () => boolean) => {
      if (run()) this.closeLane();
    };

    // ── Status: what the province is worth, before anything is decided about it ──
    //
    // The sheet opened straight onto controls and never said what the place *was*. A player asked
    // to choose a focus for a province could not see what that province currently produced, which
    // is the one number the choice is made against.
    addHeading(t('land.section.status'));
    const outputs = land.outputs;
    const growth = getLandPopulationGrowth(state, land);
    addRow({
      title: t('land.status.people', { people: Math.round(land.population), growth }),
      subtitle: `${t('land.status.yield', {
        food: Math.round(outputs?.food ?? 0),
        supplies: Math.round(outputs?.supplies ?? 0),
        gold: Math.round(outputs?.gold ?? 0),
      })}\n${t('land.status.hold', {
        defense: Math.round(land.defense),
        loyalty: Math.round(land.loyalty),
      })}`,
      border: INK_UI.jade,
    });

    // What the province is already doing, if anything. Shown here so a player arriving at a
    // province mid-build is told why the build rows below are greyed, rather than left to guess.
    const buildOrder = state.buildOrders.find((candidate) => candidate.landId === land.id);
    if (buildOrder) {
      addRow({
        title: t('ascent.screen.building', { n: Math.max(0, buildOrder.required - buildOrder.progress) }),
        subtitle: t('ascent.screen.buildingHint'),
        border: INK_UI.gold,
        muted: true,
      });
    }

    // ── Assignment ──
    //
    // Who holds the province. Neither this nor the focus below was reachable in this mode at all:
    // Dragon Ascent never imported the specialization API, so every province in a run stayed on
    // `balanced` forever, and a champion could be summoned but never posted to a district. The row
    // opens a picker rather than posting anyone itself — it used to assign `idleHeroes[0]`, the
    // first idle hero in state order, which is not a choice the player was making.
    addHeading(t('land.section.assignment'));
    const governor = state.heroes.find((candidate) => candidate.assignedTo === land.id);
    const candidates = buildGovernorRows(state, land);
    addRow(
      {
        title: governor ? t('focus.governor', { hero: heroName(governor) }) : t('gov.none'),
        subtitle: governor ? this.heroStatLine(governor) : t('gov.noneHint'),
        border: governor ? INK_UI.gold : INK_UI.softBrush,
        muted: !governor && candidates.length === 0,
      },
      candidates.length > 0 ? () => this.showGovernorPicker(land.id) : undefined,
    );

    addHeading(t('land.section.focus'), t('focus.headingHint'));
    for (const row of buildFocusRows(state, land)) {
      addRow(
        {
          title: row.isBest ? `${row.title}  ·  ${t('focus.best')}` : row.title,
          // The martial focuses pay outside the resource bag, so their tilt line alone reads as a
          // pure loss; `extra` is what they actually buy, and is empty for the economic focuses.
          subtitle: `${row.effect}${row.extra ? `\n${row.extra}` : ''}\n${row.suitLine}`,
          border: row.isCurrent
            ? INK_UI.gold
            : row.suitability === 'high' ? INK_UI.jade : INK_UI.softBrush,
          muted: row.suitability === 'low' && !row.isCurrent,
        },
        row.isCurrent ? undefined : () => act(() => setLandSpecialization(state, land.id, row.focus)),
      );
    }

    addHeading(t('land.section.build'));
    for (const option of getBuildOptions(state, land)) {
      addRow(
        {
          title: option.label,
          subtitle: option.canBuild
            ? `${formatResourceList(option.cost)}  ·  ${t('ascent.conquer.ticks', { n: option.ticks })}`
            : option.reason ?? '',
          border: option.canBuild ? INK_UI.jade : INK_UI.softBrush,
          muted: !option.canBuild,
        },
        option.canBuild ? () => act(() => buildDistrictBuilding(state, land.id, option.type)) : undefined,
      );
    }

    for (const option of getUpgradeOptions(state, land)) {
      addRow(
        {
          title: t('ascent.screen.upgrade', { building: buildingLabel(option.type), level: option.level + 1 }),
          subtitle: option.canUpgrade
            ? `${formatResourceList(option.cost)}  ·  ${t('ascent.conquer.ticks', { n: option.ticks })}`
            : option.reason ?? '',
          border: option.canUpgrade ? INK_UI.gold : INK_UI.softBrush,
          muted: !option.canUpgrade,
        },
        option.canUpgrade ? () => act(() => upgradeDistrictBuilding(state, land.id, option.index)) : undefined,
      );
    }

    // ── The offer, if a story has one to make here ──
    //
    // Not a task, not a deadline, not a reward preview. It is the last row of a sheet the player
    // was already looking at, and ignoring it costs nothing and is *also an answer* — in more
    // than one story it is the answer that eventually matters.
    const opening = openingFor(state, 'land', land.id);
    if (opening) {
      addHeading(t('land.section.spokenOf'));
      addRow(
        {
          title: storyText(opening.actionKey, opening.params),
          subtitle: storyText(opening.textKey, opening.params),
          border: INK_UI.gold,
        },
        () => {
          if (takeOpening(state, opening.storyId, opening.fragmentId)) this.closeLane();
        },
      );
    }

    finish();
  }

  /**
   * Who to post to one province, and why.
   *
   * Best-fit first, with the stat the province actually rewards named on every row — because the
   * answer moves with the focus, and a recommendation the player cannot check is one they cannot
   * learn from. Reuses `assignHeroToLand`, which already handles releasing a previous posting.
   */
  private showGovernorPicker(landId: string): void {
    const state = this.state;
    const land = state.lands.find((candidate) => candidate.id === landId);
    if (!land) return;
    const governor = state.heroes.find((candidate) => candidate.assignedTo === land.id);
    const back = () => this.replaceLanePage(() => this.showBuildOptions(landId));
    this.showHeroPicker({
      title: t('ascent.pick.title.governor', { land: land.name }),
      subtitle: t('gov.headingHint'),
      rows: buildHeroPickerRows(state, { kind: 'governor', landId }),
      confirm: (row) => ({
        title: t('ascent.pick.confirmTitle', { hero: heroName(row.hero), role: t('ascent.pick.role.governor', { land: land.name }) }),
        lines: [
          row.effectLine,
          governor && governor.id !== row.hero.id ? t('ascent.pick.replaces', { hero: heroName(governor) }) : '',
        ],
      }),
      onPick: (heroId) => {
        this.events.emit('ui:ascent-assign', { heroId, optionId: `governor:${landId}` });
        back();
      },
      onBack: back,
      // Recalling the governor has to be reachable from the same screen that posted them, or a
      // bad posting is permanent until another province is found to take them.
      extra: governor
        ? {
            title: t('ascent.pick.recall'),
            subtitle: t('ascent.pick.recallBody', { hero: heroName(governor), land: land.name }),
            onTap: () => {
              this.events.emit('ui:ascent-assign', { heroId: governor.id, optionId: 'reserve' });
              back();
            },
          }
        : undefined,
    });
  }

  /**
   * The hero roster. Tapping anyone opens the same Appointment card the game raises when a
   * champion arrives, so a posting can be changed the moment the player wants to.
   */
  private showHeroesScreen(): void {
    const state = this.state;
    // The throne is not one of the champions serving it.
    //
    // The king is a Hero because half the game looks him up as one, but he is the *player* —
    // listing him beside the champions made a founding that gives you a ruler and one champion
    // read as handing you two heroes, and offered you a card to repost yourself. He is named in
    // the header instead, with where he stands, so nothing about him is hidden — only the row
    // that invited you to reassign yourself is gone.
    const king = state.heroes.find((hero) => hero.id === 'king');
    const champions = state.heroes.filter((hero) => hero.id !== 'king');
    const { addRow, finish } = this.laneList(
      t('action.heroes'),
      `${t('ascent.screen.throne', {
        king: king ? heroName(king) : '—',
        posting: king ? this.heroPosting(king) : '—',
        n: champions.length,
      })}
${t('ascent.screen.payroll', { gold: heroPayroll(state) })}`,
    );

    // Unposted first: the most common reason to open this screen.
    const ordered = [...champions].sort(
      (a, b) => Number(Boolean(a.assignedTo)) - Number(Boolean(b.assignedTo)),
    );
    for (const hero of ordered) {
      addRow(
        {
          title: `${heroName(hero)}  ·  ${rarityLabel(hero.rarity)}`,
          subtitle: `${this.heroPosting(hero)} — ${this.heroStatLine(hero)}\n${heroBio(hero)}`,
          border: hero.assignedTo ? INK_UI.jade : INK_UI.cinnabar,
          portrait: hero,
        },
        () => {
          this.closeLane();
          this.events.emit('ui:ascent-appoint', hero.id);
        },
      );
    }
    finish();
  }

  /** Human-readable posting for a hero, covering every form `assignedTo` can take. */
  private heroPosting(hero: Hero): string {
    return heroPostingLabel(this.state, hero);
  }

  /** Seats, the realm's standing, and the laws in force — plus the throne's unspent authority. */
  private showCourtScreen(): void {
    const state = this.state;
    const mandate = state.mandate;
    const { addRow, addHeading, addNote, addWidget, finish } = this.laneList(
      t('action.court'),
      t('ascent.lane.courtBody', {
        era: mandate ? eraLabel(mandate.era) : '—',
        stability: Math.round(state.court.stability),
        points: mandate?.edictPoints ?? 0,
      }),
    );

    const seated = ALL_COURT_POSITIONS.filter((seat) => state.court.seats[seat]).length;
    const unlockedCount = state.court.unlockedSeats.length;

    // ── The court as it stands ──
    //
    // The same reasoning as the province sheet: the screen opened straight onto a list of seats
    // without saying what state the court was in. Stability and its drift are the two numbers the
    // whole screen is about — an empty seat costs stability every tick — and neither was anywhere
    // except as a bare figure in the subtitle, with no sign of which way it was moving.
    addHeading(t('court.section.state'));
    const regen = getCourtBonuses(state).stabilityRegen;
    const drift = `${regen >= 0 ? '+' : ''}${(Math.round(regen * 10) / 10).toFixed(1)}`;
    addWidget(0, (parent, width) => this.statPanel(parent, width, [
      {
        label: t('court.stat.stability'),
        value: `${Math.round(state.court.stability)}%`,
        accent: state.court.stability < 35 ? cssHex(INK_UI.cinnabar) : undefined,
      },
      { label: t('court.stat.drift'), value: drift },
      { label: t('court.stat.seats'), value: `${seated}/${unlockedCount}` },
      {
        label: t('court.stat.favour'),
        value: `${Math.round(state.court.favor)}/${Math.round(state.court.favorThreshold)}`,
      },
    ]));

    // ── Authority: what the realm will bear, and whether it is obeying ──
    //
    // This is the header the standing-law list never had. A decree used to be a purchase with no
    // running cost, so a list of them told the player nothing about the state they were in. Weight
    // against authority says how much more law the throne can carry; obedience says what the laws
    // already passed are actually worth. Both are the numbers the whole screen is about.
    if (mandate) {
      addHeading(t('decree.section.authority'));
      const weight = standingWeight(state);
      const cap = authorityCap(state);
      const over = overreach(state);
      const obedience = Math.round(averageCompliance(state));
      // Nghiêm pháp lifts the cap to infinity, which would print as "3 / Infinity". A word, not a
      // number, because at that point the number has stopped being the thing the player reads.
      const capLabel = Number.isFinite(cap) ? `${cap}` : t('decree.authority.boundless');
      addWidget(0, (parent, width) => this.statPanel(parent, width, [
        {
          label: t('decree.stat.weight'),
          value: t('decree.authority.value', { weight: `${weight}`, cap: capLabel }),
          accent: over > 0 ? cssHex(INK_UI.cinnabar) : undefined,
        },
        {
          label: t('decree.stat.compliance'),
          value: t('decree.compliance.value', { n: `${obedience}` }),
          accent: obedience < 45 ? cssHex(INK_UI.cinnabar) : undefined,
        },
        { label: t('decree.stat.authority'), value: capLabel },
      ]));
      addNote(
        over > 0
          ? t('decree.authority.over', { n: `${over}` })
          : weight >= cap
            ? t('decree.authority.full')
            : t('decree.authority.room', { n: `${cap - weight}` }),
        over > 0 ? INK_UI.cinnabar : INK_UI.softBrush,
      );
      addNote(t('decree.compliance.effect', { mult: realisedFactor(state).toFixed(2) }));

      // ── The four estates ──
      //
      // One shared 0–100 number per estate is the wire between decrees and everything else in the
      // game, so it has to be visible before a law is passed, not discovered afterwards. An estate
      // in open grievance is called out by name with what it is actually withholding.
      addHeading(t('decree.section.estates'));
      addWidget(0, (parent, width) => this.statPanel(parent, width, ESTATE_IDS.map((estate) => ({
        label: t(`decree.estate.${estate}` as Parameters<typeof t>[0]),
        value: `${Math.round(estateStanding(state, estate))}`,
        accent: estateStanding(state, estate) < ESTATE_CRISIS ? cssHex(INK_UI.cinnabar) : undefined,
      }))));
      for (const estate of ESTATE_IDS) {
        if (estateStanding(state, estate) >= ESTATE_CRISIS) continue;
        addNote(t('decree.estate.angry', {
          estate: t(`decree.estate.${estate}` as Parameters<typeof t>[0]),
          effect: t(`decree.estate.${estate}.angry` as Parameters<typeof t>[0]),
        }), INK_UI.cinnabar);
      }
    }

    // ── Schools of statecraft ──
    //
    // Only once the reign has actually leaned somewhere. Shown from the first decree of a school
    // rather than only at the capstone, so the player can see the commitment coming and decide
    // whether to make it — a fork you discover after crossing it is not a fork.
    if (mandate) {
      const tally = schoolTally(state);
      const leaning = ALL_SCHOOLS.filter((school) => tally[school] > 0);
      if (leaning.length > 0) {
        addHeading(t('decree.section.schools'));
        addWidget(0, (parent, width) => this.statPanel(parent, width, ALL_SCHOOLS.map((school) => ({
          label: t(`decree.school.${school}` as Parameters<typeof t>[0]),
          value: `${tally[school]}`,
          accent: isSchoolLocked(state, school)
            ? cssHex(INK_UI.softBrush)
            : tally[school] >= SCHOOL_COMMIT ? cssHex(INK_UI.jade) : undefined,
        }))));
        for (const school of ALL_SCHOOLS) {
          if (!capstoneReady(state, school)) continue;
          addRow(
            {
              title: t('decree.capstone.offer', { title: t(`decree.capstone.${school}` as Parameters<typeof t>[0]) }),
              subtitle: t(`decree.capstone.${school}.d` as Parameters<typeof t>[0]),
              border: INK_UI.jade,
            },
            () => {
              if (takeCapstone(state, school)) {
                refreshAllLandOutputs(state);
                this.closeLane();
                this.showCourtScreen();
              }
            },
          );
        }
        for (const school of capstonesTaken(state)) {
          addRow({
            title: t(`decree.capstone.${school}` as Parameters<typeof t>[0]),
            subtitle: t(`decree.capstone.${school}.d` as Parameters<typeof t>[0]),
            border: INK_UI.jade,
            muted: true,
          });
        }
      }
    }

    // ── Decrees ──
    if ((mandate?.edictPoints ?? 0) > 0 || (mandate?.edicts.length ?? 0) > 0) {
      addHeading(t('court.section.decrees'));
    }
    if ((mandate?.edictPoints ?? 0) > 0) {
      addRow(
        {
          title: t('ascent.lane.enactLaw'),
          subtitle: t('ascent.lane.enactLawBody', { points: mandate?.edictPoints ?? 0 }),
          border: INK_UI.gold,
        },
        () => {
          this.closeLane();
          this.events.emit('ui:ascent-law');
        },
      );
    }
    for (const edictId of mandate?.edicts ?? []) {
      const view = lawCardView(state, edictId);
      if (!view) continue;
      const terms = repealTerms(state, edictId);
      // A standing law is now a row you can act on rather than a receipt. Repeal is the pressure
      // valve the weight system needs: without it, one bad early pick is a bad whole run.
      addRow(
        {
          title: view.title,
          subtitle: `${view.effect}  ·  ${t('decree.weight.cost', { n: `${terms?.weight ?? 0}` })}`,
          border: INK_UI.gold,
          muted: !terms?.affordable,
        },
        terms?.affordable
          ? () => {
            if (repealProject(state, edictId)) {
              refreshAllLandOutputs(state);
              this.closeLane();
              this.showCourtScreen();
            }
          }
          : undefined,
      );
    }

    // ── The tax dial, always directly under the decrees ──
    //
    // Tax used to be reachable only as cards inside the Chiếu Chỉ prompt, which made a standing
    // policy feel like a random event: you set it when the prompt happened to come up, and could
    // not find it again when you wanted it. A dial the player owns lives on the court screen.
    addHeading(t('court.section.tax'));
    addWidget(72, (holder, width) => {
      const panel = this.ui.panel(
        { x: 0, y: 0, width, height: 72 },
        { border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52 },
      );
      holder.add(panel);

      const effectLine = (rate: number): string => {
        const fatiguePenalty = (state.taxFatigue ?? 0) * 0.16;
        const drift = Number((taxStabilityBase(rate) - fatiguePenalty).toFixed(1));
        return t('ascent.tax.effects', {
          mult: taxGoldMult(rate).toFixed(2),
          drift: `${drift >= 0 ? '+' : ''}${drift.toFixed(1)}`,
          growth: `${taxGrowthDelta(rate) >= 0 ? '+' : ''}${taxGrowthDelta(rate).toFixed(1)}`,
        });
      };
      const detail = this.ui.label(14, 10, effectLine(currentTaxRate(state)), 'caption', {
        fontSize: '11px',
      });
      holder.add(detail);

      holder.add(this.ui.label(14, 52, t('ascent.tax.light'), 'caption', { fontSize: '10px' }));
      holder.add(
        this.ui.label(width - 14, 52, t('ascent.tax.heavy'), 'caption', { fontSize: '10px' }).setOrigin(1, 0),
      );

      holder.add(
        this.ui.slider(
          { x: 10, y: 24, width: width - 20, height: 22 },
          {
            value: currentTaxRate(state),
            onPreview: (rate) => detail.setText(effectLine(rate)),
            onChange: (rate) => {
              setTaxRate(state, rate);
              refreshAllLandOutputs(state);
              detail.setText(effectLine(rate));
            },
          },
        ),
      );
    });

    // ── Seats, ordered by what wants attention ──
    //
    // Fixed order previously, so a locked seat — nothing to be done about it for another era — sat
    // between two vacancies the player could fill today. Vacant-and-open first, then the seats
    // already working, then the ones still shut: the list now reads top-down as "do this, this is
    // fine, this is later".
    addHeading(t('court.section.seats'));
    const seats = [...ALL_COURT_POSITIONS].sort((a, b) => {
      const rank = (seat: CourtPositionId) => {
        if (!state.court.unlockedSeats.includes(seat)) return 2;
        return state.court.seats[seat] ? 1 : 0;
      };
      return rank(a) - rank(b);
    });

    // Four seats, each a title and who holds it — a grid, not four full-width cards. The order
    // above still decides which corner a seat sits in, so "do this, this is fine, this is later"
    // still reads top-left to bottom-right.
    addWidget(0, (parent, width) => this.actionTiles(parent, width, seats.map((seat) => {
      const unlocked = state.court.unlockedSeats.includes(seat);
      const hero = state.heroes.find((candidate) => candidate.id === state.court.seats[seat]);
      return {
        title: getCourtPositionLabel(seat),
        note: hero
          ? `${heroName(hero)} — ${seatedEffectSummary(state, seat) ?? ''}`
          : unlocked ? t('ascent.lane.seatEmpty') : t('ascent.lane.seatLocked'),
        border: hero ? INK_UI.jade : unlocked ? INK_UI.gold : INK_UI.softBrush,
        muted: !unlocked,
        onTap: () => this.showSeatPicker(seat),
      };
    })));

    finish();
  }

  /** Who takes this seat. Confirmed; the sitter can also be sent back to the bench. */
  private showSeatPicker(seat: CourtPositionId): void {
    const state = this.state;
    const sitter = state.heroes.find((candidate) => candidate.id === state.court.seats[seat]);
    const seatName = getCourtPositionLabel(seat);
    const back = () => this.replaceLanePage(() => this.showCourtScreen());
    this.showHeroPicker({
      title: t('ascent.pick.title.court', { seat: seatName }),
      rows: buildHeroPickerRows(state, { kind: 'court', seat }),
      confirm: (row) => ({
        title: t('ascent.pick.confirmTitle', { hero: heroName(row.hero), role: t('ascent.pick.role.court', { seat: seatName }) }),
        lines: [
          row.effectLine,
          sitter && sitter.id !== row.hero.id ? t('ascent.pick.replaces', { hero: heroName(sitter) }) : '',
        ],
      }),
      onPick: (heroId) => {
        this.events.emit('ui:ascent-assign', { heroId, optionId: `court:${seat}` });
        back();
      },
      onBack: back,
      extra: sitter
        ? {
            title: t('ascent.pick.vacant'),
            subtitle: t('ascent.pick.vacantBody', { hero: heroName(sitter) }),
            onTap: () => {
              this.events.emit('ui:ascent-assign', { heroId: sitter.id, optionId: 'reserve' });
              back();
            },
          }
        : undefined,
    });
  }

  /** Standing hosts, and the levy the player can raise without waiting for the autopilot. */
  private showArmyScreen(): void {
    const state = this.state;
    const ascent = state.ascent;
    const mine = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID);
    const { addRow, addHeading, addNote, addWidget, finish } = this.laneList(
      t('action.army'),
      t('ascent.screen.armyBody', {
        defense: Math.round(ascent?.defensePower ?? 0),
        threat: Math.round(ascent?.threat ?? 0),
      }),
    );

    // What the realm can bring against what is coming — the comparison the whole screen exists to
    // inform, and previously a subtitle the eye skips on the way to the rows.
    const defence = Math.round(ascent?.defensePower ?? 0);
    const threat = Math.round(ascent?.threat ?? 0);
    const troops = mine.reduce(
      (sum, army) => sum + army.units.spearmen + army.units.archers + army.units.heavyInfantry,
      0,
    );
    addHeading(t('army.section.state'));
    addWidget(0, (parent, width) => this.statPanel(parent, width, [
      {
        label: t('army.stat.defence'),
        value: String(defence),
        accent: threat > defence ? cssHex(INK_UI.cinnabar) : undefined,
      },
      { label: t('army.stat.threat'), value: String(threat) },
      { label: t('army.stat.hosts'), value: String(mine.length) },
      { label: t('army.stat.soldiers'), value: String(troops) },
    ]));

    // The war as it stands. The header strip says how much danger is coming; this section says
    // where it already is: the live battle, each invader the realm can see and what it is
    // marching on, our own sieges, and the front the autopilot is pressing.
    addHeading(t('army.section.war'));
    const battle = ascent?.activeBattle;
    if (battle && !battle.over) {
      addRow(
        {
          title: t('ascent.war.battleRow', {
            land: battle.landName,
            round: battle.round,
            total: battle.totalRounds,
          }),
          subtitle: t('ascent.war.battleBody', {
            ours: Math.round(battle.ourNow),
            theirs: Math.round(battle.theirNow),
          }),
          border: INK_UI.cinnabar,
        },
        // Through the lane, not `showBattle` directly: the lane key is what makes `refresh`
        // beat the screen forward, so a battle opened here used to sit frozen at its first frame.
        () => { this.closeLane(); this.openLane('battle'); },
      );
    }

    const nextWave = (ascent?.wave ?? 0) + 1;
    const waveTicks = Math.max(0, ascent?.ticksToWave ?? 0);
    const loud = isBossWave(nextWave) || Boolean(ascent?.coalitionPending);
    addNote(
      [
        isBossWave(nextWave)
          ? t('ascent.war.nextWaveBoss', { ticks: waveTicks })
          : t('ascent.war.nextWave', { wave: nextWave, ticks: waveTicks }),
        ascent?.coalitionPending ? t('ascent.war.coalition') : '',
      ].filter(Boolean).join('  ·  '),
      loud ? INK_UI.cinnabar : undefined,
    );

    const planLabel: Record<NonNullable<InvasionRecord['plan']>, string> = {
      spearhead: t('ascent.war.planSpearhead'),
      flanker: t('ascent.war.planFlanker'),
      raider: t('ascent.war.planRaider'),
      withdrawing: t('ascent.war.planWithdrawing'),
    };
    let unseen = 0;
    let seen = 0;
    for (const record of state.invasions ?? []) {
      const invader = state.armies.find((candidate) => candidate.id === record.armyId);
      if (!invader) continue;
      const at = state.lands.find((candidate) => candidate.id === invader.landId);
      // Same honesty gate as the hunt list: a host standing in the dark stays a rumour.
      if (!at?.isVisible) {
        unseen += 1;
        continue;
      }
      seen += 1;
      const kingdom = state.kingdoms.find((candidate) => candidate.id === record.kingdomId);
      const target = state.lands.find((candidate) => candidate.id === record.targetLandId);
      const size = invader.units.spearmen + invader.units.archers + invader.units.heavyInfantry;
      const attack = Math.round(armyPower(state, invader));
      const holding = target
        ? Math.round(
            landGarrisonPower(state, target) +
              mine
                .filter((army) => army.landId === target.id)
                .reduce((sum, army) => sum + armyPower(state, army), 0),
          )
        : 0;
      const withdrawing = record.plan === 'withdrawing';
      addRow({
        title:
          (record.great ? t('ascent.war.great') : '') +
          t('ascent.war.invaderRow', { kingdom: kingdom?.name ?? '—', size }),
        subtitle: t('ascent.war.invaderBody', {
          plan: planLabel[record.plan ?? 'spearhead'],
          target: target?.name ?? at.name,
          attack,
          defence: holding,
        }),
        border: withdrawing ? INK_UI.softBrush : INK_UI.cinnabar,
        muted: withdrawing,
      });
    }
    if (unseen > 0) {
      addNote(t('ascent.war.unseenCount', { n: unseen }));
    }

    for (const order of state.siegeOrders.filter((candidate) => candidate.attackerKingdomId === PLAYER_KINGDOM_ID)) {
      const land = state.lands.find((candidate) => candidate.id === order.landId);
      const besieger = state.armies.find((candidate) => candidate.id === order.armyId);
      addRow({
        title: t('ascent.war.siegeRow', {
          land: land?.name ?? '—',
          pct: Math.round((order.progress / Math.max(1, order.required)) * 100),
        }),
        subtitle: besieger ? t('ascent.war.siegeBody', { army: besieger.name }) : '',
        border: INK_UI.gold,
      });
    }

    const front = state.lands.find((candidate) => candidate.id === ascent?.frontLandId);
    if (front) {
      addRow({
        title: t('ascent.war.frontRow', { land: front.name }),
        subtitle: t('ascent.war.frontBody', { pct: Math.round(frontWinChance(state) * 100) }),
        border: INK_UI.jade,
      });
    }

    if (!battle && seen === 0 && unseen === 0) {
      addNote(t('ascent.war.quiet'));
    }

    addHeading(t('army.section.muster'));
    // Every muster under way. `state.recruitmentOrders` was never read by this mode's screens:
    // "raise a host" closed the lane and nothing anywhere said a muster had begun.
    for (const muster of musterRows(state)) {
      const orders = muster.orders;
      const landName = (id: string): string => state.lands.find((land) => land.id === id)?.name ?? '';
      const orderLabel = orders?.kind === 'defend'
        ? t('ascent.orders.defend', { land: landName(orders.landId) })
        : orders?.kind === 'attack'
          ? t('ascent.orders.attack', { land: landName(orders.landId) })
          : orders?.kind === 'follow'
            ? t('ascent.orders.follow', { army: state.armies.find((army) => army.id === orders.armyId)?.name ?? '' })
            : t('ascent.orders.auto');
      addRow({
        title: t('ascent.muster.row', { n: muster.soldiers, land: muster.land?.name ?? '—' }),
        subtitle: t('ascent.muster.body', {
          hero: muster.heroName,
          progress: muster.progress,
          required: muster.required,
          left: Math.max(0, muster.required - muster.progress),
          comp: t(`comp.${muster.composition}` as Parameters<typeof t>[0]),
          order: orderLabel,
        }),
        border: INK_UI.gold,
      });
    }
    const commanderId = findFreeCommander(state);
    const spare = state.resources.humans - RECRUIT_HUMAN_RESERVE;
    const canRaise = state.heroes.length > 0;
    addWidget(0, (parent, width) => this.actionTiles(parent, width, [
      {
        title: t('ascent.screen.raiseHost'),
        note: commanderId && spare >= MIN_ARMY_SOLDIERS
          ? t('ascent.screen.raiseHostBody', { n: recruitSoldiers(spare) })
          : commanderId
            ? t('ascent.screen.raiseNoPeople')
            : t('ascent.conquer.needHero'),
        border: canRaise ? INK_UI.jade : INK_UI.softBrush,
        muted: !canRaise,
        onTap: canRaise ? () => this.showRaiseHostForm() : undefined,
      },
    ]));

    // Standing hosts only: a garrison levy is the province's own walls turned out for one
    // battle (see `raiseGarrisonLevy`) — it takes no orders and goes home when the fight ends.
    const hosts = mine.filter((army) => !army.isLevy);
    if (hosts.length > 0) {
      addHeading(t('army.section.hosts'));
    }
    for (const army of hosts) {
      const land = state.lands.find((candidate) => candidate.id === army.landId);
      const general = state.heroes.find((candidate) => candidate.id === army.generalHeroId);
      const size = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
      const remnant = !isAutoHost(army) && size < MIN_ARMY_SOLDIERS * REMNANT_SHARE;
      addRow(
        {
          title: `${army.name}  ·  ${size}`,
          subtitle: `${t('ascent.screen.armyRow', {
            land: land?.name ?? '—',
            general: general ? heroName(general) : t('ascent.screen.noGeneral'),
            morale: Math.round(army.morale),
            supply: Math.round(army.supply),
          })}\n${remnant ? t('ascent.orders.remnantRow', { n: size }) : hostOrderLabel(state, army)}`,
          border: remnant || army.morale < 40 || army.supply < 30 ? INK_UI.cinnabar : INK_UI.jade,
        },
        () => this.showArmyDetail(army.id),
      );
    }
    this.addStoryOpening('army', undefined, addHeading, addRow);

    finish();
  }

  /**
   * The one hero picker.
   *
   * Every posting a hero can be chosen for — a seat, a province, a host, an embassy — used to
   * have its own way of asking (or none: a host's commander and a claim's envoy were picked for
   * the player). This is the single screen they all open now: each hero with their portrait,
   * what the posting would mean for *them*, where they are today, and what taking them leaves
   * empty — the current holder first, the best fit marked — and a confirm page before anything
   * moves, because heroes are the run's scarcest thing and a mis-tap should cost a tap, not a
   * minister.
   */
  private showHeroPicker(opts: {
    title: string;
    subtitle?: string;
    rows: HeroPickerRow[];
    /** The confirm page's headline and lines for a row — the role, in words. */
    confirm: (row: HeroPickerRow) => { title: string; lines: string[] };
    onPick: (heroId: string) => void;
    onBack: () => void;
    /** An extra row at the foot: leave vacant, recall, take the field without a commander. */
    extra?: { title: string; subtitle: string; onTap: () => void };
  }): void {
    this.replaceLanePage(() => {
      const { addRow, finish } = this.laneList(opts.title, opts.subtitle ?? t('ascent.pick.subtitle'), { back: opts.onBack });
      if (opts.rows.length === 0) {
        addRow({ title: t('ascent.pick.nobody'), subtitle: '', border: INK_UI.softBrush, muted: true });
      }
      for (const row of opts.rows) {
        const tags = [
          row.isCurrent ? t('ascent.pick.current') : '',
          row.isBest ? t('ascent.pick.recommended') : '',
        ].filter(Boolean);
        const blocked = Boolean(row.blockedReason);
        addRow(
          {
            title: tags.length > 0 ? `${heroTitleLine(row.hero)}\n${tags.join('  ·  ')}` : heroTitleLine(row.hero),
            subtitle: [
              blocked ? row.blockedReason : row.effectLine,
              row.postingLine,
              row.vacates ?? '',
              row.statsLine,
              row.flavour,
            ].filter(Boolean).join('\n'),
            border: row.isCurrent ? INK_UI.gold : blocked ? INK_UI.softBrush : row.isBest ? INK_UI.jade : INK_UI.brush,
            muted: blocked,
            portrait: row.hero,
          },
          blocked || row.isCurrent
            ? undefined
            : () => {
                const { title, lines } = opts.confirm(row);
                this.showConfirmPage({
                  title,
                  subtitle: heroTitleLine(row.hero),
                  portrait: row.hero,
                  lines: [...lines, row.vacates ?? ''].filter(Boolean),
                  confirmLabel: t('ascent.pick.confirm'),
                  danger: Boolean(row.vacates),
                  onConfirm: () => opts.onPick(row.hero.id),
                  onBack: () => this.showHeroPicker(opts),
                });
              },
        );
      }
      if (opts.extra) {
        addRow({ title: opts.extra.title, subtitle: opts.extra.subtitle, border: INK_UI.softBrush }, opts.extra.onTap);
      }
      finish();
    });
  }

  /** The hosts a military method (or a follow order) could commit — the same shape, for armies. */
  private showHostPicker(opts: {
    title: string;
    subtitle?: string;
    rows: HostPickerRow[];
    confirm: (row: HostPickerRow) => { title: string; lines: string[]; danger?: boolean };
    onPick: (armyId: string, force: boolean) => void;
    onBack: () => void;
  }): void {
    this.replaceLanePage(() => {
      const { addRow, finish } = this.laneList(opts.title, opts.subtitle ?? t('ascent.pick.hostSubtitle'), { back: opts.onBack });
      if (opts.rows.length === 0) {
        addRow({ title: t('ascent.pick.nobody'), subtitle: '', border: INK_UI.softBrush, muted: true });
      }
      for (const row of opts.rows) {
        const blocked = Boolean(row.blockedReason);
        const thin = row.chance !== undefined && row.chance < MARCH_MIN_WIN_CHANCE && row.chance < 100;
        addRow(
          {
            title: `${row.title}${row.isBest ? `  ·  ${t('ascent.pick.recommended')}` : ''}${thin ? `  ·  ${t('ascent.pick.attackAnyway')}` : ''}`,
            subtitle: [
              blocked ? row.blockedReason : row.chance !== undefined ? t('ascent.pick.hostOdds', { pct: row.chance }) : '',
              row.line,
              row.orderLabel,
            ].filter(Boolean).join('\n'),
            border: blocked ? INK_UI.softBrush : thin ? INK_UI.gold : row.isBest ? INK_UI.jade : INK_UI.brush,
            muted: blocked,
            portrait: row.general,
          },
          blocked
            ? undefined
            : () => {
                const { title, lines, danger } = opts.confirm(row);
                this.showConfirmPage({
                  title,
                  subtitle: row.title,
                  portrait: row.general,
                  lines,
                  confirmLabel: thin ? t('ascent.pick.attackAnyway') : t('ascent.pick.confirm'),
                  danger: danger || thin,
                  onConfirm: () => opts.onPick(row.army.id, thin),
                  onBack: () => this.showHostPicker(opts),
                });
              },
        );
      }
      finish();
    });
  }

  /** Replaces the current lane page with another, keeping the lane (and its pause) open. */
  private replaceLanePage(build: () => void): void {
    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);
    build();
  }

  /**
   * A yes-or-back page for anything worth a second look: a hero taken from a seat, a host
   * recalled off a siege. One card with the consequences, one primary button, one way back.
   */
  private showConfirmPage(opts: {
    title: string;
    subtitle?: string;
    portrait?: Hero;
    lines: string[];
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
    onBack: () => void;
  }): void {
    this.replaceLanePage(() => {
      const content = this.promptFrame(opts.title, opts.subtitle ?? '');
      let y = content.y;
      if (opts.portrait) {
        const box = { x: content.x + content.width / 2 - 64, y, width: 128, height: 118 };
        this.modalLayer.add(renderHeroFaceInBox(this, opts.portrait, box));
        y += 126;
      }
      const [first, ...rest] = opts.lines.filter(Boolean);
      const card = this.ui.card(
        { x: content.x, y, width: content.width, height: 60 },
        { title: first ?? '', subtitle: rest.join('\n'), border: opts.danger ? INK_UI.cinnabar : INK_UI.gold },
      );
      this.modalLayer.add(card);
      y += ((card.getData('cardHeight') as number) ?? 60) + 14;
      this.modalLayer.add(this.ui.button(
        { x: content.x, y, width: content.width, height: 46 },
        opts.confirmLabel,
        opts.onConfirm,
        { variant: opts.danger ? 'danger' : 'primary', fontSize: '14px' },
      ));
      this.modalLayer.add(this.ui.button(
        { x: content.x, y: y + 58, width: content.width, height: 44 },
        t('ascent.pick.back'),
        opts.onBack,
        { variant: 'ghost', fontSize: '13px' },
      ));
    });
  }

  /** The draft the raise-host form is editing; reset each time the lane opens. */
  private musterDraft?: MusterPlan;

  /**
   * Raising a host, on purpose.
   *
   * Commander, size, baggage, doctrine and standing order — every figure `raiseHostNow` used to
   * decide alone — with the cost and the muster time quoted from the same arithmetic the muster
   * will run. The Muster button carries the plan whole; the autopilot's own one-tap path still
   * exists for the autopilot.
   */
  private showRaiseHostForm(): void {
    const state = this.state;
    const draft = (this.musterDraft ??= defaultMusterPlan(state));
    const limits = musterLimits(state);
    const estimate = getMusterEstimate(state, draft.soldiers);
    const blocked = musterBlockedReason(state, draft);
    const commander = state.heroes.find((candidate) => candidate.id === draft.heroId);
    const rebuild = () => this.replaceLanePage(() => this.showRaiseHostForm());

    this.replaceLanePage(() => {
      const { addRow, addHeading, addWidget, finish } = this.laneList(
        t('ascent.raise.title'),
        t('ascent.raise.body', { land: estimate.land?.name ?? '—', ticks: estimate.ticks }),
        {
          back: () => this.replaceLanePage(() => this.showArmyScreen()),
          footer: {
            label: t('ascent.raise.muster'),
            disabled: Boolean(blocked),
            onTap: () => {
              const plan = { ...draft };
              this.musterDraft = undefined;
              this.closeLane();
              this.events.emit('ui:ascent-raise-host', plan);
            },
          },
        },
      );

      // ── Commander ──
      addHeading(t('ascent.raise.commander'));
      addRow(
        {
          title: commander ? heroTitleLine(commander) : t('ascent.orders.commanderNone'),
          subtitle: commander
            ? `${heroPostingLabel(state, commander)}\n${t('ascent.army.mulGeneral', { pct: Math.round((commander.stats.martial / 100) * 25) })}`
            : t('ascent.raise.commanderBody'),
          border: commander ? INK_UI.gold : INK_UI.cinnabar,
          portrait: commander,
        },
        () => this.showHeroPicker({
          title: t('ascent.pick.title.newHost'),
          rows: buildHeroPickerRows(state, { kind: 'commander' }),
          confirm: (row) => ({
            title: t('ascent.pick.confirmTitle', { hero: heroName(row.hero), role: t('ascent.pick.role.newHost') }),
            lines: [row.effectLine],
          }),
          onPick: (heroId) => { draft.heroId = heroId; rebuild(); },
          onBack: rebuild,
        }),
      );

      // ── Soldiers ──
      addHeading(t('ascent.raise.soldiers'), t('ascent.raise.reserve', { n: RECRUIT_HUMAN_RESERVE }));
      const soldierSlider = (holder: Phaser.GameObjects.Container, width: number) => {
        holder.add(this.ui.panel({ x: 0, y: 0, width, height: 64 }, { border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52 }));
        const line = (n: number) => {
          const est = getMusterEstimate(state, n);
          return t('ascent.raise.soldiersLine', { n, ticks: est.ticks, supplies: est.suppliesCost });
        };
        const label = this.ui.label(14, 10, line(draft.soldiers), 'caption', { fontSize: '11px' });
        holder.add(label);
        const span = Math.max(1, limits.maxSoldiers - limits.minSoldiers);
        const toValue = (n: number) => (n - limits.minSoldiers) / span;
        const fromValue = (v: number) => Math.round((limits.minSoldiers + v * span) / 10) * 10;
        holder.add(this.ui.slider(
          { x: 10, y: 30, width: width - 20, height: 22 },
          {
            value: toValue(Math.min(limits.maxSoldiers, Math.max(limits.minSoldiers, draft.soldiers))),
            color: INK_UI.jade,
            onPreview: (v) => label.setText(line(fromValue(v))),
            onChange: (v) => {
              draft.soldiers = Math.min(limits.maxSoldiers, Math.max(limits.minSoldiers, fromValue(v)));
              // Baggage follows the size unless the player has trimmed it below a full train.
              const want = fullBaggage(draft.soldiers);
              draft.rations = Math.min(want.rations, limits.foodSpare);
              draft.provisions = Math.min(want.provisions, limits.suppliesSpare);
              rebuild();
            },
          },
        ));
      };
      addWidget(64, soldierSlider);

      // ── Baggage ──
      addHeading(t('ascent.raise.baggage'));
      const want = fullBaggage(draft.soldiers);
      const seasons = baggageSeasons(draft.soldiers, draft.rations, draft.provisions);
      const baggageSlider = (
        holder: Phaser.GameObjects.Container,
        width: number,
        current: number,
        max: number,
        text: (n: number) => string,
        onSet: (n: number) => void,
      ) => {
        holder.add(this.ui.panel({ x: 0, y: 0, width, height: 64 }, { border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52 }));
        const label = this.ui.label(14, 10, text(current), 'caption', { fontSize: '11px' });
        holder.add(label);
        const cap = Math.max(1, max);
        holder.add(this.ui.slider(
          { x: 10, y: 30, width: width - 20, height: 22 },
          {
            value: Math.min(1, current / cap),
            color: INK_UI.gold,
            onPreview: (v) => label.setText(text(Math.round(v * cap))),
            onChange: (v) => { onSet(Math.round(v * cap)); rebuild(); },
          },
        ));
      };
      addWidget(64, (holder, width) => baggageSlider(
        holder, width, draft.rations, Math.max(want.rations * 2, limits.foodHeld),
        (n) => t('ascent.raise.rationsLine', { n, seasons: baggageSeasons(draft.soldiers, n, draft.provisions).food }),
        (n) => { draft.rations = Math.min(n, limits.foodHeld); },
      ));
      addWidget(64, (holder, width) => baggageSlider(
        holder, width, draft.provisions, Math.max(want.provisions * 2, limits.suppliesHeld),
        (n) => t('ascent.raise.provisionsLine', { n, seasons: baggageSeasons(draft.soldiers, draft.rations, n).goods }),
        (n) => { draft.provisions = Math.min(n, limits.suppliesHeld); },
      ));
      if (seasons.food < 6) {
        addRow({ title: t('ascent.raise.baggageThin', { seasons: seasons.food }), subtitle: '', border: INK_UI.cinnabar, muted: true });
      }

      // ── Doctrine ──
      addHeading(t('ascent.raise.doctrine'));
      for (const comp of ['balanced', 'spears', 'archers', 'shock'] as ArmyComposition[]) {
        const shares = getCompositionShares(state, comp);
        const current = draft.composition === comp;
        addRow(
          {
            title: t(`comp.${comp}` as Parameters<typeof t>[0]),
            subtitle: `${t(`ascent.raise.comp.${comp}.d` as Parameters<typeof t>[0])}\n${t('ascent.raise.compShares', {
              s: Math.round(shares.spearmen * 100), a: Math.round(shares.archers * 100), h: Math.round(shares.heavyInfantry * 100),
            })}`,
            border: current ? INK_UI.gold : INK_UI.softBrush,
            muted: current,
          },
          current ? undefined : () => { draft.composition = comp; rebuild(); },
        );
      }

      // ── Standing order ──
      addHeading(t('ascent.raise.order'));
      const musterLand = estimate.land;
      const orderRows: Array<{ orders: ArmyOrders; title: string; subtitle: string; pick?: () => void }> = [
        {
          orders: { kind: 'defend', landId: musterLand?.id ?? '' },
          title: t('ascent.orders.defendHere'),
          subtitle: t('ascent.orders.defendHereBody', { land: musterLand?.name ?? '—' }),
        },
        {
          orders: { kind: 'attack', landId: '' },
          title: t('ascent.orders.attackPick'),
          subtitle: t('ascent.orders.attackPickBody'),
          pick: () => this.replaceLanePage(() => {
            const { addRow: addTarget, finish: finishTargets } = this.laneList(t('ascent.orders.attackPick'), t('ascent.orders.targetHint'), { back: rebuild });
            for (const target of buildAllConquestTargets(state)) {
              addTarget(
                { title: target.landName, subtitle: t('ascent.march.garrison', { value: target.garrison }), border: INK_UI.cinnabar },
                () => { draft.orders = { kind: 'attack', landId: target.landId }; rebuild(); },
              );
            }
            finishTargets();
          }),
        },
        {
          orders: { kind: 'follow', armyId: '' },
          title: t('ascent.orders.followPick'),
          subtitle: t('ascent.orders.followPickBody'),
          pick: () => this.showHostPicker({
            title: t('ascent.orders.followPick'),
            subtitle: t('ascent.orders.followHint'),
            rows: buildHostPickerRows(state, { kind: 'follow', forArmyId: '' }),
            confirm: (row) => ({ title: t('ascent.pick.confirmHost', { army: row.army.name, role: t('ascent.pick.role.follow', { army: t('ascent.raise.title') }) }), lines: [row.line] }),
            onPick: (armyId) => { draft.orders = { kind: 'follow', armyId }; rebuild(); },
            onBack: rebuild,
          }),
        },
        { orders: { kind: 'auto' }, title: t('ascent.orders.autoRow'), subtitle: t('ascent.orders.autoBody') },
      ];
      for (const row of orderRows) {
        const chosen = draft.orders.kind === row.orders.kind;
        const detail = chosen && draft.orders.kind === 'attack'
          ? t('ascent.orders.attack', { land: state.lands.find((land) => land.id === (draft.orders as { landId: string }).landId)?.name ?? '' })
          : chosen && draft.orders.kind === 'follow'
            ? t('ascent.orders.follow', { army: state.armies.find((army) => army.id === (draft.orders as { armyId: string }).armyId)?.name ?? '' })
            : row.subtitle;
        addRow(
          { title: row.title, subtitle: detail, border: chosen ? INK_UI.gold : INK_UI.softBrush },
          row.pick ?? (chosen ? undefined : () => { draft.orders = row.orders; rebuild(); }),
        );
      }

      // ── The bill ──
      addRow({
        title: blocked ?? t('ascent.raise.cost', {
          humans: draft.soldiers,
          food: draft.rations,
          supplies: estimate.suppliesCost + draft.provisions,
          ticks: estimate.ticks,
        }),
        subtitle: blocked ? '' : t('ascent.raise.body', { land: estimate.land?.name ?? '—', ticks: estimate.ticks }),
        border: blocked ? INK_UI.cinnabar : INK_UI.jade,
        muted: Boolean(blocked),
      });
      finish();
    });
  }

  /**
   * One host, and what can be done with it.
   *
   * Exists because a shattered army could not be sent home: `disbandArmy` has always worked and
   * the autopilot uses it on remnants, but nothing in this mode's UI ever called it, so a host
   * that had lost its war sat on the map drawing upkeep forever with no way to release it. That
   * matters far more now that upkeep scales with size — a player has to be able to *choose* the
   * treasury over the field, which is the whole point of charging for an army.
   */
  private showArmyDetail(armyId: string): void {
    const state = this.state;
    const army = state.armies.find((candidate) => candidate.id === armyId);
    if (!army) return;

    // The lane key stays `lane:army`: giving this page its own key made every `state-changed`
    // (which each order raises) read as "no overlay open" and tear the page down under the tap.
    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);

    const size = army.units.spearmen + army.units.archers + army.units.heavyInfantry;
    const general = state.heroes.find((candidate) => candidate.id === army.generalHeroId);
    const land = state.lands.find((candidate) => candidate.id === army.landId);

    const { addRow, addHeading, addWidget, finish } = this.laneList(
      army.name,
      t('ascent.army.detailBody', {
        land: land?.name ?? '—',
        general: general ? heroName(general) : t('ascent.screen.noGeneral'),
        morale: Math.round(army.morale),
        supply: Math.round(army.supply),
      }),
    );

    // ── The host ──
    //
    // Everything that describes it, under one heading and in two surfaces instead of three cards:
    // the figures read across a strip, the multipliers that produced the field power sit under it
    // as a line of text, and what the host costs is one line rather than a card of its own. The
    // commander sits here too — who leads is a *fact about the host*, not an order — with the one
    // control that changes it, instead of a full-width card that only says his name.
    const upkeep = ascentArmyUpkeep(state);
    const troops = Math.max(1, getPlayerTroops(state));
    const shareGold = Math.round(upkeep.gold * (size / troops));
    const shareFood = Math.round(upkeep.food * (size / troops));
    const rationRunway = Math.floor((army.rations ?? 0) / Math.max(1, size / 100 * ARMY_RATION_USE_PER_100));
    const starving = (army.rations ?? 0) <= 0;
    const bonuses = getCourtBonuses(state);
    const eliteTier = army.elite ?? 0;
    const multipliers = [
      t('ascent.army.mulLevel', { level: army.level, pct: Math.round(Math.max(0, army.level - 1) * 8) }),
      eliteTier > 0 ? t('ascent.army.mulElite', { tier: eliteTier, pct: Math.round(eliteTier * 18) }) : '',
      general ? t('ascent.army.mulGeneral', { pct: Math.round((general.stats.martial / 100) * 25) }) : '',
      bonuses.armyPowerMult !== 1
        ? t('ascent.army.mulDraft', { pct: Math.round((bonuses.armyPowerMult - 1) * 100) })
        : '',
    ].filter(Boolean);

    addHeading(t('ascent.army.groupHost'));
    addWidget(0, (parent, width) => {
      let y = this.statPanel(parent, width, [
        { label: t('ascent.army.statPower'), value: String(Math.round(armyPower(state, army))) },
        { label: t('ascent.army.statMen'), value: String(size) },
        { label: t('ascent.army.statMorale'), value: String(Math.round(army.morale)) },
        {
          label: t('ascent.army.statSupply'),
          value: String(Math.round(army.supply)),
          accent: starving ? cssHex(INK_UI.cinnabar) : undefined,
        },
      ]);
      const detail = this.add.text(2, y + 5, [
        multipliers.join('  ·  '),
        `${t('ascent.army.upkeepLine', { gold: shareGold, food: shareFood })}  ·  ${
          starving ? t('ascent.army.runwayOut') : t('ascent.army.runwayShort', { ticks: rationRunway })
        }`,
      ].join('\n'), {
        color: starving ? cssHex(INK_UI.cinnabar) : INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '9px',
        lineSpacing: 2,
        wordWrap: { width: width - 4 },
      }).setOrigin(0, 0);
      parent.add(detail);
      return y + 5 + detail.height;
    });
    // `addWidget` takes a height up front, which a measured widget cannot know. Rather than change
    // its contract for one caller, the host block is laid out as a row with a portrait — the one
    // shape in the list that already carries a face — and the figures above it are given their own
    // pass. The commander row keeps `addRow` because a face IS the row here.
    addRow(
      {
        title: general ? heroName(general) : t('ascent.army.noCommander'),
        subtitle: t('ascent.orders.commanderBody'),
        border: general ? INK_UI.gold : INK_UI.cinnabar,
        portrait: general,
      },
      () => this.showCommanderPicker(armyId),
    );

    // ── Orders ──
    //
    // What the host is doing until told otherwise, the one question about how its fights are
    // resolved, and every way to change either. The autopilot used to move and dissolve every
    // host on its own judgement; a host under any order but `auto` is now moved by that order
    // alone (see `StandingOrders`).
    addHeading(t('ascent.orders.heading'));
    const orders = armyOrders(army);
    addWidget(0, (parent, width) => {
      const line = this.add.text(2, 0, t('ascent.orders.current', { order: hostOrderLabel(state, army) }), {
        color: INK_UI_HEX.inkText, fontFamily: UI_FONT, fontSize: '12px', fontStyle: '700',
        wordWrap: { width: width - 4 },
      }).setOrigin(0, 0);
      parent.add(line);
      return line.height;
    });

    const command = (next: ArmyOrders): void => {
      this.events.emit('ui:ascent-army-orders', { armyId, orders: next });
      this.showArmyDetail(armyId);
    };
    const defendingHere = orders.kind === 'defend' && orders.landId === army.landId;
    const owned = state.lands.filter(
      (candidate) => candidate.ownerId === PLAYER_KINGDOM_ID && candidate.id !== army.landId,
    );
    const attackable = buildAllConquestTargets(state);
    const others = state.armies.filter(
      (candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID && !candidate.isLevy && candidate.id !== army.id,
    );
    const quarries = visibleHostileHosts(state);
    addWidget(0, (parent, width) => {
      const height = this.actionTiles(parent, width, [
        {
          title: t('ascent.orders.defendHere'),
          note: t('ascent.orders.defendHereBody', { land: land?.name ?? '—' }),
          border: defendingHere ? INK_UI.gold : INK_UI.jade,
          muted: defendingHere,
          onTap: defendingHere ? undefined : () => command({ kind: 'defend', landId: army.landId }),
        },
        {
          title: t('ascent.army.marchTo'),
          note: owned.length > 0 ? t('ascent.army.marchToBody') : t('ascent.army.noOwnedLand'),
          border: owned.length > 0 ? INK_UI.jade : INK_UI.softBrush,
          muted: owned.length === 0,
          onTap: owned.length > 0 ? () => this.showMarchTargets(armyId) : undefined,
        },
        {
          title: t('ascent.orders.attackPick'),
          note: attackable.length > 0 ? t('ascent.orders.attackPickBody') : t('ascent.army.noOwnedLand'),
          border: attackable.length > 0 ? INK_UI.cinnabar : INK_UI.softBrush,
          muted: attackable.length === 0,
          onTap: attackable.length > 0 ? () => this.showAttackTargets(armyId) : undefined,
        },
        {
          title: t('ascent.orders.followPick'),
          note: t('ascent.orders.followPickBody'),
          border: others.length > 0 ? INK_UI.jade : INK_UI.softBrush,
          muted: others.length === 0,
          onTap: others.length > 0 ? () => this.showFollowTargets(armyId) : undefined,
        },
        {
          title: t('ascent.army.hunt'),
          note: quarries.length > 0 ? t('ascent.army.huntBody', { n: quarries.length }) : t('ascent.army.huntNone'),
          border: quarries.length > 0 ? INK_UI.cinnabar : INK_UI.softBrush,
          muted: quarries.length === 0,
          onTap: quarries.length > 0 ? () => this.showHuntTargets(armyId) : undefined,
        },
        {
          title: t('ascent.orders.autoRow'),
          note: t('ascent.orders.autoBody'),
          border: isAutoHost(army) ? INK_UI.gold : INK_UI.softBrush,
          muted: isAutoHost(army),
          onTap: isAutoHost(army) ? undefined : () => command({ kind: 'auto' }),
        },
      ]);
      return height;
    });

    // Who fights this host's battles. The run-wide switch in Settings answers it for every host at
    // once, which is the wrong grain: a border garrison should be left to its general and the royal
    // host should not be.
    addWidget(0, (parent, width) => {
      const height = this.segmentedRow(parent, width, {
        label: t('ascent.battle.whoCommands'),
        options: [t('ascent.battle.commandMine'), t('ascent.battle.commandGeneral')],
        note: army.autoResolve ? t('ascent.battle.commandGeneralBody') : t('ascent.battle.commandMineBody'),
        selected: army.autoResolve ? 1 : 0,
        onPick: (index) => {
          army.autoResolve = index === 1;
          this.showArmyDetail(armyId);
        },
      });
      return height;
    });

    // Recall: out of the fight, off the siege, home. Confirmed, because it can abandon both.
    const siege = state.siegeOrders.find((order) => order.armyId === army.id);
    const engaged = Boolean(state.ascent?.activeBattle && !state.ascent.activeBattle.over
      && (state.ascent.activeBattle.ourArmyIds ?? []).includes(army.id));
    const recall = (): void => {
      const consequences = [
        siege ? t('ascent.orders.recallSiege', { land: state.lands.find((l) => l.id === siege.landId)?.name ?? '' }) : '',
        engaged ? t('ascent.orders.recallBattle', { land: state.ascent?.activeBattle?.landName ?? '' }) : '',
      ].filter(Boolean);
      this.showConfirmPage({
        title: t('ascent.orders.recall'),
        subtitle: army.name,
        lines: [t('ascent.orders.recallBody'), ...consequences],
        confirmLabel: t('ascent.orders.recall'),
        danger: consequences.length > 0,
        onConfirm: () => {
          this.events.emit('ui:ascent-army-recall', armyId);
          this.showArmyDetail(armyId);
        },
        onBack: () => this.showArmyDetail(armyId),
      });
    };

    // ── Reinforcement ──
    //
    // Everything that spends on the host: fresh men, better kit, more drill, full baggage — and,
    // at the end and apart from them, the two ways to take it off the board.
    addHeading(t('ascent.army.groupSupply'));
    const supply = resupplyPreview(state, armyId);
    const upgrades = getArmyUpgradeOptions(state, armyId).map((option) => ({
      title: t(`ascent.army.${option.kind}` as Parameters<typeof t>[0]),
      note: option.available
        ? `${
            option.kind === 'equip'
              ? t('ascent.army.equipBody', { tier: option.gain })
              : option.kind === 'reinforce'
                ? t('ascent.army.reinforceBody', { n: option.gain })
                : t('ascent.army.drillBody', { level: option.gain })
          }\n${formatResourceList(option.cost)}`
        : option.reason ?? '',
      border: option.available ? INK_UI.gold : INK_UI.softBrush,
      muted: !option.available,
      onTap: option.available
        ? () => {
            upgradeArmy(state, armyId, option.kind);
            this.showArmyDetail(armyId);
          }
        : undefined,
    }));
    addWidget(0, (parent, width) => {
      const height = this.actionTiles(parent, width, [
        ...upgrades,
        {
          title: t('ascent.orders.resupply'),
          note: supply.blocked ?? t('ascent.orders.resupplyBody', {
            r: Math.round(army.rations),
            wantR: supply.wantRations,
            p: Math.round(army.provisions),
            wantP: supply.wantProvisions,
            food: supply.food,
            supplies: supply.supplies,
          }),
          border: supply.blocked ? INK_UI.softBrush : INK_UI.jade,
          muted: Boolean(supply.blocked),
          onTap: supply.blocked
            ? undefined
            : () => {
                this.events.emit('ui:ascent-army-resupply', armyId);
                this.showArmyDetail(armyId);
              },
        },
        {
          title: t('ascent.orders.recall'),
          note: t('ascent.orders.recallBody'),
          border: INK_UI.gold,
          onTap: recall,
        },
        {
          title: t('ascent.army.disband'),
          note: t('ascent.army.disbandBody', { n: size, gold: shareGold, food: shareFood }),
          border: INK_UI.cinnabar,
          onTap: () => {
            this.closeLane();
            this.events.emit('ui:ascent-disband-army', armyId);
          },
        },
      ]);
      return height;
    });

    finish();
  }

  /** Who commands a standing host. */
  private showCommanderPicker(armyId: string): void {
    const state = this.state;
    const army = state.armies.find((candidate) => candidate.id === armyId);
    if (!army) return;
    const back = () => this.showArmyDetail(armyId);
    this.showHeroPicker({
      title: t('ascent.pick.title.commander', { army: army.name }),
      rows: buildHeroPickerRows(state, { kind: 'commander', armyId }),
      confirm: (row) => ({
        title: t('ascent.pick.confirmTitle', { hero: heroName(row.hero), role: t('ascent.pick.role.commander', { army: army.name }) }),
        lines: [row.effectLine],
      }),
      onPick: (heroId) => {
        this.events.emit('ui:ascent-assign', { heroId, optionId: `general:${armyId}` });
        back();
      },
      onBack: back,
    });
  }

  /** Owned provinces this host can march to, with how far and what is threatening each. */
  private showMarchTargets(armyId: string): void {
    const state = this.state;
    const army = state.armies.find((candidate) => candidate.id === armyId);
    if (!army) return;

    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);

    const { addRow, finish } = this.laneList(t('ascent.army.marchTo'), t('ascent.army.marchToBody'));

    const targets = state.lands
      .filter((land) => land.ownerId === PLAYER_KINGDOM_ID && land.id !== army.landId)
      .map((land) => ({ land, path: findLandPath(state, army.landId, land.id) }))
      .filter((entry): entry is { land: Land; path: string[] } => Boolean(entry.path))
      .sort((a, b) => a.path.length - b.path.length);

    for (const { land, path } of targets) {
      // "Under threat" means an enemy host is standing on it or next to it — the reason a player
      // would send a host somewhere rather than leave it where it is.
      const threatened = state.armies.some(
        (other) => other.kingdomId !== PLAYER_KINGDOM_ID
          && (other.landId === land.id || land.neighbors.includes(other.landId)),
      );
      addRow(
        {
          title: land.name,
          subtitle: t('ascent.army.marchRow', {
            legs: path.length,
            threat: threatened ? t('ascent.army.marchThreat') : '',
          }),
          border: threatened ? INK_UI.cinnabar : INK_UI.jade,
        },
        () => {
          this.events.emit('ui:ascent-army-orders', { armyId, orders: { kind: 'defend', landId: land.id } });
          this.closeLane();
        },
      );
    }

    finish();
  }

  /** Provinces on the border this host could be sent to storm, with the odds it would carry. */
  private showAttackTargets(armyId: string): void {
    const state = this.state;
    const army = state.armies.find((candidate) => candidate.id === armyId);
    if (!army) return;
    this.replaceLanePage(() => {
      const { addRow, finish } = this.laneList(t('ascent.orders.attackPick'), t('ascent.orders.targetHint'));
      const targets = buildAllConquestTargets(state)
        .map((target) => {
          const land = state.lands.find((candidate) => candidate.id === target.landId);
          const border = land?.neighbors.filter((id) => state.lands.find((l) => l.id === id)?.ownerId === PLAYER_KINGDOM_ID) ?? [];
          const legs = border.includes(army.landId)
            ? 1
            : Math.min(...border.map((id) => (findLandPath(state, army.landId, id)?.length ?? Number.POSITIVE_INFINITY) + 1));
          return { target, land, legs, pct: hostOddsAgainst(state, army, target.landId) };
        })
        .filter((entry) => entry.land && Number.isFinite(entry.legs))
        .sort((a, b) => b.pct - a.pct || a.legs - b.legs);
      for (const { target, legs, pct } of targets) {
        const thin = pct < MARCH_MIN_WIN_CHANCE;
        addRow(
          {
            title: `${target.landName}${thin ? `  ·  ${t('ascent.orders.attackAnyway')}` : ''}`,
            subtitle: t('ascent.orders.targetRow', { garrison: target.garrison, pct, legs }),
            border: thin ? INK_UI.softBrush : INK_UI.cinnabar,
          },
          () => {
            this.events.emit('ui:ascent-army-orders', {
              armyId,
              orders: { kind: 'attack', landId: target.landId, force: thin },
            });
            this.closeLane();
          },
        );
      }
      finish();
    });
  }

  /** Other hosts of ours this one could keep station with. */
  private showFollowTargets(armyId: string): void {
    const state = this.state;
    this.replaceLanePage(() => {
      const { addRow, finish } = this.laneList(t('ascent.orders.followPick'), t('ascent.orders.followHint'));
      const others = state.armies.filter(
        (candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID && !candidate.isLevy && candidate.id !== armyId,
      );
      for (const other of others) {
        const at = state.lands.find((candidate) => candidate.id === other.landId);
        const men = other.units.spearmen + other.units.archers + other.units.heavyInfantry;
        addRow(
          {
            title: other.name,
            subtitle: t('ascent.orders.followRow', { men, land: at?.name ?? '—', order: hostOrderLabel(state, other) }),
            border: INK_UI.jade,
          },
          () => {
            this.events.emit('ui:ascent-army-orders', { armyId, orders: { kind: 'follow', armyId: other.id } });
            this.closeLane();
          },
        );
      }
      finish();
    });
  }

  /** Enemy hosts in sight, and the order to go after one. */
  private showHuntTargets(armyId: string): void {
    const state = this.state;
    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);

    const { addRow, finish } = this.laneList(t('ascent.army.hunt'), t('ascent.army.huntBody', {
      n: visibleHostileHosts(state).length,
    }));

    for (const quarry of visibleHostileHosts(state)) {
      const at = state.lands.find((candidate) => candidate.id === quarry.landId);
      const size = quarry.units.spearmen + quarry.units.archers + quarry.units.heavyInfantry;
      addRow(
        {
          title: quarry.name,
          subtitle: t('ascent.army.huntRow', { size, land: at?.name ?? '—' }),
          border: INK_UI.cinnabar,
        },
        () => {
          this.events.emit('ui:ascent-army-orders', { armyId, orders: { kind: 'hunt', armyId: quarry.id } });
          this.closeLane();
        },
      );
    }

    finish();
  }

  /** The rival empires as they stand: power, opinion, pacts, and who has our ambassador. */
  private showAffairsScreen(): void {
    const state = this.state;
    const rivals = state.kingdoms.filter(
      (kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated,
    );
    const { addWidget, addHeading, addRow, finish } = this.laneList(t('action.affairs'), t('ascent.lane.worldBody'));

    // Four neighbours, each a name, a temperature and two figures — a grid. As full-width cards
    // they filled the screen and the player still had to scroll to see the fourth realm, which on
    // a page whose whole job is *comparing* them is the one thing it must not do.
    addWidget(0, (parent, width) => this.actionTiles(parent, width, rivals.map((kingdom) => {
      const relations = Math.round(kingdom.relations ?? 50);
      return {
        title: `${kingdom.name}  ·  ${relations}`,
        note: [
          t('ascent.world.power', { value: Math.round(getEmpirePower(state, kingdom)) }),
          t('ascent.world.appetite', { value: Math.round(kingdom.warAppetite ?? 0) }),
          hasPact(kingdom) ? t('ascent.world.pact') : undefined,
        isVassal(kingdom) ? t('ascent.vassal.badge') : undefined,
          kingdom.ambassadorHeroId ? t('ascent.world.ambassador') : undefined,
        ].filter(Boolean).join('  ·  '),
        // Green when content, red once cold enough to march.
        border: isVassal(kingdom) ? INK_UI.jade
          : relations >= 55 ? INK_UI.jade : relations >= 35 ? INK_UI.gold : INK_UI.cinnabar,
        onTap: () => {
          this.closeLane();
          this.events.emit('ui:ascent-envoy', kingdom.id);
        },
      };
    })));
    // The rival a story has taken an interest in, on the screen where rivals live.
    this.addStoryOpening('rival', undefined, addHeading, addRow);

    finish();
  }

  // ── Prompts ───────────────────────────────────────────────────────────────

  private showPowerDraft(prompt: Extract<AscentPrompt, { kind: 'power-draft' }>): void {
    // The two footer buttons are pinned below a scrolling card list, so a reroll stays reachable
    // however many cards the draft offers and however short the viewport is.
    const { content, body, bodyWidth, finish } = this.promptScrollBody(
      t('ascent.draft.title', { level: prompt.level }),
      t('ascent.draft.subtitle'),
      PROMPT_FOOTER_HEIGHT,
    );

    const cards: Phaser.GameObjects.Container[] = [];
    let used = 0;
    prompt.cards.forEach((cardId) => {
      const view = powerCardView(this.state, cardId);
      if (!view) return;
      // The evolution call-out outranks the power preview: completing a pair is the
      // headline reward, and a bare percentage would undersell it.
      const note = view.evolutionReady
        ? t('ascent.draft.evoReady')
        : view.powerGainPct > 0
          ? t('ascent.draft.powerPreview', { pct: view.powerGainPct })
          : undefined;

      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: 118 },
        {
          title: `${view.name}  ·  ${view.stackLabel}`,
          body: view.description,
          note,
          noteColor: view.evolutionReady ? '#8a5f1c' : undefined,
          badge: `${t(`ascent.rarity.${view.rarity}` as Parameters<typeof t>[0])}  ${view.stackCount}`,
          accent: view.evolutionReady ? INK_UI.gold : RARITY_COLOR[view.rarity],
          parent: body,
          onTap: () => this.choose(cardId),
        },
      );
      cards.push(card);
      used += ((card.getData('cardHeight') as number) ?? 118) + 12;
    });
    staggerIn(this, cards);
    finish(used);

    const footerY = GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8;
    const affordable = this.state.resources.gold >= prompt.rerollCost;
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: footerY, width: content.width / 2 - 6, height: 40 },
      affordable
        ? t('ascent.draft.reroll', { cost: prompt.rerollCost })
        : t('ascent.draft.rerollPoor', { cost: prompt.rerollCost }),
      () => this.events.emit('ui:ascent-reroll'),
      { variant: affordable ? 'secondary' : 'disabled', fontSize: '12px' },
    ));
    this.modalLayer.add(this.ui.button(
      { x: content.x + content.width / 2 + 6, y: footerY, width: content.width / 2 - 6, height: 40 },
      t('ascent.draft.skip', { xp: skipRefundAmount(this.state) }),
      () => this.choose('skip'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  /** One province row, shared by the Conquer prompt and the Conquer lane browser. */
  private provinceCard(
    bounds: UIBounds,
    target: ConquestTarget,
    onTap: () => void,
    parent?: Phaser.GameObjects.Container,
  ): Phaser.GameObjects.Container {
    const open = target.methods.filter((method) => !method.blockedReason);
    // The headline is *how many ways in there are*, not the odds: a bare win percentage hides
    // every peaceful path, and "best odds" reads 100% on almost every province because most
    // admit at least one method that cannot fail. What separates provinces at this level is
    // the garrison and the reward, both already on the card; the methods carry their own
    // numbers on the sheet behind it.
    const note = target.busyReason
      ? target.busyReason
      : open.length > 0
        ? t('ascent.conquer.ways', { n: open.length })
        : t('ascent.conquer.noWay');

    return this.optionCard(bounds, {
      title: target.landName,
      body: `${t(`ascent.conquer.kind.${target.landKind}` as Parameters<typeof t>[0], { owner: target.ownerName ?? '' })}  ·  ${t(`ascent.march.reward.${target.rewardTag}` as Parameters<typeof t>[0])}`,
      note: `${note}  ·  ${t('ascent.march.garrison', { value: target.garrison })}`,
      // Green means a road in that cannot fail; amber means every road is a gamble.
      accent: open.length === 0
        ? INK_UI.softBrush
        : target.hasCertainMethod ? INK_UI.jade : target.bestChance >= 45 ? INK_UI.gold : INK_UI.cinnabar,
      disabled: open.length === 0 && !target.busyReason,
      parent,
      onTap,
    });
  }

  private showConquerTarget(prompt: Extract<AscentPrompt, { kind: 'conquer-target' }>): void {
    // `frontLandId` is cleared the moment a province falls, so it cannot distinguish these
    // cases — keying off how much ground the realm holds does.
    const held = this.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
    const { content, body, bodyWidth, finish } = this.promptScrollBody(
      t('ascent.conquer.title'),
      held <= 1 ? t('ascent.conquer.subtitleFirst') : t('ascent.conquer.subtitle', { held }),
      PROMPT_FOOTER_HEIGHT,
    );

    const rowHeight = 92;
    const cards: Phaser.GameObjects.Container[] = [];
    prompt.targets.forEach((target, index) => {
      cards.push(this.provinceCard(
        { x: 0, y: index * (rowHeight + 10), width: bodyWidth, height: rowHeight },
        target,
        () => this.choose(target.landId),
        body,
      ));
    });
    staggerIn(this, cards);
    finish(prompt.targets.length * (rowHeight + 10));

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8, width: content.width, height: 40 },
      t('ascent.march.hold'),
      () => this.choose('hold'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  /**
   * The price tag on a method card, on one line: cost, duration, resulting loyalty, and the
   * odds. Kept to a single line deliberately — it sits in the card's fixed-height note slot,
   * and a second line would be clipped by the card edge.
   */
  private methodPriceTag(option: ConquestMethodOption): string {
    const parts: string[] = [
      option.cost && Object.keys(option.cost).length > 0
        ? formatResourceList(option.cost)
        : t('ascent.conquer.free'),
    ];
    if (option.ticks > 0) parts.push(t('ascent.conquer.ticks', { n: option.ticks }));
    parts.push(t('ascent.conquer.loyalty', { n: option.loyalty }));
    parts.push(option.chance >= 100 ? t('ascent.conquer.certain') : t('ascent.conquer.chance', { pct: option.chance }));
    return parts.join('  ·  ');
  }

  /**
   * Step two of a conquest: every way into this province, priced.
   *
   * Blocked methods stay on screen greyed with their concrete reason rather than being hidden.
   * Seeing that a bribe needs 74 gold when you hold 51 is how the player learns what the
   * treasury is *for* — a filtered list would just look like the game offering less.
   */
  private showConquerMethod(target: ConquestTarget, notice?: string): void {
    const { content, body, bodyWidth, finish } = this.promptScrollBody(
      target.landName,
      t('ascent.conquer.methodSubtitle', {
        kind: t(`ascent.conquer.kind.${target.landKind}` as Parameters<typeof t>[0], { owner: target.ownerName ?? '' }),
        garrison: target.garrison,
      }),
      PROMPT_FOOTER_HEIGHT,
    );

    const rowHeight = 82;
    const cards: Phaser.GameObjects.Container[] = [];
    let used = 0;

    // What the last attempt on this province came to, above the ways still open. Cinnabar and
    // sitting first, because it is news the player did not ask for and must not scroll past.
    if (notice) {
      const banner = this.ui.card(
        { x: 0, y: 0, width: bodyWidth, height: 54 },
        { title: t('ascent.conquer.refused'), subtitle: notice, border: INK_UI.cinnabar },
      );
      body.add(banner);
      used += ((banner.getData('cardHeight') as number) ?? 54) + 12;
    }

    target.methods.forEach((option) => {
      const blocked = Boolean(option.blockedReason);
      const actorLine = !blocked && methodHasActor(option.method) ? methodActorLine(this.state, option) : undefined;

      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: rowHeight },
        {
          icon: iconForOption(option.method),
          title: t(`ascent.method.${option.method}` as Parameters<typeof t>[0]),
          // Description in the wrapping body slot, numbers on the single-line note slot —
          // the reverse clipped the second line of every two-line description.
          body: `${t(`ascent.method.${option.method}.d` as Parameters<typeof t>[0])}${actorLine ? `\n${actorLine}` : ''}`,
          // How productive the province is on the day it changes hands. This is the axis the
          // six methods actually differ on, and until loyalty was given teeth it was invisible
          // *and* inert — so the sheet read as six prices for one outcome.
          badge: blocked ? undefined : t('ascent.conquer.settleBadge', {
            pct: Math.round((0.6 + 0.4 * (option.loyalty / 100)) * 100),
          }),
          note: option.blockedReason ?? this.methodPriceTag(option),
          noteColor: blocked ? '#6f6250' : undefined,
          accent: blocked ? INK_UI.softBrush : option.chance >= 60 ? INK_UI.jade : INK_UI.gold,
          disabled: blocked,
          parent: body,
          // A method with an actor opens the picker over the sheet: the player names the envoy or
          // the host, confirms, and the choice carries the actor's id. Bribe and settle commit nobody.
          onTap: () => (actorLine ? this.showMethodActorPicker(target, option, notice) : this.choose(option.method)),
        },
      );
      cards.push(card);
      used += ((card.getData('cardHeight') as number) ?? rowHeight) + 9;
    });
    staggerIn(this, cards);
    finish(used);

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8, width: content.width, height: 40 },
      t('ascent.conquer.back'),
      () => this.choose('back'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  /** Who carries a method out: an envoy for diplomacy, a host for the military methods. */
  private showMethodActorPicker(target: ConquestTarget, option: ConquestMethodOption, notice?: string): void {
    const state = this.state;
    const back = () => this.replaceLanePage(() => this.showConquerMethod(target, notice));
    const role = t(`ascent.pick.role.${option.method === 'diplomacy' ? 'envoy' : option.method}` as Parameters<typeof t>[0], { land: target.landName });
    if (option.method === 'diplomacy') {
      this.showHeroPicker({
        title: t('ascent.pick.title.envoy', { land: target.landName }),
        rows: buildHeroPickerRows(state, { kind: 'envoy', landId: target.landId }),
        confirm: (row) => ({
          title: t('ascent.pick.confirmTitle', { hero: heroName(row.hero), role }),
          lines: [row.effectLine, this.methodPriceTag(option)],
        }),
        onPick: (heroId) => this.choose(`${option.method}:${heroId}`),
        onBack: back,
      });
      return;
    }
    const kind = option.method === 'intimidation' ? 'intimidation' : option.method === 'occupy' ? 'occupy' : 'siege';
    this.showHostPicker({
      title: t('ascent.pick.title.host'),
      rows: buildHostPickerRows(state, { kind, landId: target.landId }),
      confirm: (row) => ({
        title: t('ascent.pick.confirmHost', { army: row.army.name, role }),
        lines: [
          row.chance !== undefined ? t('ascent.pick.hostOdds', { pct: row.chance }) : '',
          kind === 'intimidation' ? '' : t('ascent.pick.willAttack', { land: target.landName }),
        ],
      }),
      onPick: (armyId, force) => this.choose(`${option.method}:${armyId}${force ? ':force' : ''}`),
      onBack: back,
    });
  }

  /**
   * The champion card. One screen for both sources — the court's Favor draft and the wave
   * gacha — because the player should only ever learn one "a hero arrived" interaction.
   */
  private showHeroChoice(prompt: Extract<AscentPrompt, { kind: 'hero-choice' }>): void {
    // What the roster already costs, when it costs a lot: a champion is another wage, and the
    // card that offers one is where that is worth knowing.
    const gross = Math.max(1, this.state.ascentLedger?.gold.gross ?? 0);
    const payroll = heroPayroll(this.state);
    const payrollShare = Math.round((payroll / gross) * 100);
    const subtitle = prompt.pityUsed
      ? t('ascent.summon.pity')
      : prompt.source === 'court' ? t('ascent.summon.courtSubtitle') : t('ascent.summon.subtitle');
    const title = prompt.source === 'court' ? t('ascent.summon.courtTitle') : t('ascent.summon.title');

    const heroes = prompt.heroIds
      .map((heroId) => this.state.heroDeck.find((candidate) => candidate.id === heroId))
      .filter((hero): hero is Hero => Boolean(hero));
    if (heroes.length === 0) {
      this.promptFrame(title, subtitle);
      return;
    }

    this.heroDeckPrompt({
      title,
      subtitle: payrollShare > 55
        ? `${subtitle}\n${t('ascent.summon.payrollWarn', { pct: payrollShare })}`
        : subtitle,
      heroes,
      // First-time pulls are the collection payoff — say so on the card.
      badgeFor: (hero) => (isHeroUnlocked(hero.id) ? undefined : t('ascent.summon.newCodex')),
      // A champion nobody can afford is the trap this screen sets, so a card with no arrival to
      // announce prints its wage instead of leaving the foot of the paper blank.
      noteFor: (hero) => arrivalPreview(hero) ?? t('ascent.summon.upkeep', { gold: hero.upkeepGold }),
      confirmLabel: t('ascent.summon.recruit'),
      // The draw can be turned down whole — the one screen in the deck family that needs a way
      // out, since a champion nobody wants is still a wage every season.
      ignoreLabel: t('ascent.summon.pass'),
      onSelect: (hero) => this.choose(hero.id),
      onIgnore: () => this.choose('pass'),
    });
  }

  private heroStatLine(hero: Hero): string {
    const stats = hero.stats;
    return `⚔ ${stats.martial}   ⚙ ${stats.logistics}   ◈ ${stats.administration}`;
  }

  /**
   * Where a new champion serves.
   *
   * Every option prints the concrete bonus this hero's own stats produce there — `+23% army
   * power`, `+18% output` — so the choice is read off numbers rather than guessed from a job
   * title. That is the difference between a court and a list of nouns.
   */
  private showAppointment(prompt: Extract<AscentPrompt, { kind: 'court-appointment' }>): void {
    const hero = this.state.heroes.find((candidate) => candidate.id === prompt.heroId);
    const { body, bodyWidth, finish } = this.promptScrollBody(
      t('ascent.appoint.title', { hero: hero ? heroName(hero) : '' }),
      hero ? `${heroTypeLabel(hero.type)}  ·  ${this.heroStatLine(hero)}` : '',
      0,
    );

    const rowHeight = 74;
    const cards: Phaser.GameObjects.Container[] = [];
    let used = 0;
    prompt.options.forEach((option) => {
      const reserve = option.id === 'reserve';
      const dismiss = option.role === 'dismiss';
      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: rowHeight },
        {
          title: option.title,
          body: option.effect,
          note: option.detail,
          noteColor: option.detail && !reserve && !dismiss ? '#8a5f1c' : undefined,
          badge: t(`ascent.appoint.role.${option.role}` as Parameters<typeof t>[0]),
          accent: dismiss ? INK_UI.cinnabar : reserve ? INK_UI.softBrush : option.role === 'court' ? INK_UI.gold : INK_UI.jade,
          parent: body,
          // Letting a champion go is the one destructive choice on the card, so it asks once
          // more; every posting is reversible from the same card and goes straight through.
          onTap: dismiss && hero
            ? () => this.showConfirmPage({
                title: t('ascent.appoint.dismissConfirm', { hero: heroName(hero) }),
                subtitle: heroTitleLine(hero),
                portrait: hero,
                lines: [option.effect, option.detail ?? ''],
                confirmLabel: t('ascent.appoint.dismiss'),
                danger: true,
                onConfirm: () => this.choose('dismiss'),
                onBack: () => this.replaceLanePage(() => this.showAppointment(prompt)),
              })
            : () => this.choose(option.id),
        },
      );
      cards.push(card);
      used += ((card.getData('cardHeight') as number) ?? rowHeight) + 9;
    });
    staggerIn(this, cards);
    finish(used);
  }

  /**
   * The four instruments the world raises: sắc, dụ, hịch and lệ.
   *
   * One card for all four, because they are one prompt kind and therefore one slot in the
   * director's budget — see the note on `decree-offer`. What differs between them is the framing:
   * a hịch is a war proclamation and gets the cinnabar accent, a lệ is a village asking and gets
   * two answers rather than one, and every instrument may be declined.
   */
  private showDecreeOffer(prompt: Extract<AscentPrompt, { kind: 'decree-offer' }>): void {
    const instrument = prompt.instrument;
    const { body, bodyWidth, finish } = this.promptScrollBody(
      t(`decree.instrument.${instrument}.title` as Parameters<typeof t>[0]),
      prompt.targetName
        ? t(`decree.instrument.${instrument}.at` as Parameters<typeof t>[0], { target: prompt.targetName })
        : t(`decree.instrument.${instrument}.body` as Parameters<typeof t>[0]),
      0,
    );

    const accent = instrument === 'hich' ? INK_UI.cinnabar
      : instrument === 'du' ? INK_UI.gold
        : instrument === 'sac' ? INK_UI.jade : INK_UI.softBrush;

    const cards: Phaser.GameObjects.Container[] = [];
    let used = 0;
    const addCard = (opts: { title: string; bodyText: string; note?: string; badge?: string; onTap: () => void }) => {
      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: 76 },
        {
          title: opts.title,
          body: opts.bodyText,
          note: opts.note,
          badge: opts.badge,
          accent,
          parent: body,
          onTap: opts.onTap,
        },
      );
      cards.push(card);
      used += ((card.getData('cardHeight') as number) ?? 76) + 9;
    };

    for (const projectId of prompt.projectIds) {
      const project = getProject(projectId);
      if (!project) continue;
      const title = projectTitle(project);
      const description = projectDescription(project);

      if (instrument === 'le') {
        // A custom has two answers, not one: keep it to the village that asked (strong, free,
        // local) or write it into the realm's law (weaker, everywhere, and it costs weight).
        addCard({
          title: t('decree.le.grantTitle', { title }),
          bodyText: description,
          note: t('decree.le.grantNote', { land: prompt.targetName ?? '' }),
          badge: t('decree.le.badgeLocal'),
          onTap: () => this.choose(`le:${projectId}:local`),
        });
        addCard({
          title: t('decree.le.ratifyTitle', { title }),
          bodyText: projectEffectSummary(project) || description,
          note: t('decree.weight.cost', { n: `${project.weight}` }),
          badge: t('decree.le.badgeRealm'),
          onTap: () => this.choose(`le:${projectId}:realm`),
        });
        continue;
      }

      addCard({
        title,
        bodyText: description,
        note: (project.edictCost ?? 0) > 0
          ? t('ascent.law.pointCost', { n: project.edictCost ?? 0 })
          : t(`decree.instrument.${instrument}.free` as Parameters<typeof t>[0]),
        badge: t(`decree.instrument.${instrument}.badge` as Parameters<typeof t>[0]),
        onTap: () => this.choose(`decree:${projectId}`),
      });
    }

    // Always declinable. A card the player cannot say no to is not a decision, and refusing a
    // village its custom is the choice this whole instrument exists to make available.
    addCard({
      title: t(`decree.instrument.${instrument}.decline` as Parameters<typeof t>[0]),
      bodyText: t(`decree.instrument.${instrument}.declineBody` as Parameters<typeof t>[0]),
      onTap: () => this.choose('decline'),
    });

    staggerIn(this, cards);
    finish(used);
  }

  /**
   * A permanent law. Enacting one from an exclusive group locks its sibling out for the whole
   * run, so the card names what it kills — that fork is the main reason two runs diverge.
   */
  private showLawChoice(prompt: Extract<AscentPrompt, { kind: 'law-choice' }>): void {
    // The longest prompt in the mode: a variable list of laws *plus* the tax options *plus* a
    // footer. It overflowed on every viewport height, not just the short one.
    const { content, body, bodyWidth, finish } = this.promptScrollBody(
      t('ascent.law.title'),
      t('ascent.law.subtitle', {
        points: prompt.points,
        era: this.state.mandate ? eraLabel(this.state.mandate.era) : '—',
      }),
      PROMPT_FOOTER_HEIGHT,
    );

    const rowHeight = 80;
    const cards: Phaser.GameObjects.Container[] = [];
    let cursor = 0;

    prompt.projectIds.forEach((projectId) => {
      const view = lawCardView(this.state, projectId);
      if (!view) return;
      const card = this.optionCard(
        { x: 0, y: cursor, width: bodyWidth, height: rowHeight },
        {
          title: view.title,
          body: view.effect,
          note: view.locks,
          noteColor: '#8a5f1c',
          badge: view.cost,
          accent: INK_UI.gold,
          parent: body,
          onTap: () => this.choose(`edict:${projectId}`),
        },
      );
      cards.push(card);
      cursor += ((card.getData('cardHeight') as number) ?? rowHeight) + 9;
    });

    // The tax dial rides on the same card: it is the other permanent lever on the realm, and
    // giving it its own prompt would be one more modal for one more binary choice.
    prompt.taxOptions.forEach((policy) => {
      const card = this.optionCard(
        { x: 0, y: cursor, width: bodyWidth, height: 58 },
        {
          title: t('ascent.law.taxTitle', { policy: t(`ascent.tax.${policy}` as Parameters<typeof t>[0]) }),
          body: t(`ascent.tax.${policy}.d` as Parameters<typeof t>[0]),
          accent: INK_UI.softBrush,
          parent: body,
          onTap: () => this.choose(`tax:${policy}`),
        },
      );
      cards.push(card);
      cursor += ((card.getData('cardHeight') as number) ?? 58) + 9;
    });
    staggerIn(this, cards);
    finish(cursor);

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8, width: content.width, height: 40 },
      t('ascent.law.hold'),
      () => this.choose('hold'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  /**
   * What kind of realm this is going to be. Four times a run, at each era change.
   *
   * Deliberately built from the same `optionCard` rows as the law card rather than given a screen
   * of its own: this is the most consequential decision in the mode, and it must still read as one
   * more card in a stack the player already knows how to answer.
   */
  private showDoctrine(prompt: Extract<AscentPrompt, { kind: 'doctrine' }>): void {
    const { content, body, bodyWidth, finish } = this.promptScrollBody(
      t('ascent.doctrine.title'),
      t('ascent.doctrine.subtitle', { era: eraLabel(prompt.era) }),
      PROMPT_FOOTER_HEIGHT,
    );

    const standing = this.state.ascent?.doctrine;
    const cards: Phaser.GameObjects.Container[] = [];
    let cursor = 0;

    prompt.options.forEach((doctrine) => {
      const card = this.optionCard(
        { x: 0, y: cursor, width: bodyWidth, height: 74 },
        {
          title: doctrineName(doctrine),
          body: doctrineBlurb(doctrine),
          // The realm's current course is named on its own row rather than hidden, so switching
          // is visibly a change of direction and not just another pick.
          note: standing === doctrine ? t('ascent.doctrine.standing') : undefined,
          noteColor: '#1c6b58',
          accent: INK_UI.gold,
          parent: body,
          onTap: () => this.choose(doctrine),
        },
      );
      cards.push(card);
      cursor += ((card.getData('cardHeight') as number) ?? 74) + 9;
    });

    staggerIn(this, cards);
    finish(cursor);

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8, width: content.width, height: 40 },
      standing ? t('ascent.doctrine.keep') : t('ascent.doctrine.none'),
      () => this.choose('hold'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  /** The court speaks. Two choices, both real, drawn from the shared politics deck. */
  private showParliament(prompt: Extract<AscentPrompt, { kind: 'parliament' }>): void {
    const card = this.state.politicsDeck.find((candidate) => candidate.id === prompt.cardId);
    if (!card) {
      this.choose('');
      return;
    }

    const { content, body, bodyWidth, finish } = this.promptScrollBody(
      politicsTitle(card),
      politicsDescription(card),
      PROMPT_FOOTER_HEIGHT,
    );

    const rowHeight = 78;
    const cards: Phaser.GameObjects.Container[] = [];
    let used = 0;
    card.choices.forEach((choice) => {
      const cost = Object.entries(choice.effects.resourceDelta ?? {})
        .filter(([, value]) => (value ?? 0) < 0)
        .map(([key, value]) => [key, Math.abs(value ?? 0)] as const);
      const costBag = Object.fromEntries(cost);
      const affordable = cost.every(([key, value]) => (this.state.resources[key as keyof typeof this.state.resources] ?? 0) >= value);

      const option = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: rowHeight },
        {
          title: politicsChoiceLabel(choice),
          body: politicsChoiceDescription(choice),
          note: cost.length > 0 ? formatResourceList(costBag) : undefined,
          noteColor: affordable ? undefined : '#a4402c',
          accent: affordable ? INK_UI.jade : INK_UI.softBrush,
          disabled: !affordable,
          parent: body,
          onTap: () => this.choose(choice.id),
        },
      );
      cards.push(option);
      used += ((option.getData('cardHeight') as number) ?? rowHeight) + 10;
    });
    staggerIn(this, cards);
    finish(used);

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8, width: content.width, height: 40 },
      t('ascent.parliament.decline'),
      () => this.choose('decline'),
      { variant: 'ghost', fontSize: '12px' },
    ));
  }

  /** One rival empire, and everything the realm can do about it. */
  private showEnvoy(prompt: Extract<AscentPrompt, { kind: 'envoy' }>): void {
    const kingdom = this.state.kingdoms.find((candidate) => candidate.id === prompt.kingdomId);
    const { body, bodyWidth, finish } = this.promptScrollBody(
      t('ascent.envoy.title', { kingdom: prompt.kingdomName }),
      t('ascent.envoy.subtitle', { relations: prompt.relations, power: prompt.power }),
      0,
    );

    // Tall enough for a two-line body: the ambassador option names the hero, which wraps for
    // most names and overlapped the price line at a shorter height.
    const rowHeight = 84;
    const cards: Phaser.GameObjects.Container[] = [];
    let used = 0;
    prompt.options.forEach((option) => {
      const price = option.cost && Object.keys(option.cost).length > 0
        ? formatResourceList(option.cost)
        : option.influenceCost
          ? t('ascent.envoy.influence', { n: option.influenceCost })
          : t('ascent.conquer.free');

      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: rowHeight },
        {
          title: t(`ascent.envoy.${option.id}` as Parameters<typeof t>[0]),
          body: kingdom ? envoyOptionDetail(this.state, kingdom, option) : '',
          note: option.affordable ? price : t('ascent.response.cantAfford'),
          noteColor: option.affordable ? undefined : '#a4402c',
          accent: option.affordable ? (option.id === 'tribute' ? INK_UI.cinnabar : INK_UI.gold) : INK_UI.softBrush,
          disabled: !option.affordable,
          parent: body,
          onTap: () => this.choose(option.id),
        },
      );
      cards.push(card);
      used += ((card.getData('cardHeight') as number) ?? rowHeight) + 9;
    });
    staggerIn(this, cards);
    finish(used);
  }

  /**
   * A rival's demand. The half of foreign affairs the player does not start — and the one
   * place where refusing has to visibly cost something, or the card is flavour.
   */
  /**
   * The famine card.
   *
   * Every option spends a *different* store — coin, herds, the army's own baggage, or nothing
   * at all — so unlike the wave-response card these are genuinely different decisions rather
   * than four prices for the same outcome. Buying grain is deliberately the strong answer when
   * the treasury is deep: a realm that banked four hundred thousand gold with nothing to spend
   * it on was the other half of this same complaint.
   */
  private showFamine(prompt: Extract<AscentPrompt, { kind: 'famine' }>): void {
    const { body, bodyWidth, finish } = this.promptScrollBody(
      t('ascent.famine.title'),
      t('ascent.famine.body', { shortfall: Math.round(prompt.shortfall) }),
      0,
    );

    const rowHeight = 78;
    let used = 0;
    prompt.options.forEach((option) => {
      const label = t(`ascent.famine.${option.id}` as Parameters<typeof t>[0]);
      const detail = t(`ascent.famine.${option.id}D` as Parameters<typeof t>[0], {
        food: Math.round(option.food ?? 0),
      });

      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: rowHeight },
        {
          icon: iconForOption(option.id),
          title: label,
          body: detail,
          note: option.cost
            ? (option.affordable ? formatResourceList(option.cost) : t('ascent.response.cantAfford'))
            : undefined,
          noteColor: option.affordable ? undefined : '#a4402c',
          // Enduring is the red option: free today, and the hunger keeps taking.
          accent: !option.affordable
            ? INK_UI.softBrush
            : option.id === 'endure' || option.id === 'requisition'
              ? INK_UI.cinnabar
              : INK_UI.gold,
          disabled: !option.affordable,
          parent: body,
          onTap: () => { if (option.affordable) this.choose(option.id); },
        },
      );
      used += ((card.getData('cardHeight') as number) ?? rowHeight) + 10;
    });
    finish(used);
  }

  /**
   * One fragment of a running story, loud enough to stop the world.
   *
   * **There is no beat counter and no total**, and that absence is the whole design. The header
   * carries the story's name and nothing else, so the player cannot tell whether this is the
   * second thing this story has said or the ninth — and with no fraction to be part of, there is
   * nothing to complete. A quest has a completion state; a story does not.
   *
   * A `blow` has no options. It pauses and tells you, and the only control is an acknowledgement.
   * That is what keeps the Chronicle from reading as a menu: a story the player always answers is
   * a story they control, and control is the opposite of drama.
   */
  private showStoryBeat(prompt: Extract<AscentPrompt, { kind: 'story-beat' }>): void {
    const key = (suffix: string) => `${prompt.templateId}.${prompt.fragmentId}.${suffix}`;
    const { body, bodyWidth, finish } = this.promptScrollBody(
      storyText(key('title'), prompt.params),
      storyText(key('body'), prompt.params),
      0,
    );

    let used = 0;

    // The band: a generic woodblock impression chosen by tag, with the speaker's own portrait
    // beside it when a person is talking. No story owns an illustration — a template binds a
    // random hero and a random province, so a specific picture would be a lie on most maps.
    if (prompt.band) {
      const bandHeight = 62;
      const faceWidth = prompt.speakerHeroId ? bandHeight : 0;
      const holder = this.add.container(0, used);

      if (prompt.speakerHeroId) {
        const speaker = this.state.heroes.find((hero) => hero.id === prompt.speakerHeroId);
        if (speaker) {
          holder.add(renderHeroFaceInBox(this, speaker, { x: 0, y: 0, width: faceWidth, height: bandHeight }));
        }
      }

      const band = drawStoryBand(
        this,
        prompt.band,
        `${prompt.storyId}:${prompt.fragmentId}`,
        bodyWidth - faceWidth,
        bandHeight,
      );
      band.setPosition(faceWidth, 0);
      holder.add(band);

      const frame = this.add.graphics();
      frame.lineStyle(1.2, INK_UI.brush, 0.5);
      frame.strokeRect(0, 0, bodyWidth, bandHeight);
      if (faceWidth > 0) frame.lineBetween(faceWidth, 0, faceWidth, bandHeight);
      holder.add(frame);

      body.add(holder);
      used += bandHeight + 12;
    }

    if (prompt.options.length === 0) {
      // A blow. One way out, and it is not a choice.
      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: 52 },
        {
          title: storyText(key('ok'), prompt.params),
          body: '',
          accent: INK_UI.cinnabar,
          parent: body,
          onTap: () => this.choose('ok'),
        },
      );
      used += ((card.getData('cardHeight') as number) ?? 52) + 10;
    }

    for (const option of prompt.options) {
      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: 68 },
        {
          icon: iconForOption(option.id),
          title: storyText(key(option.id), prompt.params),
          body: storyText(key(`${option.id}.d`), prompt.params),
          note: option.cost
            ? (option.affordable ? formatResourceList(option.cost) : t('ascent.response.cantAfford'))
            : (!option.affordable && option.blockedKey
              ? storyText(key(option.blockedKey), prompt.params)
              : undefined),
          noteColor: option.affordable ? undefined : '#a4402c',
          accent: option.affordable ? INK_UI.gold : INK_UI.softBrush,
          disabled: !option.affordable,
          parent: body,
          onTap: () => { if (option.affordable) this.choose(option.id); },
        },
      );
      used += ((card.getData('cardHeight') as number) ?? 68) + 10;
    }

    // The advisor. Whoever holds the relevant seat, and **not** a neutral narrator: a hero with
    // low loyalty or high renown gives advice that serves themselves, and nothing marks it.
    if (prompt.advisorKey && prompt.advisorHeroId) {
      const advisor = this.state.heroes.find((hero) => hero.id === prompt.advisorHeroId);
      const line = storyText(prompt.advisorKey, prompt.params);
      if (advisor && line !== prompt.advisorKey) {
        const quote = this.add.text(2, used + 4, `${heroName(advisor)} — "${line}"`, {
          color: INK_UI_HEX.mutedText,
          fontFamily: UI_FONT,
          fontSize: '11px',
          fontStyle: 'italic',
          wordWrap: { width: bodyWidth - 8 },
        });
        body.add(quote);
        used += quote.height + 14;
      }
    }

    finish(used);
  }

  /**
   * Sử Ký — what has already happened, in past tense.
   *
   * Takes the slot the Codex vacated, which is the right home for it: the Codex was a permanent
   * cross-run collection with nothing to be done about it mid-run, and this is the one screen a
   * player actually wants to open while playing.
   *
   * **No progress, no pips, no counts.** A running story shows its most recent line and the
   * subjects it has marked — that it is being spoken of, and what was last said. Never how far
   * along it is, because it is not along anything.
   */
  /**
   * Sử Ký, sorted by whose turn it is.
   *
   * Every story is always in exactly one of three states, and the screen says which without
   * being asked: CẦN NGƯƠI — an offer is open and there is something the player could do;
   * ĐANG CHỜ — it is waiting on the world, and says what it is watching for; ĐÃ CHÉP — over.
   * The shipped version showed none of these, which is why every row looked equally inert
   * and two of three rows read "nobody has said anything yet."
   *
   * Two rules from that failure: a story that has said nothing is *invisible* — a listed
   * promise the screen cannot keep is worse than absence — and rows are people, not titles:
   * name, want, and the most recent line, so a scan of the list is a scan of situations.
   */
  /**
   * The Reckoning: what the fight cost, what it bought, and who else was fighting.
   *
   * Every figure here was already being written down and then discarded. `battleHistory` carries
   * the butcher's bill, `grantRepelSpoils` and `XP_PER_BATTLE_WON` carry what it paid for, and
   * `levyFought` carries whether the province turned its own people out — and the screen closed on
   * one line of message strip, so the most consequential thing in the mode ended by vanishing.
   *
   * The dispatch below it is the other half of making delegation legitimate. A run-wide switch
   * that hands two thirds of the war to the generals is a way of playing; the same switch when it
   * makes those fights silent is a way of turning the game off.
   */
  private showAftermathScreen(): void {
    const pending = this.state.ascent?.pendingAftermath;
    if (!pending) return;
    const { record, alsoFought } = pending;
    const ourLost = Math.max(0, record.ourStart - record.ourEnd);
    const theirLost = Math.max(0, record.theirStart - record.theirEnd);
    const held = record.outcome === 'they-rout'
      || (record.outcome === 'spent' && record.ourEnd / Math.max(1, record.ourStart) >= record.theirEnd / Math.max(1, record.theirStart));

    // **Which side of the wall we were on.**
    //
    // Every line of this screen was written from the defender's chair, and the record has carried
    // `role` all along. A siege the player ordered and lost therefore reported "The ground is held"
    // and "{land} stays ours" over a jade border - the defender's good news, printed as the result
    // of the player's own failed assault. Read literally it was even true, which is what made it so
    // misleading: the province did hold, against us.
    const offence = record.role === 'offence';
    const titleKey = record.outcome === 'they-rout' ? 'broke'
      : record.outcome === 'we-rout' ? 'broken'
        : record.outcome === 'retreat' ? 'withdrew'
          : held ? (offence ? 'stormed' : 'held') : (offence ? 'repulsed' : 'lost');

    const { addRow, addHeading, addNote, addWidget, finish } = this.laneList(
      t(`ascent.aftermath.title.${titleKey}` as Parameters<typeof t>[0]),
      t('ascent.aftermath.subtitle', { land: record.landName, rounds: record.rounds }),
      { footer: { label: t('ascent.aftermath.continue'), onTap: () => this.dismissAftermath() } },
    );

    // The bill, as two bars against the same scale — the only honest way to show a trade.
    const worst = Math.max(1, record.ourStart, record.theirStart);
    addWidget(64, (parent, width) => {
      const bar = (y: number, label: string, lost: number, of: number, colour: number): void => {
        parent.add(this.ui.label(0, y, label, 'caption', {}));
        parent.add(this.ui.label(width, y, t('ascent.aftermath.fell', { n: lost, of }), 'caption',
          { align: 'right' }).setOrigin(1, 0));
        parent.add(this.ui.statBar({ x: 0, y: y + 16, width, height: 7 }, lost, worst, colour));
      };
      bar(0, t('ascent.aftermath.ourDead'), ourLost, record.ourStart, INK_UI.cinnabar);
      bar(32, t('ascent.aftermath.theirDead'), theirLost, record.theirStart, INK_UI.softBrush);
    });

    // Who held the field. A delegated fight names its commander, because an appointment the
    // player made is the reason the fight went the way it did.
    if (record.delegated) {
      addRow({
        title: record.generalName
          ? t('ascent.aftermath.generalFought', { name: record.generalName })
          : t('ascent.aftermath.officersFought'),
        subtitle: t('ascent.aftermath.generalNote'),
        border: INK_UI.gold,
      });
    }

    // Historically literal under ngụ binh ư nông: the levy is farmers, and they go home to the
    // fields rather than back to a wall they never lived on.
    if (record.levyFought) addNote(t('ascent.aftermath.levyHome', { land: record.landName }));

    addRow({
      title: t((offence
        ? (held ? 'ascent.aftermath.tookTitle' : 'ascent.aftermath.failedTitle')
        : (held ? 'ascent.aftermath.keptTitle' : 'ascent.aftermath.lostTitle')) as Parameters<typeof t>[0],
      { land: record.landName }),
      subtitle: t('ascent.aftermath.keptNote', {
        ours: record.ourEnd, theirs: record.theirEnd, hosts: record.theirHosts,
      }),
      border: held ? INK_UI.jade : INK_UI.cinnabar,
    });

    // One line of chronicle, in the voice the annals use: when, where, against whom, and what it
    // cost. This is the sentence a player will remember a fight by long after the numbers above it
    // have gone — and it is the same sentence the Đông Hồ prints of Hai Bà Trưng and Quang Trung
    // are captioned with, which is the register this whole mode is written in.
    const chronicleKey = offence
      ? (held ? 'took' : 'repulsed')
      : (held ? 'won' : 'lost');
    addNote(t(`ascent.aftermath.chronicle.${chronicleKey}` as Parameters<typeof t>[0], {
      year: record.year ?? this.state.year,
      land: record.landName,
      kingdom: record.kingdomName ?? t('ascent.aftermath.theEnemy'),
      dead: ourLost,
      leader: record.generalName ?? t('ascent.aftermath.theHost'),
    }), held ? INK_UI.jade : INK_UI.cinnabar);

    if (alsoFought.length > 0) {
      addHeading(t('ascent.aftermath.elsewhere'), t('ascent.aftermath.elsewhereHint'));
      for (const other of alsoFought) {
        const theirs = other.outcome === 'they-rout' || other.outcome === 'spent';
        // Same correction, one level down: a general sent to take a province reports whether he
        // carried it, not whether he held it.
        const dispatchKey = other.role === 'offence'
          ? (theirs ? 'took' : 'repulsed')
          : (theirs ? 'won' : 'lost');
        addRow({
          title: other.landName,
          subtitle: t(`ascent.aftermath.dispatch.${dispatchKey}` as Parameters<typeof t>[0], {
            name: other.generalName ?? t('ascent.aftermath.officers'),
            ours: Math.max(0, other.ourStart - other.ourEnd),
            theirs: Math.max(0, other.theirStart - other.theirEnd),
          }),
          border: theirs ? INK_UI.softBrush : INK_UI.cinnabar,
          muted: true,
        });
      }
    }

    finish();
  }

  /** Puts the Reckoning on the screen and holds the world behind it. */
  private openAftermath(): void {
    this.lanePauseBeforeOpen = this.state.isStrategyPause;
    this.state.isStrategyPause = true;
    this.beginOverlay('lane:aftermath');
    this.showAftermathScreen();
    // A lane that renders nothing has stranded the player: the bar and the map controls are torn
    // down before the screen is built, so an empty modal layer means no UI and no way back.
    if (this.modalLayer.length === 0) this.dismissAftermath();
  }

  private dismissAftermath(): void {
    if (this.state.ascent) this.state.ascent.pendingAftermath = undefined;
    this.state.isStrategyPause = this.lanePauseBeforeOpen;
    this.closeOverlay();
  }

  private showChronicleScreen(): void {
    const state = this.state;
    // A latent story does not exist yet as far as the player is concerned — unless it is
    // holding an open door. An opening is deliberately not "spoken" (an offer is not a line),
    // so filtering on spoken alone hid exactly the stories whose *first* move is the offer:
    // the button glowed red over a list that did not contain the reason.
    const running = (state.stories ?? []).filter((story) => story.spoken.length > 0 || storyNeedsPlayer(story));
    const recorded = [...(state.chronicle ?? [])].reverse();

    const need = running.filter((story) => storyWantsPlayer(state, story));
    const waiting = running
      .filter((story) => !storyWantsPlayer(state, story))
      .sort((a, b) => b.lastSpokeTurn - a.lastSpokeTurn);

    const { addRow, addHeading, addNote, addWidget, finish } = this.laneList(
      t('ascent.chronicle.title'),
      need.length > 0
        ? t('ascent.chronicle.needCount', { n: need.length })
        : t('ascent.chronicle.body', { year: state.year }),
      {
        // At the foot, where the thumb already is. This page is read one-handed, and this is the
        // only control on it that is a setting rather than a story.
        footerToggle: {
          label: t('ascent.chronicle.muteLabel'),
          hint: t(storyCardsMuted(state)
            ? 'ascent.chronicle.mutedHint'
            : 'ascent.chronicle.interruptHint'),
          checked: storyCardsMuted(state),
          onToggle: () => {
            if (state.ascent) state.ascent.storyCardsMuted = !storyCardsMuted(state);
            this.showChronicleScreen();
          },
        },
      },
    );

    if (running.length === 0 && recorded.length === 0) {
      addRow({
        title: t('ascent.chronicle.emptyTitle'),
        subtitle: t('ascent.chronicle.emptyBody'),
        border: INK_UI.softBrush,
        muted: true,
      });
      finish();
      return;
    }

    // ── Oaths still outstanding ──
    //
    // `chargeTrackerLines` was written for exactly this and had no caller anywhere, so a player
    // could swear an oath on a card and never see it again — which is most of the reason no charge
    // resolved in six measured runs. Phrased as the undertaking rather than as a task, because the
    // moment this reads as a quest log it has become the thing the Chronicle exists to avoid.
    {
      const charges = chargeTrackerLines(state);
      if (charges.length > 0) {
        addHeading(t('ascent.chronicle.sworn'));
        for (const charge of charges) {
          addRow({
            title: charge.text,
            subtitle: charge.seasonsLeft === undefined
              ? ''
              : t('ascent.chronicle.swornSeasons', { n: charge.seasonsLeft }),
            border: INK_UI.gold,
          });
        }
      }
    }





    /** One story as one person: name · want, then the latest line, then the state. */
    const storyRow = (story: ActiveStory, needsYou: boolean) => {
      const params = storyParams(state, story);
      const lastId = story.spoken[story.spoken.length - 1];
      // A story surfaced by its opening alone has said nothing yet — there is no last line.
      const line = lastId ? storyText(`${story.templateId}.${lastId}.chronicle`, params) : undefined;
      const hero = state.heroes.find((candidate) => candidate.id === story.cast.heroId);
      const want = storyText(`${story.templateId}.want`, params);
      const wantLine = want !== `${story.templateId}.want`
        ? t('ascent.story.wants', { want })
        : undefined;
      // Two different kinds of "needs you", and the row says which: a door standing open on a
      // subject, or a beat the story is holding because beats have been muted.
      const status = heldBeat(state, story)
        ? t('ascent.story.needsAnswer')
        : needsYou
          ? t('ascent.story.doorsOpen')
          : storyText(`${story.templateId}.waiting`, params);

      addRow(
        {
          title: hero ? `${storyTitle(story.templateId)} · ${heroName(hero)}` : storyTitle(story.templateId),
          subtitle: [wantLine, line, status].filter(Boolean).join('\n'),
          border: needsYou ? INK_UI.cinnabar : INK_UI.jade,
        },
        () => this.showStoryPage(story.id),
      );
    };

    if (need.length > 0) {
      addHeading(t('ascent.chronicle.need'));
      for (const story of need) storyRow(story, true);
    }

    if (waiting.length > 0) {
      addHeading(t('ascent.chronicle.waitingHdr'));
      for (const story of waiting) storyRow(story, false);
    }

    if (recorded.length > 0) {
      // Counted by class, because that one line is the reign's identity: a dynasty that mostly
      // followed the record reads differently from one that mostly did not.
      const tally = chronicleTally(state);
      addHeading(`${t('ascent.chronicle.recorded')}  ·  ${t('ascent.chronicle.tally', tally)}`);
      for (const entry of recorded) {
        // A story with no source class shows none. Only templates that have actually been
        // placed against the record carry a tag; the rest keep the old tone colouring and say
        // nothing they cannot back up.
        const cls = entry.historicity;
        addRow({
          title: cls
            ? storyTitle(entry.templateId) + '  ·  ' + t(('ascent.story.tag.' + cls) as Parameters<typeof t>[0])
            : storyTitle(entry.templateId),
          subtitle: storyText(entry.templateId + '.' + entry.fragmentId + '.chronicle', entry.params),
          border: cls === 'chinh-su' ? INK_UI.jade
            : cls === 'da-su' ? INK_UI.gold
              : cls === 'ngoai-truyen' ? INK_UI.cinnabar
                : entry.tone === 'threat' ? INK_UI.cinnabar
                  : entry.tone === 'reward' ? INK_UI.jade : INK_UI.softBrush,
          muted: true,
        });
      }
    }

    finish();
  }

  /**
   * One story, as the player lives it: the person, everything that has happened in order,
   * what hangs on it, and the doors that stand open.
   *
   * This screen renders data the game already stores and used to throw away — the fix for
   * "cannot see detail of story" is mostly `story.history`, finally drawn. Three deliberate
   * absences: no beat counter, no progress, no reward preview. The season markers are memory
   * aids ("when"), never fractions ("how far").
   */
  private showStoryPage(storyId: string): void {
    const state = this.state;
    const story = (state.stories ?? []).find((candidate) => candidate.id === storyId);
    if (!story) {
      this.showChronicleScreen();
      return;
    }

    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);

    const params = storyParams(state, story);
    const hero = state.heroes.find((candidate) => candidate.id === story.cast.heroId);
    const want = storyText(`${story.templateId}.want`, params);
    const { body, bodyWidth, finish } = this.promptScrollBody(
      storyTitle(story.templateId),
      want !== `${story.templateId}.want` ? t('ascent.story.wants', { want }) : '',
      LANE_FOOTER_HEIGHT,
    );

    let used = 0;

    // The person, face first. A story with nobody in it skips straight to the record.
    if (hero) {
      const faceSize = 56;
      const holder = this.add.container(0, used);
      holder.add(renderHeroFaceInBox(this, hero, { x: 0, y: 0, width: faceSize, height: faceSize }));
      const frame = this.add.graphics();
      frame.lineStyle(1.2, INK_UI.brush, 0.5);
      frame.strokeRect(0, 0, faceSize, faceSize);
      holder.add(frame);
      holder.add(this.ui.label(faceSize + 12, 6, heroName(hero), 'label', { fontSize: '15px' }));
      const regard = storyRegard(state, story);
      const regardText = regard ? storyText(`${story.templateId}.regard.${regard}`, params) : undefined;
      if (regardText && regardText !== `${story.templateId}.regard.${regard}`) {
        holder.add(this.ui.label(faceSize + 12, 30, regardText, 'body', {
          fontSize: '11px',
          color: INK_UI_HEX.mutedText,
          fontStyle: 'italic',
          wordWrap: { width: bodyWidth - faceSize - 16 },
        }));
      }
      body.add(holder);
      used += faceSize + 14;
    }

    // ── Đã xảy ra: the case this story has been building, in order, dated ──
    const heading = (label: string) => {
      const text = this.add.text(2, used, label.toLocaleUpperCase(), {
        color: INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '10px',
        fontStyle: '700',
      });
      text.setLetterSpacing?.(1.6);
      body.add(text);
      used += 18;
    };

    // ── The spine: which way this went, and where it left the record ──
    //
    // The decision tree made visible, and the only screen that teaches the player the feature
    // exists. `history` answers what was said; this answers which way it went, and they are not
    // the same question. A template with no trunk returns an empty path and the section is
    // simply omitted.
    const spine = storyPath(state, story);
    if (spine.length > 0) {
      const chipFor = (h: Historicity) =>
        (h === 'chinh-su' ? INK_UI.jade : h === 'da-su' ? INK_UI.gold : INK_UI.cinnabar);

      // The class of the whole path, stated once at the top in words.
      const drift = storyDrift(story);
      const chip = this.ui.card(
        { x: 0, y: used, width: bodyWidth, height: 38 },
        {
          title: '',
          subtitle: t(`ascent.story.class.${drift}` as Parameters<typeof t>[0]),
          border: chipFor(drift),
        },
      );
      body.add(chip);
      used += ((chip.getData('cardHeight') as number) ?? 38) + 8;

      heading(t('ascent.story.path'));
      for (const step of spine) {
        const label = storyText(`${story.templateId}.node.${step.nodeId}`, params);
        const rail = this.add.graphics();
        rail.fillStyle(chipFor(step.historicity), step.current ? 1 : 0.55);
        rail.fillRect(2, used + 4, 3, 14);
        body.add(rail);
        const text = this.ui.label(
          14, used,
          label !== `${story.templateId}.node.${step.nodeId}` ? label : step.nodeId,
          'body',
          {
            fontSize: '11px',
            wordWrap: { width: bodyWidth - 90 },
            ...(step.current ? { fontStyle: '700' } : { color: INK_UI_HEX.mutedText }),
          },
        );
        body.add(text);
        // The step where the realm first left the record is the one worth marking. Every step
        // after it is merely still away.
        if (step.diverged) {
          body.add(this.ui.label(bodyWidth, used, t('ascent.story.leftHere'), 'caption', {
            fontSize: '9px',
            color: `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}`,
          }).setOrigin(1, 0));
        }
        used += Math.max(20, text.height + 6);
      }
      used += 8;
    }


    heading(t('ascent.story.happened'));
    const beats = storySpokenHistory(state, story);
    beats.forEach((beat, index) => {
      // The scene if the story has one, the annal line if it does not.
      //
      // These two keys are doing different jobs and this list wants the first. `chronicle` is
      // the one-line entry a dynastic record would hold - deliberately flat, seven words, no
      // room in it - and a page built from those reads as a stack of bulletins rather than as
      // the story the player actually lived. `scene` is the room it happened in.
      const stem = story.templateId + '.' + beat.fragmentId;
      const scene = storyText(stem + '.scene', params);
      const line = scene !== stem + '.scene'
        ? scene
        : storyText(stem + '.chronicle', params);
      const isLatest = index === beats.length - 1;
      const marker = beat.turn !== undefined ? t('ascent.story.season', { n: beat.turn }) : '·';
      const markerText = this.add.text(2, used, marker, {
        color: INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '10px',
      });
      body.add(markerText);
      // Built without `undefined` values: `InkUI.label` spreads overrides over the variant
      // style, so an explicit `color: undefined` erases the ink and Phaser falls back to
      // white — invisible on parchment. The latest beat was rendering as a blank line.
      const beatText = this.ui.label(40, used, line, 'body', {
        fontSize: isLatest ? '12px' : '11px',
        wordWrap: { width: bodyWidth - 44 },
        ...(isLatest ? { fontStyle: '700' } : { color: INK_UI_HEX.mutedText }),
      });
      body.add(beatText);
      used += Math.max(18, beatText.height + 7);
    });
    used += 8;

    // ── Đang treo: the stake, named. Only when the template declares one. ──
    const stake = storyText(`${story.templateId}.stake`, params);
    if (stake !== `${story.templateId}.stake`) {
      heading(t('ascent.story.stake'));
      const card = this.ui.card(
        { x: 0, y: used, width: bodyWidth, height: 46 },
        { title: '', subtitle: stake, border: INK_UI.gold },
      );
      body.add(card);
      used += ((card.getData('cardHeight') as number) ?? 46) + 10;
    }

    // ── The beat it is holding, when beats have been muted ──
    //
    // With `storyCardsMuted` the director never raises this as a card, so the story stands here
    // holding it and this is the only place it can be answered. Drawn exactly like the prompt
    // would have been — same options, same prices, same closed-when-unaffordable — because a beat
    // answered here must not behave differently from the same beat answered mid-run.
    const held = heldBeat(state, story);
    if (held) {
      heading(t('ascent.story.heldBeat'));
      const key = (suffix: string) => `${story.templateId}.${held.fragment.id}.${suffix}`;
      const intro = this.ui.card(
        { x: 0, y: used, width: bodyWidth, height: 60 },
        {
          title: storyText(key('title'), held.params),
          subtitle: storyText(key('body'), held.params),
          border: INK_UI.cinnabar,
        },
      );
      body.add(intro);
      used += ((intro.getData('cardHeight') as number) ?? 60) + 8;

      const options = heldBeatOptions(state, story, held.fragment);
      if (options.length === 0) {
        // A blow. There is nothing to choose; acknowledging it is the whole interaction.
        const ack = this.optionCard(
          { x: 0, y: used, width: bodyWidth, height: 52 },
          {
            title: storyText(key('ok'), held.params),
            body: '',
            accent: INK_UI.cinnabar,
            parent: body,
            onTap: () => {
              resolveStoryBeat(state, story.id, held.fragment.id, 'ok');
              this.showStoryPage(storyId);
            },
          },
        );
        used += ((ack.getData('cardHeight') as number) ?? 52) + 8;
      } else {
        for (const option of options) {
          const card = this.optionCard(
            { x: 0, y: used, width: bodyWidth, height: 64 },
            {
              title: storyText(key(option.id), held.params),
              body: storyText(key(`${option.id}.d`), held.params),
              note: option.cost ? formatResourceList(option.cost) : undefined,
              noteColor: option.affordable ? undefined : `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}`,
              accent: INK_UI.cinnabar,
              disabled: !option.affordable,
              parent: body,
              onTap: () => {
                if (resolveStoryBeat(state, story.id, held.fragment.id, option.id)) {
                  this.showStoryPage(storyId);
                }
              },
            },
          );
          used += ((card.getData('cardHeight') as number) ?? 64) + 8;
        }
      }
      used += 4;
    }


    // ── Có thể làm / Đang chờ: exactly one of the two, never neither ──
    const opening = storyOpening(state, story);
    if (opening) {
      heading(t('ascent.story.doors'));
      // The door prints its price and greys out when the treasury cannot cover it. It used to
      // draw live and gold regardless, and an unaffordable press died inside `takeOpening`
      // with no feedback at all — the page read as broken, not as expensive.
      const view = openingView(state, opening);
      const door = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: 64 },
        {
          title: storyText(opening.actionKey, opening.params),
          body: storyText(opening.textKey, opening.params),
          note: view.cost ? formatResourceList(view.cost) : undefined,
          noteColor: view.affordable ? undefined : `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}`,
          accent: INK_UI.gold,
          disabled: !view.affordable,
          parent: body,
          onTap: () => {
            if (takeOpening(state, opening.storyId, opening.fragmentId)) this.showStoryPage(storyId);
          },
        },
      );
      used += ((door.getData('cardHeight') as number) ?? 64) + 8;

      // Refusal is a real option and is listed as one — with no button, because the way to
      // take it is to close the page and keep playing. The hint says exactly that.
      const noThing = this.ui.card(
        { x: 0, y: used, width: bodyWidth, height: 44 },
        {
          title: t('ascent.story.doNothing'),
          subtitle: t('ascent.story.doNothingHint'),
          border: INK_UI.softBrush,
          muted: true,
        },
      );
      body.add(noThing);
      used += ((noThing.getData('cardHeight') as number) ?? 44) + 10;
    } else if (!held) {
      // Only when the story is not already showing something to answer. Printing "waiting on the
      // ransom price" directly under the card that sets the ransom price is the page arguing with
      // itself.
      heading(t('ascent.story.waitingFor'));
      const watching = storyText(`${story.templateId}.waiting`, params);
      const card = this.ui.card(
        { x: 0, y: used, width: bodyWidth, height: 44 },
        {
          title: '',
          subtitle: watching !== `${story.templateId}.waiting` ? watching : t('ascent.story.waitingDefault'),
          border: INK_UI.softBrush,
          muted: true,
        },
      );
      body.add(card);
      used += ((card.getData('cardHeight') as number) ?? 44) + 10;
    }

    finish(used);

    // Back to the list, in the lane's standard footer slot.
    this.modalLayer.add(this.ui.button(
      {
        x: 20,
        y: GAME_HEIGHT - LANE_CLOSE_BUTTON_OFFSET,
        width: GAME_WIDTH - 40,
        height: LANE_CLOSE_BUTTON_HEIGHT,
      },
      t('ascent.story.back'),
      () => this.showChronicleScreen(),
      { variant: 'primary', fontSize: '13px' },
    ));
  }

  /**
   * Sổ Thu Chi — the realm's books: gross, demand and net for every resource, then the
   * provinces currently going without.
   *
   * This screen is what turns demand from a tax into a game. The header has only ever shown
   * one net figure per resource, so a player had no way to learn *why* it moved — and a
   * pressure the player cannot read is a pressure they cannot manage. Reached by tapping the
   * resource strip: the place a player already looks when they want to know about resources.
   */
  private showLedgerScreen(): void {
    const state = this.state;
    const ledger = state.ascentLedger;
    const { addRow, addHeading, addWidget, finish } = this.laneList(
      t('ascent.ledger.title'),
      t('ascent.ledger.body', {
        lands: state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length,
        people: compactNumber(Math.round(state.resources.humans)),
      }),
    );

    if (!ledger) {
      addRow({ title: t('ascent.ledger.notYet'), subtitle: '', border: INK_UI.softBrush, muted: true });
      finish();
      return;
    }

    // The three flows, side by side rather than three headings each carrying one card.
    //
    // They are the same shape and they are read against each other — which is a comparison, and a
    // comparison belongs on one line. A heading per resource made each of them look like a section
    // of its own, and the page opened with three quarters of its height spent saying three numbers.
    // Signs are formatted here, not in the template: gross can itself go negative (three
    // withholding provinces can outweigh the paying ones), and a hardcoded '+' printed the
    // nonsense "In +-8".
    const flow = (key: 'food' | 'supplies' | 'gold', line: AscentLedgerLine) => {
      const gross = Math.round(line.gross);
      const demand = Math.round(line.demand);
      const net = Math.round(line.net);
      return {
        // `resourceLabel` is written for mid-sentence use and comes back lowercase; at the head of
        // a tile it is a name.
        title: `${resourceLabel(key).charAt(0).toLocaleUpperCase()}${resourceLabel(key).slice(1)}  ${net >= 0 ? `+${net}` : net}`,
        note: t('ascent.ledger.line', {
          gross: gross >= 0 ? `+${gross}` : `${gross}`,
          demand: `−${Math.abs(demand)}`,
        }),
        border: net >= 0 ? INK_UI.jade : INK_UI.cinnabar,
      };
    };
    addWidget(0, (parent, width) => this.actionTiles(parent, width, [
      flow('food', ledger.food),
      flow('supplies', ledger.supplies),
      flow('gold', ledger.gold),
    ]));

    // Where the gold goes, by name. One figure for "out" told nobody why the treasury moved; the
    // categories say what is eating it and open the screen where it can be answered.
    const parts = ledger.goldParts;
    if (parts) {
      addHeading(t('ascent.ledger.where'));
      const troops = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID && !army.isLevy)
        .reduce((n, army) => n + army.units.spearmen + army.units.archers + army.units.heavyInfantry, 0);
      const lands = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
      const rows: Array<{ title: string; subtitle: string; lane?: AscentLane; n: number }> = [
        { title: t('ascent.ledger.cat.payroll', { n: parts.payroll }), subtitle: t('ascent.ledger.cat.payrollBody', { heroes: state.heroes.length }), lane: 'heroes', n: parts.payroll },
        { title: t('ascent.ledger.cat.hosts', { n: parts.hosts }), subtitle: t('ascent.ledger.cat.hostsBody', { troops }), lane: 'army', n: parts.hosts },
        { title: t('ascent.ledger.cat.wages', { n: parts.wages }), subtitle: t('ascent.ledger.cat.wagesBody', { lands }), lane: 'build', n: parts.wages },
        { title: t('ascent.ledger.cat.buildings', { n: parts.buildings }), subtitle: '', lane: 'build', n: parts.buildings },
        { title: t('ascent.ledger.cat.graft', { n: parts.graft }), subtitle: '', n: parts.graft },
        { title: t('ascent.ledger.cat.softcap', { n: parts.softcap }), subtitle: '', n: parts.softcap },
      ];
      const biggest = Math.max(...rows.map((row) => row.n));
      addWidget(0, (parent, width) => this.actionTiles(parent, width, rows.filter((row) => row.n > 0).map((row) => ({
        title: row.title,
        note: row.subtitle,
        border: row.n === biggest ? INK_UI.cinnabar : INK_UI.softBrush,
        onTap: row.lane ? () => { const lane = row.lane!; this.closeLane(); this.openLane(lane); } : undefined,
      }))));
      if (parts.withheld > 0) {
        addRow({ title: t('ascent.ledger.withheld', { n: parts.withheld }), subtitle: '', border: INK_UI.softBrush, muted: true });
      }
    }

    if (ledger.shortfalls.length > 0) {
      addHeading(t('ascent.ledger.shortfalls'));
      for (const shortfall of ledger.shortfalls) {
        const land = state.lands.find((candidate) => candidate.id === shortfall.landId);
        if (!land) continue;
        addRow(
          {
            title: `${land.name} · ${t(`ascent.ledger.short.${shortfall.kind}` as Parameters<typeof t>[0])}`,
            subtitle: t('ascent.ledger.since', { n: Math.max(1, state.turn - shortfall.sinceTurn) }),
            border: INK_UI.cinnabar,
          },
          () => this.showBuildOptions(land.id),
        );
      }
    }

    finish();
  }

  /**
   * The field battle, live.
   *
   * Runs on its own clock rather than advancing one exchange per tap. The first version made a
   * battle feel like filling in a form — each press nudged the armies a few pixels closer and
   * nothing happened in between — so the controls are now *standing orders* the player changes
   * while the fight runs, which is what watching a battle has to mean.
   *
   * Each side starts at its own camp. The invader always advances; the player's line advances
   * only on `press` and falls back toward its tents on `hold`, so the posture is visible on the
   * field rather than only readable in a description. Blood is only traded once the lines meet.
   *
   * Built in three layers, each refreshed on its own terms by `updateBattle`. The screen used
   * to be built once and never touched again — `refresh` skips the modal layer while a lane
   * owns it — so the numbers, the bars and the two armies all held their opening values for as
   * long as the player watched, while the real fight ran to its end underneath. A battle screen
   * that cannot show the battle is the whole feature.
   */
  private showBattle(): void {
    const battle = this.state.ascent?.activeBattle;
    if (!battle) return;

    this.battleItems ??= createMapItemRenderer(this);
    // A fresh field starts even: the press belongs to this engagement, not the last one.
    this.battlePress = 0;
    const rival = this.state.kingdoms.find((k) => k.id === battle.kingdomId);
    const rivalColor = rival?.color ?? INK_UI.cinnabar;

    const frame = this.battleHeaderFrame(battle);
    const content = frame.content;

    const fieldHeight = battleFieldHeight(content);
    const fieldY = content.y;
    // The men stand a little below centre, so the camps and the horizon have room above them.
    // Where the two lines stand, as a fraction of the field.
    //
    // 0.56 put the fight in the middle and left the whole bottom four-tenths as bare paper: the
    // horizon takes the top three-tenths, so the picture was a strip of country with an empty
    // apron under it. Dropping the line gives that space to the middle distance, which is the part
    // that has something in it, and leaves the near ground as a margin rather than as a void.
    /**
      * 0.78, down from 0.68.
      *
      * The men are drawn upward from this line, and once they were drawn at 2.2 rather than 1.93
      * the whole engagement rode high in the frame with a bare apron of near ground under it — the
      * opposite of the fault 0.68 was set to fix, and by the same amount. Lower puts the fight
      * where the eye rests and hands the space it takes back to the middle distance, which has the
      * ridges and the paddy in it.
      */
     const groundY = fieldY + Math.round(fieldHeight * 0.78);
    // **The field is full-bleed; the rows under it are not.**
    //
    // Everything else on this screen is a card inside a 20px margin, and the field was drawn as
    // one of them and then inset another 44 on each side for the men — so of a 390-wide sheet the
    // fight had 262 to happen in, a third of the width spent on paper either side of a picture
    // that is the reason the screen exists. The rails, the dock and the exits keep the margin,
    // because they are cards and read as cards. The field is a *view*, and a view wants the glass.
    const leftX = BATTLE_FIELD_INSET;
    const rightX = GAME_WIDTH - BATTLE_FIELD_INSET;
    // Full span, not half: the two meet when `ourAdvance + theirAdvance` reaches 1, so the
    // drawing has to use the same scale or the picture and the fight would disagree about where
    // everyone is standing.
    const span = rightX - leftX - 60;

    const field = this.add.container(0, 0);
    const bubbles = this.add.container(0, 0);
    const floaters = this.add.container(0, 0);
    const pips = this.add.container(0, 0);
    const readout = this.add.container(0, 0);
    const orders = this.add.container(0, 0);
    const exits = this.add.container(0, 0);
    const moment = this.add.container(0, 0);
    const fallen = this.add.graphics();
    field.add(fallen);
    this.modalLayer.add([field, bubbles, floaters, pips, readout, orders, exits, moment]);

    this.battleUi = {
      content,
      fieldHeight,
      coachBounds: {},
      field,
      bubbles,
      bubbleSaid: { ours: '', theirs: '' },
      bubbleAt: { ours: 0, theirs: 0 },
      bubbleShoutAt: 0,
      bubbleOf: {},
      notice: frame.notice,
      logLine: frame.log,
      pipBounds: frame.pips,
      readout,
      pips,
      floaters,
      orders,
      exits,
      fallen,
      fallenPts: [],
      fallenCount: 0,
      moment,
      momentKey: '',
      groundSources: [],
      exitBounds: frame.exits,
      rivalColor,
      fieldSignature: '',
      orderSignature: '',
      shapeSignature: '',
      railsSignature: '',
      ourMarkers: [],
      theirMarkers: [],
      geometry: { leftX, rightX, span, groundY },
    };

    // Come back to a siege already under way and the queue may hold half a minute of beats
    // nobody watched. Replaying them would put the picture a tick behind the numbers, so all
    // but the last are dropped and the screen opens on where the fight actually is.
    const queued = battle.beats;
    if (queued && queued.length > 2) queued.splice(0, queued.length - 2);

    this.buildBattleField(battle);
    this.buildBattleRails(battle);
    this.updateBattleRails(battle);
    this.buildBattlePips(battle);
    this.buildBattleOrders(battle);
    // The two exits ARE the foot of this screen now — the lane's own Close button is not drawn
    // here. Leaving hands the rest of the fight to the general and steps away, which is what
    // closing it did anyway; two buttons that do nearly the same thing, one of them unlabelled as
    // to what it costs, is worse than one that says so.
    this.buildBattleExits(battle);
    this.buildBattleMoment(battle);
    this.updateBattleBubbles(battle);
    this.updateBattleNotice(battle);
    this.updateBattleLogLine(battle);

    this.startBattleClock();
  }

  /**
   * The round track: `totalRounds` pips, filled as the fight spends them.
   *
   * The round limit has always existed and has never been shown, so an engagement that ground
   * to `spent` looked like it simply stopped. A visible countdown is what turns attrition into
   * a race — and it is what gives the last third of a fight any urgency at all.
   */
  /**
   * Empties a layer, and takes its tweens with it.
   *
   * `Container.removeAll(true)` destroys the children; it does **not** touch the tweens pointing at
   * them, and Phaser's tween manager keeps updating a tween whose target is destroyed until the
   * tween ends on its own. One with `repeat: -1` never does.
   *
   * The battle screen has two of those. The clash mark over the seam pulses forever and lives in
   * the readout, which is rebuilt on every beat; `marchInPlace` gives every rank of every host
   * block an endless step, and a block is rebuilt each time its strength drops a mark. Measured
   * across a single 26-beat engagement the manager climbed from 11 live tweens to 73 and was still
   * rising — sixty updates a second each, every one of them writing to an object that no longer
   * existed.
   */
  private clearLayer(target: Phaser.GameObjects.Container): void {
    for (const child of target.list) this.killTweensDeep(child);
    target.removeAll(true);
  }

  /**
   * Kills every tween pointing at an object *or at anything inside it*.
   *
   * The depth is the whole point. `marchInPlace` tweens each rank of a host block, and a rank is a
   * `Graphics` child of the marker container — so `killTweensOf(marker)` finds nothing at all and
   * every rebuilt block left its old ranks stepping in place forever, invisible and still costing.
   */
  private killTweensDeep(object: Phaser.GameObjects.GameObject): void {
    this.tweens.killTweensOf(object);
    const nested = object as Phaser.GameObjects.Container;
    if (Array.isArray(nested.list)) for (const child of nested.list) this.killTweensDeep(child);
  }

  private buildBattlePips(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui) return;
    const { pipBounds: box, pips } = ui;
    // The track is one graphics and one label for the whole fight; a beat clears and re-fills it.
    // Throwing both away and making them again cost 5.3 ms a beat to move one pip along.
    if (!ui.pipTrack?.active) {
      this.clearLayer(pips);
      ui.pipTrack = this.add.graphics();
      pips.add(ui.pipTrack);
      ui.pipsLeft = this.ui.label(
        box.x + box.width, box.y + 9, '', 'caption',
        { fontSize: '10px', align: 'right' },
      ).setOrigin(1, 0);
      pips.add(ui.pipsLeft);
    }

    // A gap of one, not two: at 132 points wide a thirty-round fight gives each bead about three,
    // and a two-point gap either side of that is more air than bead.
    /**
     * The track counts down to the grind, not to the end of the fight.
     *
     * Nothing stops at the last bead any more — a fight ends when a line breaks. What the last bead
     * marks is the round at which both sides start losing heart simply for still being there, and
     * once it is passed the whole track goes to sỏi son and the label stops counting down and
     * starts counting up. A player who has watched one fight go into it knows what a full red track
     * means without being told.
     */
    const total = Math.max(1, battle.totalRounds);
    const over = battle.round >= total;
    const gap = 1;
    const width = (box.width - gap * (total - 1)) / total;
    const g = ui.pipTrack;
    g.clear();
    for (let i = 0; i < total; i += 1) {
      const spent = i < battle.round;
      const current = i === battle.round;
      g.fillStyle(
        over ? INK_UI.cinnabar : current ? INK_UI.cinnabar : spent ? INK_UI.gold : INK_UI.softBrush,
        over || spent || current ? 0.95 : 0.3,
      );
      g.fillRect(box.x + i * (width + gap), box.y, Math.max(1, width), over || current ? 6 : 4);
    }

    const left = Math.max(0, battle.totalRounds - battle.round);
    const label = over
      ? t('ascent.battle.overtime', { n: battle.round + 1 })
      : t('ascent.battle.roundsLeft', { n: left });
    if (ui.pipsLeft?.active && ui.pipsLeft.text !== label) {
      ui.pipsLeft.setText(label);
      ui.pipsLeft.setColor(over ? `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}` : INK_UI_HEX.mutedText);
    }
  }

  /**
   * What the screen should be showing right now.
   *
   * The buffered beat when the queue has one, the live battle when it has run dry. *Every* piece
   * of the picture reads through this, so it can never disagree with itself — drawing half the
   * bars from a replayed beat and half from live state is how a screen ends up showing a host
   * at two strengths at once.
   */
  private battleFrame(battle: AscentBattle): {
    round: number;
    ourNow: number; theirNow: number;
    ourMorale: number; theirMorale: number;
    ourAdvance: number; theirAdvance: number;
    hostMen?: Map<string, number>;
    hostMorale?: Map<string, number>;
  } {
    const beat = this.battleUi?.shown;
    if (!beat) {
      return {
        round: battle.round,
        ourNow: battle.ourNow, theirNow: battle.theirNow,
        ourMorale: battle.ourMorale, theirMorale: battle.theirMorale,
        ourAdvance: battle.ourAdvance, theirAdvance: battle.theirAdvance,
      };
    }
    const men = new Map<string, number>();
    const morale = new Map<string, number>();
    for (const host of [...beat.ourHosts, ...beat.theirHosts]) {
      men.set(host.id, host.men);
      morale.set(host.id, host.morale);
    }
    return {
      round: beat.round,
      ourNow: beat.ourNow, theirNow: beat.theirNow,
      ourMorale: beat.ourMorale, theirMorale: beat.theirMorale,
      ourAdvance: beat.ourAdvance, theirAdvance: beat.theirAdvance,
      hostMen: men, hostMorale: morale,
    };
  }

  /**
   * Casualty numbers rising off the point of contact.
   *
   * Ours in sỏi son and theirs in ink, deliberately: the palette reserves that red for "your
   * banner, your seal, *your losses*", so the one red thing on the field is what it cost us.
   */
  private spawnBattleFloaters(beat: BattleBeat): void {
    const ui = this.battleUi;
    if (!ui) return;
    const { groundY } = ui.geometry;
    const { ourX: ourLine, theirX: theirLine } = this.battleLines(beat.ourAdvance, beat.theirAdvance);

    const pool = (ui.floaterPool ??= []);
    const float = (x: number, value: number, dy: number, colour: string): void => {
      if (value <= 0) return;
      const spare = pool.pop();
      const label = spare?.active
        ? spare.setText(`−${value}`).setColor(colour).setPosition(x, groundY - 44 + dy).setAlpha(1)
          .setVisible(true)
        : this.ui.label(x, groundY - 44 + dy, `−${value}`, 'label', {
          fontSize: '13px', align: 'center', color: colour,
        }).setOrigin(0.5);
      if (!label.parentContainer) ui.floaters.add(label);
      this.tweens.add({
        targets: label,
        y: groundY - 76 + dy,
        alpha: { from: 1, to: 0 },
        duration: BATTLE_TICK_MS * 1.4,
        ease: 'Sine.easeOut',
        onComplete: () => {
          // Back on the shelf rather than into the bin. Capped, so a very long siege cannot turn
          // the pool into the leak it was meant to prevent.
          label.setVisible(false);
          if (pool.length < 6) pool.push(label);
          else label.destroy();
        },
      });
    };
    // Outside each block rather than between them: the seam is where the men are, and a number
    // dropped into it lands on the fighting. Staggered too, so the two never collide.
    float(ourLine - 30, beat.ourLoss, -6, `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}`);
    float(theirLine + 30, beat.theirLoss, 10, INK_UI_HEX.inkText);
  }

  /**
   * The land the fight is happening on.
   *
   * The field was a cream rectangle with two clusters of tents on it — the thing the screen exists
   * to show, drawn as nothing. None of this needs new art: the Đông Hồ renderers already draw
   * villages, citadels, paddy, karst, bamboo and buffalo for the map, and the battle screen used
   * exactly one of them.
   *
   * Five bands, painted far to near, because the eye reads a scene bottom-up and Phaser does not
   * depth-sort a container's children:
   *
   *   0  distance — karst and a soft ridge along the horizon. Nothing here ever moves.
   *   1  ground   — a tone under the whole killing floor.
   *   2  ours     — the province being defended: its settlement, its paddy, its bamboo hedge.
   *   3  theirs   — what came for it.
   *   4  scatter  — trees and grass drawn from the province's *real* terrain.
   *
   * Static for the length of the fight, so it is drawn once per field rebuild rather than per beat.
   */
  private buildBattleGround(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui) return;
    const { content, field } = ui;
    const { leftX, rightX, groundY } = ui.geometry;

    const top = content.y;
    const bottom = top + ui.fieldHeight;
    const x0 = 4;
    const x1 = GAME_WIDTH - 4;
    const horizon = top + ui.fieldHeight * 0.30;
    const land = findLand(this.state, battle.landId);
    const seed = Math.round((battle.landId.length * 977) + battle.totalRounds * 31);
    const rand = mulberry32(seed);
    // One scale for everything standing on this field, and the only thing allowed to change it
    // is how far back the thing stands. See `battleScaleAt`.
    const scale = (at: number): number => this.battleScaleAt(at);

    // Everything the land is made of is clipped to the frame.
    //
    // `planSoftRidge` places peaks along the span it is given and each peak is wider than its
    // centre, so a range asked to end at the frame still puts a summit and its skirt out past the
    // border — measured, a whole hill hung forty pixels off the right edge with the panel's own
    // rule cut behind it. Narrowing the span only moves the overhang inward. A mask is the only
    // thing that ends a shape exactly where the paper does.
    // A stencil layer, bracketing the three land layers in the field's child list. Phaser 4 made
    // the v3 geometry mask a no-op under WebGL, and the Mask filter that was meant to replace it
    // crops to the design surface, so it had to be gated off above RENDER_SCALE 1 — read
    // `ui/ink/clipRect` for the measurement. The stencil clips in screen space and so is the same
    // shape at every graphics tier.
    const clip = new RectClip(this, {
      x: 2, y: top + 2, width: GAME_WIDTH - 4, height: ui.fieldHeight - 4,
    });
    ui.groundClip = clip;
    clip.begin(field);

    // Three layers, in the order a print is built: distance, then the ground over its feet, then
    // everything standing on the ground.
    const far = this.add.graphics();
    far.setAlpha(0.5);
    field.add(far);
    clip.apply(far);
    const ground = this.add.graphics();
    field.add(ground);
    clip.apply(ground);
    const g = this.add.graphics();
    // The land is a backdrop, not a subject. Drawn at half strength as a whole, because at full
    // weight the scenery and the two armies carry the same emphasis and the fight — the thing the
    // screen exists to show — stops being the thing you look at.
    g.setAlpha(0.5);
    field.add(g);
    clip.apply(g);
    // Closes the bracket: everything added to `field` after this — the fallen, the camps, the
    // hosts — is outside the clip, exactly as it was under the three-mask version.
    clip.end(field);

    // ── 0. distance ────────────────────────────────────────────────────────
    // Two soft ridges at different depths, and no karst.
    //
    // `karstRange` is drawn for a map, where a limestone tower is a few pixels and the range reads
    // as a country's spine. Squeezed into a hundred-pixel band it repeats its arcs at even
    // intervals and the horizon becomes a scalloped border — a caterpillar laid across the top of
    // the field. Ridges have no repeating unit, so they thin out into distance instead.
    //
    // Both stand on nearly the same line, and both lines sit *above* where the near ground starts.
    // A ridge's own base is a hard edge; the only thing that hides one is the ground in front of
    // it, so anything the ground does not reach up to stays visible as a rule across the field.
    // The first pass missed this one by eleven pixels and it was still perfectly obvious.
    //
    // Both on the same base. Two ridges at two heights meant two flat wash bottoms and two ruled
    // lines across the field; standing them on one line leaves one seam, and one seam can be given
    // a contour and a treeline and become the horizon. See the ground band below.
    // Run past the frame on purpose: the mask ends them, so the range reads as continuing behind
    // the border rather than as a row of hills that happens to stop at it.
    softRidge(far, x0 - 20, x1 + 20, horizon + 8, ui.fieldHeight * 0.13, seed + 5);
    softRidge(far, x0 - 20, x1 + 20, horizon + 8, ui.fieldHeight * 0.07, seed + 41);

    // ── 1. the ground ──────────────────────────────────────────────────────
    //
    // `softRidge` fills its slopes down to a flat `baseY`, and on this screen that showed: measured
    // off a frame, 97–100% of sampled columns stepped at exactly the two base rows, a seven-per-
    // channel difference holding dead straight for 670 px. On the map the same fill is invisible
    // because terrain is already toned underneath it; here there was bare paper below.
    //
    // Two attempts at hiding it both failed and both are worth recording. A translucent wash over
    // the top adds the same amount on either side of a step, so the step survives exactly as it
    // was. An opaque block of `parchment` laid over the lower half does remove it — and reads as a
    // sheet of white paper pasted across the picture, because flat parchment is brighter than the
    // panel's own printed, textured, washed surface. There is nothing to paint the ground *with*
    // that matches the paper, because the paper is not one colour.
    //
    // So the seam is not hidden. Both ridges are put on the same base line, which turns two seams
    // into one, and that one is *drawn* — an inked ground line with a treeline standing on it.
    // A landscape print has a horizon in it. An artefact that is given a contour stops being an
    // artefact and becomes the thing it was accidentally imitating.
    const baseY = horizon + 8;
    const horizonPts: Array<{ x: number; y: number }> = [];
    const skyX0 = content.x + 5;
    const skyX1 = content.x + content.width - 5;
    for (let i = 0; i <= 14; i += 1) {
      const t = i / 14;
      horizonPts.push({ x: skyX0 + (skyX1 - skyX0) * t, y: baseY + Math.sin(t * Math.PI * 1.7 + seed) * 2.5 });
    }
    inkPath(ground, horizonPts, seed + 71, { colour: PIGMENT.mucFaint, width: 0.8, alpha: 0.5, wobble: 0.8, step: 12 });

    // A broken treeline on the line, at the far distance's weight. Something irregular growing out
    // of a horizon is most of what stops it reading as a border.
    for (let i = 0; i < 34; i += 1) {
      const t = (i + rand() * 0.9) / 34;
      const tx = skyX0 + (skyX1 - skyX0) * t;
      const ty = baseY + Math.sin(t * Math.PI * 1.7 + seed) * 2.5 + 1;
      const th = 3.5 + rand() * 5;
      ground.fillStyle(PIGMENT.tram, 0.16 + rand() * 0.14);
      ground.fillEllipse(tx, ty - th * 0.55, 3.4 + rand() * 3.4, th);
    }

    // Tone on the near ground, so the field is a place and not bare paper — the complaint that
    // started this was literally "no blank screen, make it look like a fight on a land".
    //
    // Every centre jittered and no two radii alike. `groundTone` is rings of hard circles, edgeless
    // only because the map's cells never share a step; laid out as an even row at one height they
    // draw a fresh ruled line straight back in, which is the same fault one layer up.
    const plane = ui.fieldHeight;
    for (let i = 0; i <= 10; i += 1) {
      const px = x0 + ((x1 - x0) * i) / 10 + (rand() - 0.5) * 20;
      groundTone(ground, px, baseY + 30 + (rand() - 0.5) * plane * 0.10,
        plane * (0.16 + rand() * 0.09), PIGMENT.diepLo, 0.09, 6);
    }

    // Barely there: a wash under the men's feet, not a pool of colour the eye lands in.
    groundTone(ground, (x0 + x1) / 2, groundY + 22, content.width * 0.42, PIGMENT.diepDeep, 0.1, 6);

    // The dead, re-laid onto the rebuilt field: on the ground, under everything that stands on it.
    ui.fallen = this.add.graphics();
    field.add(ui.fallen);
    for (const pt of ui.fallenPts) this.inkFallen(pt.x, pt.y);

    // ── 2. the middle distance ─────────────────────────────────────────────
    //
    // The band between the horizon and the line the hosts stand on was bare paper — sixty units
    // of nothing across the whole width, directly behind the only thing the screen is about. All
    // the scenery this field had was crammed into the bottom-left corner and along the near edge,
    // along the near edge, where the log ribbon then printed over half of it.
    //
    // What fills it is what is actually there: the bờ ruộng. A delta province is a mosaic of
    // banked paddy, and the banks are long shallow curves running away from the eye and closing up
    // as they recede. Three strokes and the ground has depth, without one thing standing between
    // the player and the two lines.
    const ts = land?.terrainSummary;
    const wooded = ts ? ts.forest + ts.mountains + ts.hills : 0;
    const wet = ts ? ts.riceFields + ts.fields + ts.water : 0;
    const bunds = 5;
    for (let i = 0; i < bunds; i += 1) {
      // Squared so they crowd toward the horizon, which is what perspective does to even spacing.
      const t = ((i + 1) / (bunds + 1)) ** 1.7;
      const by = horizon + 10 + t * (groundY - horizon - 16);
      const sag = 3 + t * 5;
      // Each one a stretch of bank rather than a line across the world. Drawn full width at an
      // even weight they stopped reading as the edges of paddy and started reading as wires strung
      // over the battlefield — a bund is a boundary between two fields, and fields end.
      const from = x0 - 10 + rand() * (x1 - x0) * 0.34;
      const to = from + (x1 - x0) * (0.4 + rand() * 0.5);
      inkPath(
        far,
        [{ x: from, y: by }, { x: (from + to) / 2, y: by + sag }, { x: Math.min(x1 + 10, to), y: by }],
        seed + 101 + i,
        { colour: PIGMENT.mucFaint, width: 0.7, alpha: 0.16 + t * 0.12, wobble: 1.1, step: 14 },
      );
    }
    // No treeline here. There is already one — thirty-four small tram ellipses standing on the
    // drawn horizon, a few lines further down — and it is the better of the two: irregular,
    // low, and at the far distance's own weight. A second row of full `tree()` props at ten
    // metres apiece put evenly spaced canopies across the skyline, which read as boulders rather
    // than as woodland and reached back over the hills.

    // ── 3. the province being defended ─────────────────────────────────────
    //
    // Drawn from the province's own record: the seat gets its citadel, a settled district gets a
    // village, and bare ground gets a hamlet. The stake of the fight, stated as a picture.
    //
    // Behind our own line and to the left of it — not on it. Drawn beside the camp it belongs to,
    // the settlement sat exactly where our block stands and where an advancing enemy comes to meet
    // it, so at contact the village, our host and theirs were one unreadable clump.
    const era = figureEraFor(this.state);
    // Set back the same distance as their camp, and for the same reason: a settlement drawn on the
    // line the armies stand on is a settlement our own front rank is standing inside. `village()`
    // is a composite — houses, a pond, its own cây đa — so at the field's scale it reaches a
    // hundred units to the right of its anchor, which put our block in the middle of it.
    const homeX = x0 + 22;
    const homeY = this.battleRearY();
    if (land && this.state.ascent?.capitalLandId === land.id) citadel(g, homeX, homeY, scale(homeY), era, seed + 3);
    else if (land?.hasVillage) village(g, homeX, homeY, scale(homeY), seed + 3);
    else hamlet(g, homeX, homeY, scale(homeY), seed + 3, 4);

    // The bamboo hedge that is a delta village's real boundary — not a palisade, which this
    // screen had no business drawing. It runs along the village's own edge, between it and the
    // fight.
    //
    // No paddy plots: `drawFieldPlot` is drawn for map scale, where a plot is a few pixels of
    // texture. Blown up to a close-up they are big pale rectangles that read as scraps of paper
    // lying on the field, and a wrong mark is worse than a missing one — hence the bunds above,
    // which are the same idea drawn as lines instead of as fills.
    for (let i = 0; i < 4; i += 1) {
      // Along the village's own edge, between it and the fight.
      const hedgeY = homeY + 10 + (i % 2) * 3;
      bamboo(g, x0 + 4 + i * 9, hedgeY, scale(hedgeY), seed + 11 + i);
    }
    // No buffalo. It is the right animal for a province at peace and the wrong one for the near
    // edge of a battlefield: drawn at the ground scale it is the largest single object on the
    // field, it stands between the player and the fight, and it is grazing through a battle.
    hayStack(g, homeX + 26, homeY + 6, scale(homeY + 6), seed + 19);

    // ── 4. what came for it ────────────────────────────────────────────────
    //
    // The tents themselves are `battleCamp`; this is the baggage behind them. Drawing a hamlet on
    // top of the camp put two settlements in the same place.
    hayStack(g, x1 - 26, groundY - 6, scale(groundY - 6), seed + 21);
    hayStack(g, x1 - 46, groundY - 2, scale(groundY - 2), seed + 23);

    // ── 5. the killing floor ───────────────────────────────────────────────
    //
    // Scatter chosen by what the province actually is. A fight on rice ground and a fight in the
    // hills are the same two blocks of men on two different pieces of the country. Near the eye
    // and along the edges: anything in the middle stands between the player and the two lines
    // meeting, which is the one thing on this screen that must stay legible.
    // Two corner pieces first, big and near, one each side. A picture with nothing in its
    // foreground has no depth to read the middle against — and the near band under the lines was
    // a third of the field with nothing on it at all. These are the only things on the screen
    // drawn larger than the men, which is what puts the men at a distance.
    if (wet > wooded) {
      areca(g, x0 + 14, bottom - 4, scale(bottom - 4), seed + 61);
      areca(g, x0 + 30, bottom + 2, scale(bottom + 2), seed + 63);
    } else {
      tree(g, x0 + 20, bottom - 2, scale(bottom - 2), seed + 61);
    }
    for (let i = 0; i < 3; i += 1) {
      const py = bottom + 2 - i * 3;
      bamboo(g, x1 - 10 - i * 11, py, scale(py), seed + 65 + i);
    }

    // And the rest scattered across the near ground. Below the line rather than beside it: the two
    // lines meet *on* the ground line, so anything under it is behind the player's eye rather than
    // between the player and the fight, and the old rule that kept the middle clear was costing
    // the whole apron for a clearance the composition no longer needs.
    const nearTop = groundY + 26;
    const nearDepth = Math.max(12, bottom - nearTop - 8);
    for (let i = 0; i < 11; i += 1) {
      const px = x0 + 16 + rand() * (x1 - x0 - 32);
      const py = nearTop + rand() * nearDepth;
      if (wooded > wet && i < 2) tree(g, px, py, scale(py), seed + 33 + i);
      else if (wet > wooded && i === 0) areca(g, px, py, scale(py), seed + 39);
      else grassTuft(g, px, py, scale(py), seed + 41 + i);
    }
    void leftX;
    void rightX;
  }

  /**
   * The one scale everything on the battlefield is drawn at, given the ground it stands on.
   *
   * The field had sixteen different scales on it. The men were drawn at `BATTLE_HOST_SCALE`, the
   * scenery at `GROUND_SCALE * 1.5`, and every prop then carried a hand-tuned multiplier on top of
   * that — 0.42 for the bamboo, 0.55 for the seat, 0.7 for the buffalo. Which is exactly the fault
   * `proportion.ts` exists to prevent: its whole premise is that the corrections in `UNIT` only
   * equalise the props **if every call site passes the same caller scale**, and here none of them
   * did. Measured, the buffalo came out at 0.756 against a soldier's 1.45, so a trâu — an animal
   * that stands nearly as tall as a man — was drawn at half his height, and the war camp beside it
   * at twice the height it should be.
   *
   * So: one caller scale, and the only thing allowed to change it is depth. A thing drawn higher up
   * the field is further away and shrinks toward `BATTLE_DEPTH_FAR`; a thing at the near edge grows
   * a little past 1. That is perspective, which is a property of *where* something stands rather
   * than of what it is — and it is a single function, so nothing can drift again.
   */
  private battleScaleAt(y: number): number {
    const ui = this.battleUi;
    if (!ui) return this.battleBaseScale();
    const { horizon, bottom, groundY } = this.battleBands();
    // 0 at the horizon, 1 on the line the armies stand on, past 1 at the near edge.
    const depth = (y - horizon) / Math.max(1, groundY - horizon);
    const eased = depth <= 1
      ? BATTLE_DEPTH_FAR + (1 - BATTLE_DEPTH_FAR) * Math.max(0, depth)
      : 1 + (BATTLE_DEPTH_NEAR - 1) * Math.min(1, (y - groundY) / Math.max(1, bottom - groundY));
    return this.battleBaseScale() * eased;
  }

  /** The three lines the field is laid out against: the horizon, the line of battle, the near edge. */
  private battleBands(): { horizon: number; groundY: number; bottom: number } {
    const ui = this.battleUi;
    if (!ui) return { horizon: 0, groundY: 0, bottom: 0 };
    const top = ui.content.y;
    return { horizon: top + ui.fieldHeight * 0.30, groundY: ui.geometry.groundY, bottom: top + ui.fieldHeight };
  }

  /**
   * The scale on the line of battle, which is not a constant because the field is not a fixed size.
   *
   * `GAME_HEIGHT` clamps as low as 620, and on a short screen the field comes out at about 154
   * units against the 301 an iPhone-shaped one gets — so the band between the horizon and the line
   * of battle, which is the *whole* depth the picture has to work in, halves. Drawn at a fixed
   * scale, a host block is then taller than the distance between the line and the camp behind it,
   * and the two collide however carefully the camp is placed. Which is exactly what a short screen
   * showed: the enemy's front rank standing in their own tents.
   *
   * So everything shrinks with the room it has. The reference is the 844-high case, where the
   * depth band is about 114 units and the scale is `BATTLE_HOST_SCALE`; the floor keeps a soldier
   * legible on the shortest screen the game supports.
   */
  private battleBaseScale(): number {
    const ui = this.battleUi;
    if (!ui) return BATTLE_HOST_SCALE;
    const band = ui.geometry.groundY - (ui.content.y + ui.fieldHeight * 0.30);
    return BATTLE_HOST_SCALE * Math.max(0.62, Math.min(1, band / 114));
  }

  /**
   * How far back the camps stand, in the depth the field actually has.
   *
   * A fraction of the *band* rather than of the field height: it is the distance between the
   * horizon and the line of battle that has to hold a camp, a gap, and a block of men.
   *
   * Just over half, and both halves of that are load-bearing. Nearer than this and a host block
   * stands in its own camp, which is where this started. Further and the tall things that come
   * with a settlement — a lũy tre is eight metres, a cây đa fourteen — reach back over the
   * skyline, and a bamboo hedge crossing a mountain reads as a mistake even though a real village
   * at the foot of real hills does exactly that. The hills are drawn as a pale wash with no ink in
   * them, so anything dark in front of them looks like it is *on* them.
   */
  private battleRearY(): number {
    const { horizon, groundY } = this.battleBands();
    return Math.round(horizon + (groundY - horizon) * 0.56);
  }

  /**
   * Lays out the men who fell this beat, where they fell.
   *
   * One mark per figure's worth of loss, capped — a beat that kills sixty men lays about one body
   * down, so the floor fills at the same rate the ranks thin. Drawn into a graphics that is never
   * cleared, because the dead do not get up: the field carries the whole fight's cost by the end,
   * which is what makes a won battle look like it cost something.
   */
  private layFallen(beat: BattleBeat): void {
    const ui = this.battleUi;
    if (!ui || ui.fallenCount >= BATTLE_FALLEN_CAP) return;
    const { groundY } = ui.geometry;
    const { seam } = this.battleLines(beat.ourAdvance, beat.theirAdvance);

    // One mark per twenty men, so an ordinary exchange — measured, eight to thirty a side — lays
    // one or two down. At one per forty-five a whole fight passed without a single body, which is
    // a threshold set from a guess about how hard fights hit rather than from watching one.
    const lost = beat.ourLoss + beat.theirLoss;
    const wanted = Math.min(3, Math.round(lost / 20));
    if (wanted <= 0) return;

    for (let i = 0; i < wanted && ui.fallenCount < BATTLE_FALLEN_CAP; i += 1) {
      const rand = mulberry32(ui.fallenCount * 2654435761);
      // Scattered along the seam rather than dropped on it: a line of bodies in a row reads as a
      // fence. Spread wider across the line than through it, the way a front is shaped.
      const fx = seam + (rand() - 0.5) * 58;
      const fy = groundY + (rand() - 0.5) * 64;
      ui.fallenPts.push({ x: fx, y: fy });
      this.inkFallen(fx, fy);
      ui.fallenCount += 1;
    }
  }

  /** One body on the ground. Two marks: the man, and what he dropped. */
  private inkFallen(x: number, y: number): void {
    const g = this.battleUi?.fallen;
    if (!g?.active) return;
    g.fillStyle(PIGMENT.muc, 0.55);
    g.fillEllipse(x, y, 8.5, 3);
    g.lineStyle(1.1, PIGMENT.mucSoft, 0.5);
    g.lineBetween(x - 5, y + 2, x + 4, y - 1.6);
  }

  /**
   * Where the two lines stand this frame.
   *
   * The two advances are defined to sum to 1 at contact, and the drawing took that literally: at
   * contact `leftX + 30 + span` and `rightX - 30 - span` are the *same point*, so one army was
   * drawn exactly on top of the other. A fight at its most violent showed one clump — and the
   * dead, which lie along the seam, were underneath it.
   *
   * So the lines close to a seam and no further. They interpenetrate by about a file, which reads
   * as one contested mass with a join in it rather than as two rectangles that stopped politely
   * short — and it leaves the ground between them visible, which is where the bodies are.
   */
  private battleLines(
    ourAdvance: number, theirAdvance: number,
  ): { ourX: number; theirX: number; seam: number; met: boolean } {
    const ui = this.battleUi;
    if (!ui) return { ourX: 0, theirX: 0, seam: 0, met: false };
    const { leftX, rightX, span } = ui.geometry;
    const ourX = leftX + 30 + span * ourAdvance;
    const theirX = rightX - 30 - span * theirAdvance;
    const gap = this.battleSeamGap();
    if (theirX - ourX >= gap) return { ourX, theirX, seam: (ourX + theirX) / 2, met: false };

    // They have reached us. Where that happens is decided by who advanced — hold your ground and
    // they cross the whole field to get to you — but drawn literally it puts the entire fight in
    // the left quarter with two thirds of the picture empty behind them. The meeting is pulled
    // back into the middle band so the thing worth looking at is where the eye already is.
    // Held ground pushes the raw meeting point right up against our own camp, which is honest and
    // unwatchable: measured, the contact landed at x=135 of a 390-wide screen with the whole right
    // half of the field empty behind the enemy. Clamped to a band about the centre instead — the
    // direction still reads, because within the band the seam still moves with who pushed whom.
    const raw = (ourX + theirX) / 2;
    const mid = (leftX + rightX) / 2;
    // Once they have met the advances stop changing, so drawn literally the two blocks freeze the
    // instant the fight actually starts and only jitter — which is exactly the "teleport, stop,
    // teleport" the screen was accused of. `press` carries who has been winning the exchanges and
    // pushes the seam that way, so the line keeps moving for as long as men keep falling.
    const pressed = raw + this.battlePress * span * BATTLE_PRESS_TRAVEL;
    const seam = Math.min(Math.max(pressed, mid - span * 0.16), mid + span * 0.16);
    return { ourX: seam - gap / 2, theirX: seam + gap / 2, seam, met: true };
  }

  /**
   * How far apart the two lines stand once they have met.
   *
   * Measured off the blocks actually on the field rather than fixed, because the blocks change
   * size — with the count, and with every fifty-five men lost. A fixed gap either has the ranks
   * standing inside one another when the hosts are large or leaves a road between them when they
   * are small; either way it stops reading as contact.
   */
  private battleSeamGap(): number {
    const ui = this.battleUi;
    if (!ui) return BATTLE_SEAM_GAP;
    const widest = (markers: BattleMarker[]): number => markers
      .reduce((most, entry) => Math.max(most, entry.halfWidth ?? 0), 0);
    // Front ranks about a file apart: close enough to be fighting, far enough that the two blocks
    // are still two blocks.
    return Math.max(BATTLE_SEAM_GAP, widest(ui.ourMarkers) + widest(ui.theirMarkers) + 10);
  }

  /** Pairs a drawn marker with its host, finding the strength label to keep current. */
  private trackMarker(hostId: string, marker: Phaser.GameObjects.Container, mustered?: number): BattleMarker {
    const count = marker.list.find((child) => child.type === 'Text') as Phaser.GameObjects.Text | undefined;
    return { hostId, marker, count, mustered };
  }

  /** Who is standing on the field, so relief arriving or a column breaking forces a redraw. */
  private battleFieldSignature(battle: AscentBattle): string {
    const ours = ourHosts(this.state, battle).map((host) => host.id);
    const theirs = theirHosts(this.state, battle).map((host) => host.id);
    return `${ours.join(',')}|${theirs.join(',')}`;
  }

  /**
   * What the two strips currently offer.
   *
   * Rebuilt when — and only when — this changes. **Never on the beat:** a card destroyed between
   * press and release never fires, which this screen has already been bitten by once.
   *
   * The telegraph is in here because the chip edges are drawn from it: a green rim under a shape
   * that no longer answers what they are forming is worse than no rim at all.
   */
  private battleOrderSignature(battle: AscentBattle): string {
    const read = battleTelegraph(this.state);
    const wind = battleWindView(battle);
    return [
      battle.stance,
      battle.stancePending ?? '',
      battle.ourFormation,
      battle.formationTarget ?? '',
      battle.reformBeats ?? 0,
      // The readout band lives in this layer, so its readings belong in the signature: the price
      // moves every beat and the landing stamp has two beats to live. Without these the band would
      // print one stale beat behind the fight it is describing.
      Math.round(battle.lastBeatLoss?.ours ?? -1),
      Math.round(battle.lastBeatLoss?.theirs ?? -1),
      battle.landedBeat ?? -1,
      read ? `${read.formation}>${read.next ?? ''}:${read.beatsLeft}` : '',
      // Every wind clock, both docks, plus the match — a chip whose breath comes back must relight
      // on that very beat, and the enemy-spent line must drop names the moment they recover.
      FORMATION_RING.map((shape) => `${wind.ours[shape]},${wind.theirs[shape]}`).join('|'),
      wind.match,
      battle.delegated ? 'd1' : 'd0',
    ].join(':');
  }

  /**
   * The two armies on their ground.
   *
   * Every host on the field gets its own marker, stacked vertically. The maths has summed
   * across hosts since relief arrived, but the field drew one formation a side — so a
   * two-column defence looked exactly like a one-column defence with a bigger number on it.
   * Drawing them separately is what makes "their vanguard is wavering" something you can see,
   * and it is what gives Focus something to point at.
   */
  private buildBattleField(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui) return;
    const { content, field, rivalColor } = ui;
    const { leftX, rightX, span, groundY } = ui.geometry;

    this.clearLayer(field);
    ui.groundClip?.destroy();
    ui.groundClip = undefined;
    ui.ourMarkers = [];
    ui.theirMarkers = [];
    ui.fieldSignature = this.battleFieldSignature(battle);

    field.add(this.ui.panel(
      battleFieldBox(content, ui.fieldHeight),
      { border: INK_UI.softBrush },
    ));

    // The ground itself, before anything stands on it — then flattened into one texture.
    const groundFrom = field.list.length;
    this.buildBattleGround(battle);
    this.bakeBattleGround(groundFrom);

    // Camps: the ground each side is fighting from, and what "hold" means.
    // Behind their line and a little past the field's edge, at the same scale the hosts are
    // drawn: a camp tuned against a field size that changes with the screen is a camp that is the
    // wrong size on most screens.
    // Behind their line, not on it.
    //
    // It used to be placed eight units above the ground line and drawn at nearly the men's own
    // scale, so their front rank stood *inside* the tents — the two read as one collided object
    // rather than as a line with its camp behind it. Set well back, it takes the depth scale with
    // everything else and the men occlude it, which is what "behind" looks like.
    const campY = this.battleRearY();
    field.add(this.battleCamp(rightX - 4, campY, rivalColor, 23, this.battleScaleAt(campY)));

    const ours = ourHosts(this.state, battle);
    const theirs = theirHosts(this.state, battle);
    const lane = (index: number, count: number): number => groundY + (index - (count - 1) / 2) * 32;

    const lines = this.battleLines(battle.ourAdvance, battle.theirAdvance);
    ours.forEach((host, index) => {
      const marker = this.battleItems!.createArmyMarker(
        hostSize(host), true, undefined, this.state.mapConfig.seed,
        { ...hostKitFor(this.state, host), mustered: hostSize(host), shape: battle.ourFormation },
        this.battleBaseScale(),
      );
      marker.setPosition(lines.ourX, lane(index, ours.length));
      field.add(marker);
      const tracked = this.trackMarker(host.id, marker, hostSize(host));
      tracked.halfWidth = this.hostHalfWidth(host, undefined, tracked.mustered, battle.ourFormation);
      ui.ourMarkers.push(tracked);
    });

    theirs.forEach((host, index) => {
      const marker = this.battleItems!.createArmyMarker(
        hostSize(host), false, rivalColor,
        Math.max(0, this.state.kingdoms.findIndex((k) => k.id === battle.kingdomId)),
        { ...hostKitFor(this.state, host), mustered: hostSize(host), shape: battle.theirFormation },
        this.battleBaseScale(),
      );
      marker.setPosition(lines.theirX, lane(index, theirs.length));
      field.add(marker);
      // They face us. On the map both hosts march the same way and it never mattered; on a field
      // where the two are looking at each other across thirty units it is the difference between
      // a battle and a queue. `faceTravel` reads the prop's own declared facing rather than
      // mirroring it blind, which is the rule for every baked prop in the game.
      faceTravel(marker, -1);
      const tracked = this.trackMarker(host.id, marker, hostSize(host));
      tracked.halfWidth = this.hostHalfWidth(host, undefined, tracked.mustered, battle.theirFormation);
      ui.theirMarkers.push(tracked);
      // Nothing on an enemy column is tappable any more. Concentrating the line on one of them was
      // a second cursor on a screen designed for one thumb, and it asked the player to *aim* in a
      // game whose whole language is standing orders — see `docs/14-five-shapes-two-dials.html`.
      // The cinnabar ring that marked the target goes with the order it belonged to.
    });
  }

  /**
   * The ground, flattened into a single texture once the fight opens.
   *
   * `buildBattleGround`'s own comment already says it is "static for the length of the fight" — and
   * it was, as far as *building* went. It was still three `Graphics` full of ridges, paddy, bamboo
   * and scatter being re-tessellated and re-uploaded on **every frame**, for a picture that never
   * changes between one beat and the next.
   *
   * Measured at 390x844 with everything else on screen: the fight ran at 33.5 ms a frame, and
   * hiding the ground alone took it to 16.7. Hiding both armies changed nothing at all — the
   * soldiers were never the cost.
   *
   * Lossless, which is the whole reason this is safe to do: those layers are already clipped by a
   * geometry mask to exactly `(content.x + 2, top + 2, width - 4, fieldHeight - 4)`, so a texture of
   * that rect holds precisely what was on screen and no more. Each source keeps its own alpha as it
   * is drawn in, and the texture composites at full strength, which is the same order of operations
   * the live layers had. Verified by pixel diff, not by argument.
   *
   * This is the same trick `MapScene.bakeStaticTerrain` plays for the world, for the same reason.
   */
  private bakeBattleGround(from: number): void {
    const ui = this.battleUi;
    if (!ui) return;
    // The A/B switch `verify-battle-ground-bake` flips to rebuild the same field unbaked. It cannot
    // get its reference by un-hiding the sources: the bake clears their geometry masks, and without
    // those the ridges, the pond and the bamboo all spill past the frame — which is the very thing
    // the masks were added for. The only honest reference is a field that never went through here.
    if (this.skipGroundBake) return;
    const { content, field } = ui;
    // A lost context nulls the GL bindings mid-draw; leave the live layers up and cost the frames
    // rather than throw. `MapScene` learned this one the hard way.
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (renderer?.contextLost) return;

    // Whole pixels. A texture landing on a half-pixel resamples everything inside it, which is a
    // broad, low-amplitude difference across the whole picture rather than an obvious fault.
    const x = Math.round(content.x + 2);
    const y = Math.round(content.y + 2);
    const width = Math.ceil(content.width - 4);
    const height = Math.ceil(ui.fieldHeight - 4);
    if (width <= 0 || height <= 0) return;

    type Hideable = Phaser.GameObjects.GameObject & { visible: boolean; setVisible(v: boolean): unknown };
    const added = field.list.slice(from) as Hideable[];
    // Only the things that were drawn. Two kinds of passenger live in this slice and neither is
    // art: `draw` does not consult `visible`, so an invisible layer baked in anyway; and the clip's
    // stencil pair write to the stencil buffer rather than to the picture.
    //
    // `isStencilModifier` and not `type`, which is the trap: a `Stencil` extends Container and
    // keeps *its* type string, so a name check catches the closing `StencilReference` and misses
    // the opening half. Measured, that is what it costs — the Stencil was baked into the texture
    // and then hidden along with the real layers, leaving a frame that subtracted a stencil layer
    // it had never added. The buffer wrapped below zero and the readout under the field went with
    // it: 14.5% of the field's pixels differed from the unbaked reference, against 5.4% before.
    const sources = added.filter(
      (obj) => obj.visible !== false && !(obj as { isStencilModifier?: boolean }).isStencilModifier,
    );
    if (sources.length === 0) return;

    // Supersampled, because a texture made in game units is drawn onto a canvas that renders at the
    // device ratio — every hairline in the ridges, the paddy bunds and the bamboo came back softer.
    // Measured against an unbaked rebuild of the same field: 14.2% of pixels differed at 1x and the
    // worst was 132/255, which is a visible change and not one anybody asked for.
    //
    // Same trick as `MapScene.bakeStaticTerrain`: scale the sources up, bake big, display small. A
    // Graphics scales its stroke widths with its geometry, so the lines land back at their own width.
    const SUPER = 2;
    const baked = this.add.renderTexture(x, y, width * SUPER, height * SUPER)
      .setOrigin(0, 0)
      .setScale(1 / SUPER);
    const scalable = sources as unknown as Array<{ setScale(v: number): unknown }>;
    for (const source of scalable) source.setScale(SUPER);
    // Drop the clip before drawing, and this is load-bearing rather than tidy.
    //
    // Under Phaser 3 the reason was that a geometry mask is a stencil pass and simply does not
    // survive `RenderTexture.draw` — the masked layers rendered as *nothing*, and the first attempt
    // lost the horizon ridges, the pagoda and the whole settlement. That is still exactly true of
    // the Canvas fallback, which is the only place a geometry mask is still live.
    //
    // Under WebGL the clip is now a stencil layer written by two objects of its own, and those are
    // filtered out of `sources` above rather than cleared off each layer — a stencil belongs to the
    // frame, not to the things it covers, so there is nothing on a source to drop.
    //
    // Either way the answer is safe for the same reason: the texture is created at exactly the rect
    // the clip cut to, so the RT's own bounds do the identical job. That equivalence is why this is
    // a performance change and not an art change; `verify-battle-ground-bake` holds it to it.
    type Maskable = Phaser.GameObjects.GameObject & { clearMask?(d?: boolean): unknown };
    for (const source of sources as Maskable[]) source.clearMask?.(false);
    try {
      baked.draw(sources, -x * SUPER, -y * SUPER);
      // Phaser 4 buffers the draw; `render` executes it. Before the sources are put back to
      // scale 1 and hidden below, or the buffer replays against layers that have already moved.
      baked.render();
    } catch {
      for (const source of scalable) source.setScale(1);
      baked.destroy();
      return;
    }
    for (const source of scalable) source.setScale(1);
    for (const source of sources) source.setVisible?.(false);
    ui.groundSources = sources;
    // At `from`, so it sits exactly where the layers it replaces stood — under the camps, the
    // fallen and the men.
    field.addAt(baked, from);
  }

  /**
   * Everything on the rails that a beat does *not* move.
   *
   * The rails used to be thrown away and rebuilt whole on every beat, which reads as cheap and
   * measured as anything but: 24.3 ms of a 35.2 ms beat at a 4x CPU throttle, 1.8 times a second —
   * two thirds of the screen's whole per-beat cost. Almost none of that work had a reason to
   * happen twice. Four `statBar`s each allocated a container and a graphics to draw two wobbled
   * strokes, and a rival's name was trimmed character by character with a `setText` and a width
   * read per character — every one of those forcing a canvas re-measure and a texture upload, for
   * a name that had not changed since the fight opened.
   *
   * So this builds the half that belongs to the *fight*, and `updateBattleRails` writes the half
   * that belongs to the beat: two strings and one graphics.
   */
  private battleRailsSignature(battle: AscentBattle): string {
    // Deliberately *not* including the telegraph or the arms verdict. Both change several times
    // in a fight and both are one line of text — putting them here rebuilt the panel, both names
    // and both rout marks to change a sentence, which is how this cost 5.8 ms a beat even after
    // the numbers had been lifted out of it. They are written in place instead.
    // The opening hold is not in here any more either: it used to print a note across the field,
    // and that note is the header's notice now — which is written in place and never rebuilds
    // anything.
    return [
      battle.kingdomName,
      battle.terrainEdge.toFixed(2),
      battle.ourAdvance + battle.theirAdvance >= 1 ? 'met' : 'apart',
    ].join(':');
  }

  private buildBattleRails(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui) return;
    const { content, readout } = ui;
    const { groundY } = ui.geometry;

    this.clearLayer(readout);
    ui.railsSignature = this.battleRailsSignature(battle);
    ui.ourStrength = undefined;
    ui.theirStrength = undefined;
    ui.clashMark = undefined;

    // Clash mark, only once they have actually met. Built here rather than on the beat because
    // its pulse is `repeat: -1` — one per fight, not one per exchange.
    if (battle.ourAdvance + battle.theirAdvance >= 1) {
      // High enough to clear the front rank. At 44 it was drawn straight across their heads, which
      // is the one place on the field guaranteed to have something in it.
      const clash = this.battleClashMark();
      clash.setPosition(0, groundY - 56);
      readout.add(clash);
      ui.clashMark = clash;
    }

    const readoutY = content.y + ui.fieldHeight + 8;
    readout.add(this.ui.panel(
      { x: content.x, y: readoutY, width: content.width, height: BATTLE_RAILS_HEIGHT },
      { border: INK_UI.softBrush },
    ));

    const barW = (content.width - 36) / 2;
    ui.railsGeom = { barW, readoutY, ourX: content.x + 12, theirX: content.x + barW + 24 };

    // The name is trimmed to what is left beside the *widest* number this fight can print, not
    // beside this beat's number. A rival is named by the generator and can be as long as "Lanh
    // Chua Phuong Bac", which ran straight through its own four-digit strength and printed
    // "Phuong Ba1493"; measuring against the opening strength keeps the fit honest and lets the
    // trim happen once instead of on every exchange.
    const rail = (x: number, widest: number, label: string): Phaser.GameObjects.Text => {
      const gauge = this.ui.label(0, -999, `${widest}`, 'label', { fontSize: '15px' });
      const room = barW - gauge.width - 6;
      gauge.destroy();

      const name = this.ui.label(x, readoutY + 6, label, 'caption', {});
      if (name.width > room) {
        let cut = label;
        while (cut.length > 1 && name.width > room) {
          cut = cut.slice(0, -1);
          name.setText(`${cut.trimEnd()}…`);
        }
      }
      readout.add(name);

      // The rout line, drawn on the heart bar rather than left implicit: "wavering" was a state
      // the simulation knew about and the screen never showed, so a line one exchange from
      // breaking looked exactly like one at half heart.
      const routMark = this.add.graphics();
      routMark.fillStyle(INK_UI.cinnabarDark, 0.9);
      routMark.fillRect(x + barW * (BATTLE_ROUT_MORALE / 100) - 1, readoutY + 40, 1.5, 9);
      readout.add(routMark);

      const strength = this.ui.label(x + barW, readoutY + 6, `${widest}`, 'label', {
        fontSize: '15px', align: 'right',
      }).setOrigin(1, 0);
      readout.add(strength);
      return strength;
    };
    ui.ourStrength = rail(ui.railsGeom.ourX, battle.ourStart, t('ascent.battle.ours'));
    ui.theirStrength = rail(ui.railsGeom.theirX, battle.theirStart, battle.kingdomName);

    // One graphics for all four measured lines, cleared and re-inked on the beat. Four containers
    // a beat was the single most expensive thing on this screen.
    const bars = this.add.graphics();
    readout.add(bars);
    ui.railsBars = bars;

    /**
     * The two loose lines that used to hang under the rails are gone, and both went somewhere the
     * player was already looking.
     *
     * The telegraph — *Lãnh Chúa Phương Bắc commits to nothing next beat* — is the header's notice
     * now, the one place on this screen reserved for the sentence that matters right this beat. The
     * arms verdict is in the readout band beside the dials, with the other reading about the order
     * last given. Between them they were a third and fourth red line on a screen that already had
     * two, floating in the gap between the rails and the dock and belonging to neither.
     *
     * The opening hold went the same way. It was printed across the sky over the battlefield, which
     * is a beautiful place for a sentence and a poor one for an instruction: the strip it was
     * telling the player to touch is at the other end of the screen, and the pulsing frame round
     * that strip was already doing the pointing.
     */

    // The ground's edge, computed since the day the screen shipped and printed nowhere. A player
    // deciding whether to intercept on high ground could not see what it bought them. It belongs
    // to the ground, not the beat, so it is written once.
    if (battle.terrainEdge > 1.01) {
      readout.add(this.ui.label(
        content.x + content.width / 2, readoutY + BATTLE_RAILS_HEIGHT + 3,
        t('ascent.battle.terrain', { mult: battle.terrainEdge.toFixed(2) }), 'caption',
        { fontSize: '10px', align: 'center' },
      ).setOrigin(0.5, 0));
    }
  }

  /**
   * The two numbers and the four bars - everything a beat actually moves.
   *
   * Two `setText`s and one `Graphics.clear()` plus four inked lines. The look is `InkUI.statBar`'s,
   * stroke for stroke and seed for seed, because it *is* those two calls - drawn into a graphics
   * that already exists instead of into one allocated for the purpose.
   */
  private updateBattleRails(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui?.railsBars?.active || !ui.railsGeom) return;
    const { barW, readoutY, ourX, theirX } = ui.railsGeom;
    const frame = this.battleFrame(battle);

    ui.ourStrength?.setText(`${Math.round(frame.ourNow)}`);
    ui.theirStrength?.setText(`${Math.round(frame.theirNow)}`);
    if (ui.clashMark?.active) {
      ui.clashMark.x = this.battleLines(frame.ourAdvance, frame.theirAdvance).seam;
    }

    const g = ui.railsBars;
    g.clear();
    const bar = (x: number, y: number, height: number, ratio: number, colour: number): void => {
      const mid = y + height / 2;
      const width = Math.max(1, height * 0.8);
      const seed = Math.round(x * 7 + y * 3 + barW);
      inkPath(g, [{ x, y: mid }, { x: x + barW, y: mid }], seed,
        { width, alpha: 0.2, colour: INK_UI.brush, wobble: 0.3, step: 14 });
      if (ratio > 0) {
        inkPath(g, [{ x, y: mid }, { x: x + Math.max(1.5, barW * Math.min(1, ratio)), y: mid }], seed + 1,
          { width, alpha: 0.88, colour, wobble: 0.45, step: 12 });
      }
    };
    const heartColour = (value: number): number => (
      value <= BATTLE_ROUT_MORALE + 10 ? INK_UI.cinnabar : INK_UI.gold);
    bar(ourX, readoutY + 28, 8, frame.ourNow / Math.max(1, battle.ourStart), INK_UI.jade);
    bar(theirX, readoutY + 28, 8, frame.theirNow / Math.max(1, battle.theirStart), ui.rivalColor);
    bar(ourX, readoutY + 42, 5, frame.ourMorale / 100, heartColour(frame.ourMorale));
    bar(theirX, readoutY + 42, 5, frame.theirMorale / 100, heartColour(frame.theirMorale));
  }

  /**
   * The mark over the seam, where the two lines are actually touching.
   *
   * **It was the character `⚔`, and that is a font, not a drawing.** Everything else on this screen
   * is cut from the same woodblock — the men, the camps, the banners, the paper itself — and in the
   * middle of it sat a glyph the platform chose: a flat outline on desktop Chromium, and on iOS a
   * full-colour emoji, rendered in Apple's palette at Apple's weight, over Đông Hồ paper. The one
   * mark on the screen that says "this is the fight" was the one mark that did not belong to it.
   *
   * Drawn now, in three pieces that each answer a different question:
   *
   *   the burst  — *something is happening here*. Sỏi son, breathing on its own clock so the mark
   *                is alive even in the second or two between beats.
   *   the blades — *what* is happening. Crossed, ink-edged, paper-bright so they read against both
   *                the pale ground and the dark blocks of men.
   *   the ring   — *now*. Fired per exchange by `strikeClash`, and the only part of the three that
   *                is tied to the simulation rather than to a timer.
   *
   * The three are separate objects on purpose: the burst's pulse is `repeat: -1` and the blades'
   * punch is a one-shot, and a single target cannot carry both without one stealing the other's
   * scale.
   */
  private battleClashMark(): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);

    // A soft ground first, so the mark has weight over a pale field and over a dark block of men
    // alike. Without it the blades were a thin white scratch on whatever happened to be behind.
    const halo = this.add.graphics();
    halo.fillStyle(INK_UI.cinnabar, 0.16);
    halo.fillCircle(0, 0, 19);
    container.add(halo);

    // Eight rays, alternating long and short, and turned off-axis so the star does not read as a
    // compass. Uneven lengths because a cut mark on a print is never symmetrical.
    const burst = this.add.graphics();
    burst.fillStyle(INK_UI.cinnabar, 0.9);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + 0.26;
      const reach = i % 2 === 0 ? 23 : 14.5;
      burst.fillTriangle(
        Math.cos(angle) * reach, Math.sin(angle) * reach,
        Math.cos(angle + 0.3) * 5.5, Math.sin(angle + 0.3) * 5.5,
        Math.cos(angle - 0.3) * 5.5, Math.sin(angle - 0.3) * 5.5,
      );
    }
    container.add(burst);
    // Never all the way down: the floor of 0.55 is what keeps the mark present between beats. At
    // 0.4 it read as a fault in the paper on the frames it was caught low.
    this.tweens.add({
      targets: burst,
      scale: { from: 0.86, to: 1.16 },
      alpha: { from: 0.95, to: 0.55 },
      angle: { from: -7, to: 7 },
      duration: 640,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    /**
     * One blade along +x, pommel behind the origin and point in front of it.
     *
     * The pair are hung at −45° and −135°, which is the heraldic arrangement: both points up, both
     * hilts down, and the crossing at the middle. First attempt used ±45°, so the points were at
     * opposite corners and the two hilts made a dark blob exactly where the eye lands. The guard is
     * a short bar rather than a full cross-piece for the same reason — at eighteen points across
     * there is no room for a hilt that is drawn in detail.
     */
    const blade = (angle: number): Phaser.GameObjects.Graphics => {
      const g = this.add.graphics();
      g.fillStyle(INK_UI.brush, 1);
      g.fillRect(-13, -1.3, 6.5, 2.6);
      g.fillCircle(-13.2, 0, 1.9);
      g.fillRect(-6.8, -3.8, 2.2, 7.6);
      // Paper-bright, so the blade reads against the dark blocks of men it stands between.
      g.fillStyle(INK_UI.parchment, 1);
      g.beginPath();
      g.moveTo(-4.2, -2.4);
      g.lineTo(10, -2.1);
      g.lineTo(15.5, 0);
      g.lineTo(10, 2.1);
      g.lineTo(-4.2, 2.4);
      g.closePath();
      g.fillPath();
      g.lineStyle(1.3, INK_UI.brush, 0.95);
      g.strokePath();
      g.setRotation(angle);
      return g;
    };
    const blades = this.add.container(0, 0);
    blades.add([blade(-Math.PI / 4), blade(-Math.PI * 0.75)]);
    blades.setData('role', 'blades');
    container.add(blades);

    return container;
  }

  /**
   * One exchange, struck.
   *
   * A ring off the point of contact and a punch through the blades, fired from `reactToBeat` — so
   * the mark moves because the fight moved, not because a timer said so. Both are one-shots that
   * clean themselves up: the ring destroys itself, and the punch lands back on scale 1.
   *
   * Deliberately small. This fires 1.8 times a second for the length of a siege, and anything that
   * reads as an explosion at that rate stops being feedback within about four beats.
   */
  private strikeClash(): void {
    const mark = this.battleUi?.clashMark;
    if (!mark?.active) return;

    const ring = this.add.graphics();
    ring.lineStyle(2.5, INK_UI.cinnabar, 0.95);
    ring.strokeCircle(0, 0, 14);
    // Over the blades, not behind them. Behind, the burst's own rays swallowed it and the beat had
    // no visible answer at all — the shockwave has to leave the mark to read as one.
    mark.add(ring);
    this.tweens.add({
      targets: ring,
      // Starts outside the burst rather than inside it. The rays reach 23 points, so a ring born at
      // 8 spends the first third of its life invisible and then appears from nowhere.
      scale: { from: 1.25, to: 3.2 },
      alpha: { from: 0.95, to: 0 },
      duration: 460,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });

    const blades = mark.list.find(
      (child) => (child as Phaser.GameObjects.Container).getData?.('role') === 'blades',
    );
    if (!blades) return;
    this.tweens.killTweensOf(blades);
    this.tweens.add({
      targets: blades,
      scale: { from: 1.34, to: 1 },
      angle: { from: -7, to: 0 },
      duration: 280,
      ease: 'Back.easeOut',
    });
  }

  /**
   * What each side's line is doing, said over its own men.
   *
   * **This is the sentence the whole fight turns on, and it used to be printed a hundred and
   * eighty points away from the thing it was about.** "their spears are set" sat in a band under
   * the rails, in the dock, between a price and a lock counter — so the player read a caption,
   * looked up at two blocks of figures, and had to take on trust which of them it referred to.
   * There was no line at all for our own shape: the only way to know what your own host was
   * standing in was to look at which chip was filled.
   *
   * A bubble over the men answers both at once. It is attached to the host it belongs to, both
   * sides get one, and the answer to "who is doing that" is where the tail points. The manga
   * device is deliberate rather than decorative — the fight is the one screen in this game with
   * two *actors* on it, and a speech bubble is the one drawing everybody already reads as "this
   * one, not that one".
   *
   * Rebuilt only when a sentence changes. Across a whole engagement that is four or five times;
   * a bubble redrawn on the beat would flicker under a shape that had not moved.
   */
  private updateBattleBubbles(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui) return;

    const read = battleTelegraph(this.state);
    const walking = (battle.reformBeats ?? 0) > 0;
    const ourShape = walking && battle.formationTarget ? battle.formationTarget : battle.ourFormation;
    const ours = walking
      ? t('ascent.battle.bubbleReforming', {
        shape: t(`ascent.formation.${ourShape}.verb` as Parameters<typeof t>[0]),
      })
      : t(`ascent.formation.${battle.ourFormation}.ours` as Parameters<typeof t>[0]);
    // What they are *standing in*, not what they are walking into. The second is a warning and
    // belongs in the notice; a bubble says what the men under it are doing now.
    const theirShape = read?.formation ?? battle.theirFormation;
    const theirs = t(`ascent.formation.${theirShape}.threat` as Parameters<typeof t>[0]);

    /**
     * Redrawn when the sentence changes — or when the host it points at has walked far enough that
     * the tail no longer lands on it.
     *
     * The tail is part of the closed path, so it cannot be moved without redrawing the bubble, and
     * the two lines close across most of the field over an engagement. Ten units is under half a
     * host block, so the spike is always plainly on the men; over a whole engagement it fires a
     * handful of times rather than 1.8 times a second.
     */
    const frame = this.battleFrame(battle);
    const lines = this.battleLines(frame.ourAdvance, frame.theirAdvance);
    /**
     * Each side decides for itself whether it needs redrawing, and why.
     *
     * *Said* and *merely moved* are worth telling apart. A new sentence is an order being given and
     * gets announced; a bubble following its host across the field must not pop every time the line
     * advances ten points. And a shout in flight outranks a walk: `updateBattle` runs on the battle
     * clock *and* on every state change an order causes, so an order fires two or three redraws
     * inside the first two hundred milliseconds, each one replacing the popping bubble with a
     * settled one.
     *
     * Nothing is announced on the opening frame — the fight has not said anything yet, it is
     * showing what both sides are already standing in.
     */
    const shouting = this.time.now - ui.bubbleShoutAt < 420;
    const opening = ui.bubbleSaid.ours === '' && ui.bubbleSaid.theirs === '';
    const sides = [
      { side: 'ours' as const, text: ours, at: lines.ourX },
      { side: 'theirs' as const, text: theirs, at: lines.theirX },
    ];
    for (const { side, text, at } of sides) {
      const spoke = ui.bubbleSaid[side] !== text;
      const walked = Math.abs(at - ui.bubbleAt[side]) > 10;
      if (!spoke && (shouting || !walked) && ui.bubbleOf[side]?.active) continue;
      ui.bubbleSaid[side] = text;
      ui.bubbleAt[side] = at;
      const previous = ui.bubbleOf[side];
      if (previous) {
        this.killTweensDeep(previous);
        previous.destroy();
      }
      const made = this.battleBubble(
        at, side, text, spoke && !opening, side === 'ours' ? ourShape : theirShape,
      );
      ui.bubbles.add(made);
      ui.bubbleOf[side] = made;
    }
  }

  /**
   * One bubble: a printed blob with a spike pointing down at the host that is speaking.
   *
   * Drawn through `printedShape` like every other surface in the game rather than as a rounded
   * rectangle, so it belongs to the same woodblock as the men underneath it. The outline is an
   * eight-point sheet with the tail spliced into its bottom edge — one closed path, so the wobble
   * runs continuously round the spike instead of stopping at a seam.
   */
  private battleBubble(
    anchorX: number, side: 'ours' | 'theirs', text: string, announce = false,
    shape?: BattleFormation,
  ): Phaser.GameObjects.Container {
    const ui = this.battleUi!;
    const { content } = ui;
    const { groundY } = ui.geometry;
    const fieldTop = content.y;

    const label = this.ui.label(0, 0, text, 'caption', {
      fontSize: '9.5px',
      align: 'center',
      color: side === 'ours' ? INK_UI_HEX.inkText : '#8a2a1b',
      wordWrap: { width: Math.round(content.width * 0.40) },
    }).setOrigin(0, 0);

    /**
     * The shape's own glyph, inside the bubble, beside the words.
     *
     * The same mark the chip carries and the same mark the ring is drawn from — so `their spears
     * are set` and the SPEARS chip a thumb is about to press are visibly the same thing. The
     * sentence is the reading; the glyph is what makes it findable in the row below without
     * reading anything at all.
     *
     * Tinted with the type it stands next to, which is the screen's existing rule: ink for us,
     * sỏi son for them.
     */
    const GLYPH = 13;
    const ink = side === 'ours' ? INK_UI.brush : INK_UI.cinnabar;
    const glyph = shape ? drawCardIcon(this, FORMATION_ICON[shape], ink) : undefined;
    glyph?.setScale(GLYPH / CARD_ICON_SIZE);
    const inner = (glyph ? GLYPH + 5 : 0) + label.width;

    const width = Math.min(content.width * 0.54, inner + 18);
    const height = label.height + 11;
    /**
     * Centred over the host that is speaking, and kept on its own half of the field.
     *
     * Pinned to the two edges first, which looked right on the opening frame and wrong from about
     * the fourth beat: the lines close across most of the field, and a bubble that cannot move has
     * a tail clamped to its own edge, so the spike ends up pointing at bare ground behind the men.
     *
     * The half-field clamp is what keeps the two apart once the lines meet in the middle — at that
     * point both hosts are within thirty units of each other and two bubbles that simply followed
     * them would be drawn on top of one another.
     */
    const mid = content.x + content.width / 2;
    const x = side === 'ours'
      ? Phaser.Math.Clamp(anchorX - width / 2, content.x + 4, mid - 3 - width)
      : Phaser.Math.Clamp(anchorX - width / 2, mid + 3, content.x + content.width - 4 - width);
    /**
     * High enough to clear the men, low enough to still be over them.
     *
     * 78 is measured off the tallest host block this screen draws. The clamp is what keeps it
     * honest on a short phone: `GAME_HEIGHT` goes to 620, where the field is at its 150 floor and
     * a bubble hung 78 above the line would be off the top of the frame entirely.
     */
    const bottom = Math.max(fieldTop + height + 6, groundY - 78);
    const y = bottom - height;

    const cut = 7;
    const tailX = Phaser.Math.Clamp(anchorX, x + 14, x + width - 14);
    /**
     * The container sits on the **tip of the tail**, and everything is drawn relative to it.
     *
     * Not a tidiness point: a Phaser container has no origin, so it scales and rotates about its
     * own position. Parked at (0, 0) with the bubble drawn in screen coordinates, a pop would fling
     * the whole thing in from the corner of the sheet. Anchored at the tail, the same tween reads
     * as the words coming out of the man who is saying them.
     */
    const anchor = { x: tailX, y: bottom + 13 };
    const container = this.add.container(anchor.x, anchor.y);
    const px = (value: number): number => value - anchor.x;
    const py = (value: number): number => value - anchor.y;

    const sheet = this.add.graphics();
    printedShape(sheet, [
      { x: px(x + cut), y: py(y) },
      { x: px(x + width - cut), y: py(y) },
      { x: px(x + width), y: py(y + cut) },
      { x: px(x + width), y: py(bottom - cut) },
      { x: px(x + width - cut), y: py(bottom) },
      // The spike, spliced into the bottom edge on its way back to the left.
      { x: px(tailX + 6), y: py(bottom) },
      { x: 0, y: 0 },
      { x: px(tailX - 7), y: py(bottom) },
      { x: px(x + cut), y: py(bottom) },
      { x: px(x), y: py(bottom - cut) },
      { x: px(x), y: py(y + cut) },
    ], INK_UI.parchment, Math.round(x * 13 + y), {
      fillAlpha: 0.97, width: 1.4, alpha: 0.85, colour: INK_UI.brush, wobble: 0.6, step: 9,
    });
    container.add(sheet);
    // Glyph and words as one group, centred together — not the words centred with a glyph hung off
    // them, which reads as a bubble with something stuck to its side.
    const groupX = x + (width - inner) / 2;
    if (glyph) {
      glyph.setPosition(px(groupX + GLYPH / 2), py(y + 5 + label.height / 2));
      container.add(glyph);
    }
    label.setPosition(px(groupX + (glyph ? GLYPH + 5 : 0)), py(y + 5));
    container.add(label);
    if (announce) this.shoutBubble(container, side);
    return container;
  }

  /**
   * A bubble arriving as an order rather than as a caption.
   *
   * **A new sentence in these bubbles is somebody shouting.** The player taps SPEARS and a line of
   * men two hundred points away begins to re-form; the only thing on screen that says so
   * immediately is the bubble above them, and it was appearing between one frame and the next —
   * indistinguishable from the same words having been there all along, which is exactly the
   * complaint the tap feedback on the chips was added to answer.
   *
   * So it is given the shape of the act: it snaps out of the man's mouth, overshoots, and settles.
   * Three things, none of them decorative —
   *
   *   the pop    — `Back.easeOut` from a quarter size, about the tail. An order is sudden.
   *   the recoil — a lean the wrong way that rights itself, the way a shouted word has a body
   *                behind it. Ours leans forward into the enemy, theirs the other way.
   *   the strokes— manga speed lines off the tail, in the side's own colour. They live 320 ms and
   *                destroy themselves; nothing here survives the next redraw.
   *
   * Fires on a *changed sentence* only. Following a host across the field must not pop, and the
   * opening frame must not pop at all — nobody has said anything yet.
   */
  private shoutBubble(container: Phaser.GameObjects.Container, side: 'ours' | 'theirs'): void {
    if (this.battleUi) this.battleUi.bubbleShoutAt = this.time.now;
    const lean = side === 'ours' ? 7 : -7;
    container.setScale(0.26).setAngle(lean);
    this.tweens.add({
      targets: container,
      scale: 1,
      angle: 0,
      duration: 380,
      ease: 'Back.easeOut',
    });

    /**
     * Speed lines off the tail, fanning **down** toward the men and drawn over everything.
     *
     * Both halves of that were wrong first time. The container's origin is the tail *tip*, which
     * hangs below the bubble — so a fan drawn upward pointed straight into the bubble's own body,
     * and putting it at index 0 hid what little of it stuck out. Downward and on top, they read as
     * the word leaving the man who shouted it.
     */
    const strokes = this.add.graphics();
    const colour = side === 'ours' ? INK_UI.brush : INK_UI.cinnabar;
    strokes.lineStyle(1.6, colour, 0.9);
    for (let i = 0; i < 4; i += 1) {
      const angle = Math.PI / 2 + (i - 1.5) * 0.44;
      strokes.lineBetween(
        Math.cos(angle) * 5, Math.sin(angle) * 5,
        Math.cos(angle) * 13, Math.sin(angle) * 13,
      );
    }
    container.add(strokes);
    this.tweens.add({
      targets: strokes,
      scale: { from: 0.7, to: 1.8 },
      alpha: { from: 0.9, to: 0 },
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => strokes.destroy(),
    });
  }

  /**
   * The newest line of the fight's own account, repeated in the header.
   *
   * The ribbon along the foot of the field keeps it too — that is where it belongs as atmosphere,
   * printed over the ground it is describing. But it is 10-point type on a 0.82 plate over hatching,
   * and photographed off a real handset the older of its two lines cannot be read at all. The
   * header carries the same sentence on plain paper, and the two never disagree because both are
   * written from `battle.log` on the same beat.
   *
   * Shrunk to fit rather than wrapped: the band's rows are reserved heights, and a second line here
   * would push the field down every time the fight said something long.
   */
  private updateBattleLogLine(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui?.logLine?.active) return;
    const newest = battle.log[battle.log.length - 1] ?? '';
    if (ui.logLine.text === newest) return;
    ui.logLine.setFontSize(10);
    ui.logLine.setText(newest);
    const room = GAME_WIDTH - 20 - ui.logLine.x;
    for (let size = 9.5; size >= 8 && ui.logLine.width > room; size -= 0.5) {
      ui.logLine.setFontSize(size);
    }
  }

  /**
   * The fight's one red line, in the header band.
   *
   * Everything urgent this screen had to say used to be said somewhere different: the opening hold
   * across the sky over the battlefield, the enemy's telegraph in a loose line under the rails, the
   * stance lock as an eight-point note tucked against the right edge of the dock. Three places for
   * one job, none of them where the eye starts.
   *
   * Ranked, and only ever one at a time. A notice strip that stacks is a notice strip nobody reads
   * — and the ranking is the order the player can act on them: the hold blocks the fight entirely,
   * then what the enemy is walking into, then what they will do next beat.
   *
   * The stance lock is deliberately *not* in the ranking. It has its own eight-point note against
   * the strip it greys out, which is where a refused control should explain itself; repeated up
   * here it was the same four words printed twice on one screen.
   */
  private updateBattleNotice(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui?.notice?.active) return;

    const read = battleTelegraph(this.state);
    let line = '';
    if (this.battleAwaitingOrder) {
      line = t('ascent.battle.holdNote');
    } else if (read?.next) {
      line = t('ascent.battle.theyForm', {
        kingdom: battle.kingdomName,
        shape: t(`ascent.formation.${read.next}.full` as Parameters<typeof t>[0]),
        n: String(read.beatsLeft),
      });
    } else if (read) {
      line = t(`ascent.battle.theyWill.${read.stance}` as Parameters<typeof t>[0], {
        kingdom: battle.kingdomName,
      });
    }
    if (ui.notice.text === line) return;
    // One line, shrunk to fit — see `battleHeaderFrame`. A rival with a four-word name makes the
    // telegraph the longest sentence this band ever prints.
    ui.notice.setFontSize(10);
    ui.notice.setText(line);
    const room = GAME_WIDTH - 20 - ui.notice.x;
    for (let size = 9.5; size >= 8 && ui.notice.width > room; size -= 0.5) {
      ui.notice.setFontSize(size);
    }
  }

  /**
   * The two dials, as a fixed dock ranked by how often each is touched.
   *
   * This used to be a three-way stance ring plus five buttons, and the ring did two jobs at once:
   * it carried the matchup *and* the tempo, which is why two of its three options had the same
   * exchange ratio to three decimals. `docs/14-five-shapes-two-dials.html` splits them, and the
   * split has a layout consequence that is the whole of this method:
   *
   *   **Formation is worked three to five times an engagement. Stance is worked once or twice.**
   *
   * So formation gets the widest, lowest, largest band — the arc a thumb covers without the hand
   * shifting — and stance sits above it, smaller, further away, with a lock counter in its label.
   * The two exits are not here at all; see `buildBattleExits`.
   *
   * Rebuilt only when `battleOrderSignature` changes, never on the beat: a card destroyed between
   * press and release never fires.
   */
  private buildBattleOrders(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui) return;
    const { content, orders } = ui;

    this.clearLayer(orders);
    ui.orderSignature = this.battleOrderSignature(battle);

    // 10, down from 16. The stance strip and everything under it move up by six, which is six
    // more between the formation chips and the two buttons that end the fight.
    const dockY = content.y + ui.fieldHeight + 8 + BATTLE_RAILS_HEIGHT + 10;
    const read = battleTelegraph(this.state);

    // ── the readout ──────────────────────────────────────────────────────
    this.buildBattleReadout(battle, dockY);

    // ── the slow dial ────────────────────────────────────────────────────
    // The dock count, where the stance-lock counter used to sit. Wind is the resource the player
    // is spending, so it gets a running number — and 2/5 in red is the tell that flips a player
    // from pressing to steadying before the dock goes dark on them.
    const wind = battleWindView(battle);
    const readyShapes = FORMATION_RING.filter((shape) => wind.takeable[shape]).length;
    orders.add(this.ui.label(
      content.x + content.width - 2, dockY + BATTLE_READOUT_HEIGHT - 1,
      t('ascent.battle.dockReady', { n: String(readyShapes) }), 'caption',
      {
        fontSize: '8px',
        color: readyShapes <= 2
          ? `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}` : INK_UI_HEX.mutedText,
      },
    ).setOrigin(1, 1));

    const stanceY = dockY + BATTLE_READOUT_HEIGHT + 3;
    // Recorded where they are computed. See `coachBounds`.
    // Recorded from where the header put it, not recomputed: the clock is the one part of this
    // screen that is no longer laid out against `content` at all.
    ui.coachBounds.pips = ui.pipBounds;
    // The field, because the bubbles over the two hosts live on it and the coach has to be able
    // to point at what each side is saying.
    ui.coachBounds.field = battleFieldBox(content, ui.fieldHeight);
    ui.coachBounds.rails = {
      x: content.x,
      y: content.y + ui.fieldHeight + 8,
      width: content.width,
      height: BATTLE_RAILS_HEIGHT,
    };
    ui.coachBounds.readout = {
      x: content.x, y: dockY, width: content.width, height: BATTLE_READOUT_HEIGHT,
    };
    ui.coachBounds.stance = {
      x: content.x, y: stanceY, width: content.width, height: BATTLE_STANCE_HEIGHT,
    };
    const stances: FieldStance[] = ['withdraw', 'defend', 'balanced', 'press'];
    const segGap = 5;
    const segW = (content.width - segGap * (stances.length - 1)) / stances.length;
    stances.forEach((id, index) => {
      const x = content.x + index * (segW + segGap);
      const bounds = { x, y: stanceY, width: segW, height: BATTLE_STANCE_HEIGHT };
      // What is *pending* reads as chosen: the player pressed it, and it lands next beat.
      // No stance is ever refused — the four-beat lock is retired. The dial that exists to cut
      // your losses must never be the dial the game takes away, and now that the stance carries
      // the wind recovery rate, locking it would freeze the player out of their own dock.
      const chosen = (battle.stancePending ?? battle.stance) === id;
      const tile = this.ui.crayonTile(bounds, { selected: chosen });
      orders.add(tile);
      orders.add(this.ui.label(
        x + segW / 2, stanceY + BATTLE_STANCE_HEIGHT / 2 - 4,
        t(`ascent.stance.${id}` as Parameters<typeof t>[0]), 'label',
        {
          fontSize: '10.5px',
          align: 'center',
          color: chosen ? `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}` : INK_UI_HEX.inkText,
        },
      ).setOrigin(0.5));
      // The rate this stance lets the dock breathe at — since the retier, the most consequential
      // number on this strip, so it is printed on every segment, always. Cinnabar on x0: pressing
      // is the one stance that spends the dock without refilling any of it.
      const rate = BATTLE_STANCE_RECOVERY[id] ?? 1;
      orders.add(this.ui.label(
        x + segW / 2, stanceY + BATTLE_STANCE_HEIGHT - 3,
        t('ascent.battle.recovery', { n: String(rate) }), 'caption',
        {
          fontSize: '7px',
          align: 'center',
          color: rate === 0 ? `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}`
            : rate >= 2 ? '#4c5f45' : INK_UI_HEX.mutedText,
        },
      ).setOrigin(0.5, 1));
      const hit = this.add.zone(x, stanceY, segW, BATTLE_STANCE_HEIGHT).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        this.releaseBattleHold();
        this.events.emit('ui:battle-order', `stance:${id}`);
      });
      orders.add(hit);
    });

    // ── the fast dial ────────────────────────────────────────────────────
    // No caption. The chips carry an icon and a verb now, and the readout band above says what the
    // enemy is doing in words — between them there is nothing left for a label to add.
    const formY = stanceY + BATTLE_STANCE_HEIGHT + BATTLE_DIAL_GAP;
    ui.coachBounds.formation = {
      x: content.x, y: formY, width: content.width, height: BATTLE_FORMATION_HEIGHT,
    };
    // While the fight is held waiting for its first order, say which strip is the one to touch.
    // The note in the field tells the player to pick a formation; this is the strip it means, and
    // without it "give the first order" is a sentence with no object.
    if (this.battleAwaitingOrder) {
      const call = this.add.graphics();
      call.lineStyle(2, INK_UI.cinnabar, 0.9);
      call.strokeRoundedRect(
        content.x - 3, formY - 3, content.width + 6, BATTLE_FORMATION_HEIGHT + 6, 8,
      );
      orders.add(call);
      this.tweens.add({
        targets: call, alpha: { from: 1, to: 0.25 }, duration: 700, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    const reforming = (battle.reformBeats ?? 0) > 0;
    // Their *target* is what a shape has to answer — countering the thing they are walking out of
    // is the classic way to arrive one beat too late.
    const answering = read ? (read.next ?? read.formation) : undefined;
    const chipGap = 5;
    const chipW = (content.width - chipGap * (FORMATION_RING.length - 1)) / FORMATION_RING.length;

    // Laid out in ring order, so the two shapes that beat what they are forming are always
    // adjacent. The counter rule is legible from the layout alone — with one honest caveat: the
    // "one left of theirs" reading wraps at the strip's end, so the rims below are the real
    // carrier of the rule, and they never wrap.
    FORMATION_RING.forEach((id, index) => {
      const x = content.x + index * (chipW + chipGap);
      const bounds = { x, y: formY, width: chipW, height: BATTLE_FORMATION_HEIGHT };
      const held = battle.ourFormation === id && !reforming;
      const walking = reforming && battle.formationTarget === id;
      // Winded: the shape has no breath back yet and is not the match. The same fade and the same
      // refused tap the retired `gone` state had — but with a countdown printed on it, and it
      // always comes back. `docs/18` records what this replaced and why.
      const gone = !wind.takeable[id] && !held && !walking;

      const tile = this.ui.crayonTile(bounds, { selected: held || walking });
      if (gone) tile.setAlpha(0.32);
      orders.add(tile);

      // Five readings, almost no text: filled = held, full jade rim = the STRONG answer to their
      // telegraph, faint jade = the soft answer at half tilt, red rim = loses to it, faded = the
      // shape is getting its breath back.
      let rim = 0;
      let rimAlpha = 0.95;
      if (!gone && answering && id !== answering) {
        const tier = formationTier(id, answering);
        if (tier > 0) {
          rim = INK_UI.jade;
          rimAlpha = tier === 2 ? 0.95 : 0.5;
        } else if (tier < 0) {
          rim = INK_UI.cinnabar;
          rimAlpha = tier === -2 ? 0.95 : 0.5;
        }
      }
      if (rim) {
        const edge = this.add.graphics();
        edge.lineStyle(2, rim, rimAlpha);
        edge.strokeRoundedRect(x + 1, formY + 1, chipW - 2, BATTLE_FORMATION_HEIGHT - 2, 6);
        orders.add(edge);
      }

      // The arrangement the shape puts its men in, drawn. A word has to be read and recognised;
      // a shape only has to be recognised, so the icon is what carries the chip at a glance and
      // the two names underneath are what the glance turns into knowledge over a few fights.
      const ink = held || walking ? INK_UI.cinnabar
        : gone ? INK_UI.softBrush
          : rim === INK_UI.jade ? INK_UI.jade : INK_UI.brush;
      /**
       * The second line is a *state*, not a name — and only when there is one.
       *
       * The Vietnamese name used to live here permanently, on the theory that a player picks the
       * vocabulary up by association. In practice it put a word nobody could read directly under
       * every word they could, five times across the busiest strip on the screen, and it did it
       * while the line beneath the chip was trying to say "re-forming · 2". Two lines of type on a
       * 52-point chip, and the one that mattered was the one that only sometimes appeared.
       *
       * So the shape's name is the icon and the verb, and this line is kept clear for the three
       * things that are true only sometimes and change what the player should press. The chip
       * shifts up when it has nothing to say, so an ordinary chip is a glyph and a word centred in
       * their own box rather than a heading over an empty line.
       */
      /**
       * The ring, told one chip at a time, keyed to the shape you are actually holding.
       *
       * The rims answer *what should I press this round* — they are drawn against what the enemy
       * is forming. They do not answer the other question a player has, which is what their own
       * shape is good and bad against, and there was nowhere on this screen that did.
       *
       * Every shape beats two and loses to two, but the *nearest* of each is the one worth naming:
       * one step round the ring either way. So exactly two of the other four chips are marked, in
       * words rather than in a colour code — a player who can read the strip does not have to be
       * taught it. State lines win the slot when there is one, because `re-forming · 2` is about
       * this beat and this is about the rules.
       */
      // The shape being *taken*, not the one being left — `reforming` is the side's flag, where
      // `walking` is this one chip's. A player who has just ordered Thế Xung wants to know what Thế
      // Xung is good against; what the men are still standing in is on its way out.
      const mine = reforming && battle.formationTarget ? battle.formationTarget : battle.ourFormation;
      // Positive: the shape I hold beats this chip; negative: this chip beats me. ±2 strong, ±1 soft.
      const myTier = formationTier(mine, id);
      let noteColour: string | undefined;
      let note = '';
      if (walking) note = t('ascent.battle.reforming', { n: String(battle.reformBeats ?? 0) });
      else if (gone) note = t('ascent.battle.winded', { n: String(wind.ours[id]) });
      else if (myTier === 2) { note = t('ascent.battle.weBeatIt'); noteColour = '#3f5a3a'; }
      else if (myTier === 1) { note = t('ascent.battle.weBeatItSoft'); noteColour = '#4c5f45'; }
      else if (myTier === -2) { note = t('ascent.battle.itBeatsUs'); noteColour = '#8a2a1b'; }
      else if (myTier === -1) { note = t('ascent.battle.itBeatsUsSoft'); noteColour = '#8a2a1b'; }

      /**
       * The order at the top, the glyph under it, the state line pinned to the floor.
       *
       * Glyph-first read better in English, where every verb is one short word: the eye landed on
       * a picture and the word underneath confirmed it. In Vietnamese the same verb is two words
       * that wrap, so the picture was pushed down onto the state line and `đang chuyển thế · 1`
       * printed out of the bottom of the chip. The word a player is looking *for* now starts at a
       * fixed y on every chip in the row, whatever language it is in and however many lines it
       * takes, and the line that only sometimes appears has the floor to itself.
       *
       * Measured rather than placed at written-down offsets, for the same reason.
       */
      const GLYPH = 15;
      const verb = this.ui.label(
        0, 0, t(`ascent.formation.${id}.verb` as Parameters<typeof t>[0]), 'label',
        {
          fontSize: '10px',
          align: 'center',
          wordWrap: { width: chipW - 2 },
          color: held || walking ? `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}`
            : gone ? INK_UI_HEX.mutedText : INK_UI_HEX.inkText,
        },
      ).setOrigin(0.5, 0);
      /**
       * One line, shrunk to fit — never wrapped.
       *
       * Wrapping was the whole of the remaining overlap. `đang chuyển thế · 1` is 66 points at 8px
       * in a 66-point chip, so it took two lines, and two lines of state under two lines of a
       * Vietnamese order left the glyph nowhere to be but on top of one of them. A state note is a
       * glance, not a sentence: it can afford to be small, and it cannot afford to be tall.
       */
      const noteLabel = note
        ? this.ui.label(0, 0, note, 'caption', {
          fontSize: '8px',
          align: 'center',
          color: noteColour ?? (held || walking ? '#8a2a1b'
            : rim === INK_UI.jade ? '#4c5f45'
              : rim === INK_UI.cinnabar ? '#8a2a1b' : INK_UI_HEX.mutedText),
        }).setOrigin(0.5, 0)
        : undefined;
      if (noteLabel) {
        for (let size = 8; size >= 6.5 && noteLabel.width > chipW - 6; size -= 0.5) {
          noteLabel.setFontSize(size);
        }
      }

      // The floor the state line keeps for itself. Thirteen when there is nothing to print, so the
      // glyph does not hop up and down the chip as a shape starts and finishes re-forming — and
      // measured off the label itself when there is, because a shrunk line is shorter than 13.
      const FLOOR = noteLabel ? Math.max(13, noteLabel.height + 5) : 13;
      // The order starts at the same y on every chip in the row — that is the whole point of
      // putting it first, and centring the pair instead would set `DỰNG GIÁO` a line lower than
      // `XUNG PHONG` beside it. The glyph then takes the middle of whatever is left under it, so a
      // one-line chip does not end up with a hole in its floor.
      const top = formY + 5;
      const glyphBand = { from: top + verb.height + 1, to: formY + BATTLE_FORMATION_HEIGHT - FLOOR };

      verb.setPosition(x + chipW / 2, top);
      orders.add(verb);

      // Drawn at 15 where there is 15 to draw it in, and at whatever is left where there is not.
      // A Vietnamese order that wraps to two lines over a state line leaves about fourteen points
      // between them, and a glyph that insisted on its full size took the difference out of the
      // note underneath it.
      const glyphSize = Math.min(GLYPH, Math.max(9, glyphBand.to - glyphBand.from));
      const glyph = drawCardIcon(this, FORMATION_ICON[id], ink);
      glyph.setPosition(x + chipW / 2, (glyphBand.from + glyphBand.to) / 2)
        .setScale(glyphSize / CARD_ICON_SIZE);
      if (gone) glyph.setAlpha(0.5);
      orders.add(glyph);

      if (noteLabel) {
        noteLabel.setPosition(
          x + chipW / 2, formY + BATTLE_FORMATION_HEIGHT - 3 - noteLabel.height,
        );
        orders.add(noteLabel);
      }

      // ── the order in flight ────────────────────────────────────────────
      //
      // A formation is instant to order and slow to arrive, and until now the screen said neither.
      // Three marks, because three different things are true at three different moments and
      // merging them tells the player the wrong one:
      //
      //   the bar   — it is walking, and this is how much of the walk is left.
      //   the flare — it arrived. The one that means the shape has actually changed.
      //
      // There used to be a third, a small sỏi son square in the chip's top corner meaning "the
      // order was issued". It went, and the question that killed it was a player's: *what is the
      // red square?* By the time it appeared the chip already said `chuyển thế · 2` in words, one
      // line below it, and `stampFormationChip` had already answered the same thing far more
      // loudly on the tap itself. Three marks, two of them saying what a sentence was saying.
      if (walking) {
        const total = Math.max(1, battle.reformTotalBeats ?? battle.reformBeats ?? 1);
        const done = Math.max(0, Math.min(1, 1 - (battle.reformBeats ?? 0) / total));

        // Drawn from `reformBeats`, never tweened. `battleOrderSignature` includes that clock, so
        // this strip is torn down and rebuilt on every beat of a re-form and a tween would restart
        // each time — a bar that runs the wrong length is worse than no bar at all.
        //
        // Track first, then fill. A trained host re-forms in a single beat, where the fill is zero
        // wide for the whole of the walk: without the track there would be nothing on the chip at
        // all in the commonest case, which is the exact complaint this is here to answer.
        const bar = this.add.graphics();
        bar.fillStyle(INK_UI.cinnabar, 0.22);
        bar.fillRect(x + 2, formY + BATTLE_FORMATION_HEIGHT - 4, chipW - 4, 2.5);
        bar.fillStyle(INK_UI.cinnabar, 0.95);
        bar.fillRect(x + 2, formY + BATTLE_FORMATION_HEIGHT - 4, (chipW - 4) * done, 2.5);
        orders.add(bar);
      }

      // ── the breath coming back ─────────────────────────────────────────
      //
      // The same rail the walking bar rides, in the wind's own slate rather than an order's
      // cinnabar, FILLING as the shape recovers. A countdown says the game forbids this; a bar
      // filling says these men are getting their breath back — same rule, opposite feeling, and
      // the whole reason the fiction is wind rather than a lock. Never on a walking chip: one
      // rail, one bar, whichever story the chip is currently telling.
      if (gone) {
        const got = Math.max(0, Math.min(1,
          1 - wind.ours[id] / Math.max(1, BATTLE_FORMATION_WIND)));
        const breath = this.add.graphics();
        breath.fillStyle(0x45606f, 0.25);
        breath.fillRect(x + 2, formY + BATTLE_FORMATION_HEIGHT - 4, chipW - 4, 2.5);
        breath.fillStyle(0x45606f, 0.9);
        breath.fillRect(x + 2, formY + BATTLE_FORMATION_HEIGHT - 4, (chipW - 4) * got, 2.5);
        orders.add(breath);
      }

      // The beat the men actually stood up in it. Two beats, then it stops mattering.
      const beatNow = (battle.approachBeats ?? 0) + battle.round;
      if (held && battle.landedBeat !== undefined && beatNow - battle.landedBeat <= 1) {
        const flare = this.add.graphics();
        flare.lineStyle(2, battle.landedCountered ? INK_UI.jade : INK_UI.gold, 0.95);
        flare.strokeRoundedRect(x - 1, formY - 1, chipW + 2, BATTLE_FORMATION_HEIGHT + 2, 7);
        orders.add(flare);
        this.tweens.add({
          targets: flare, alpha: { from: 1, to: 0 }, duration: 520, ease: 'Quad.easeOut',
        });
      }

      if (gone) return;
      const hit = this.add.zone(x, formY, chipW, BATTLE_FORMATION_HEIGHT).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      // The press itself. Every other button in this game dips under the thumb — `InkUI.button`
      // redraws on `pointerdown` — and these chips were a bare zone with a `pointerup` handler and
      // nothing else, so the one control the fight is built around was the one control that gave
      // no sign of having been touched.
      /**
       * The **whole chip** dips, not just the tile under it.
       *
       * It was the tile alone, which is worse than no feedback at all: the paper moved and the word
       * printed on it did not, so the chip read as a card sliding out from under its own label. The
       * order, the glyph and the state line go with it now, all scaled about the chip's centre —
       * which is what `bounds.x + chipW * 0.03` was always secretly doing for the tile.
       */
      const cx = bounds.x + chipW / 2;
      const cy = formY + BATTLE_FORMATION_HEIGHT / 2;
      const parts: Array<{ o: Phaser.GameObjects.Components.Transform; hx: number; hy: number; hs: number }> = [
        { o: tile, hx: bounds.x, hy: bounds.y, hs: 1 },
        { o: glyph, hx: glyph.x, hy: glyph.y, hs: glyphSize / CARD_ICON_SIZE },
        { o: verb, hx: verb.x, hy: verb.y, hs: 1 },
      ];
      if (noteLabel) parts.push({ o: noteLabel, hx: noteLabel.x, hy: noteLabel.y, hs: 1 });
      const press = (k: number): void => {
        for (const part of parts) {
          part.o.setScale(part.hs * k);
          part.o.setPosition(cx + (part.hx - cx) * k, cy + (part.hy - cy) * k);
        }
      };

      hit.on('pointerdown', () => press(0.93));
      const unpress = (): void => press(1);
      hit.on('pointerout', unpress);
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        unpress();
        if (scrollGestureConsumedTap(pointer)) return;
        this.releaseBattleHold();
        // Before the order, because the order rebuilds this strip: the mark has to be somewhere
        // that outlives the chip that raised it.
        this.stampFormationChip(bounds);
        this.events.emit('ui:battle-order', `formation:${id}`);
      });
      orders.add(hit);
    });
  }

  /**
   * The mark a formation order leaves behind it.
   *
   * **The press had nowhere to land.** Ordering a shape changes `battleOrderSignature`, which tears
   * the whole strip down and builds it again on the same frame — so any release animation on the
   * chip was destroyed a millisecond after it started, and the only thing the player saw was the
   * dip ending. That is why the tap felt like nothing: the game answered, and then deleted the
   * answer.
   *
   * So the answer is drawn somewhere the rebuild cannot reach. A seal punching outward off the
   * chip's own outline, in sỏi son, with six flecks thrown clear of it — the print's own idea of a
   * stamp coming down — parented to `modalLayer` rather than to the dock, and gone in 340 ms.
   *
   * It does not replace the marks already on the rebuilt chip. Those say three different later
   * things: the seal says the order was *issued*, the bar says how much of the walk is left, the
   * flare says it *arrived*. This one is the only one that says *you just pressed that*.
   */
  private stampFormationChip(bounds: UIBounds): void {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;

    const ring = this.add.graphics();
    ring.lineStyle(2.4, INK_UI.cinnabar, 0.95);
    ring.strokeRoundedRect(
      -bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height, 7,
    );
    ring.setPosition(cx, cy);
    this.modalLayer.add(ring);
    this.tweens.add({
      targets: ring,
      scale: { from: 0.96, to: 1.24 },
      alpha: { from: 0.95, to: 0 },
      duration: 340,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });

    // Thrown from the corners rather than fanned evenly: an even ring of dots reads as a loading
    // spinner, and this is a stamp coming down.
    const flecks = this.add.graphics();
    flecks.fillStyle(INK_UI.cinnabar, 0.9);
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 + 0.5;
      flecks.fillCircle(
        Math.cos(angle) * bounds.width * 0.42,
        Math.sin(angle) * bounds.height * 0.46,
        1.9,
      );
    }
    flecks.setPosition(cx, cy);
    this.modalLayer.add(flecks);
    this.tweens.add({
      targets: flecks,
      scale: { from: 0.55, to: 1.55 },
      alpha: { from: 1, to: 0 },
      duration: 380,
      ease: 'Quad.easeOut',
      onComplete: () => flecks.destroy(),
    });
  }

  /**
   * What they are doing, what it is costing, and whether the last order was worth making.
   *
   * The three readings a player actually needs, in the band the two strip labels used to occupy.
   * The old dock named the enemy's shape — `họ: Thế Nỏ` — which is a fact about vocabulary, not a
   * situation anybody can act on. Written plainly the ring turns out to be common sense: spears
   * stop horses, shields stop arrows, spread out and the arrows miss. The names were the barrier.
   */
  private buildBattleReadout(battle: AscentBattle, y: number): void {
    const ui = this.battleUi;
    if (!ui) return;
    const { content, orders } = ui;
    const walking = (battle.reformBeats ?? 0) > 0;

    /**
     * The band is the *price* now. What the enemy is doing left it for the bubble over their own
     * men, which is where it always belonged — a caption in the dock naming a shape, a hundred and
     * eighty points below the two blocks of figures it was about, made the reader take on trust
     * which of them it referred to.
     *
     * What is left is the pair of readings that genuinely belong beside the dials, because both
     * are about the order last given: what this beat cost, and whether the arms in the two hosts
     * favour us.
     */
    const loss = battle.lastBeatLoss;
    const price = walking ? t('ascent.battle.walkingWhy')
      : loss ? `${t('ascent.battle.priceOurs', { ours: String(Math.round(loss.ours)) })}  ·  `
        + t('ascent.battle.priceTheirs', { theirs: String(Math.round(loss.theirs)) })
        : t('ascent.battle.priceOpening');
    const losing = !walking && loss !== undefined && loss.ours > loss.theirs;
    orders.add(this.ui.label(content.x + 2, y, price, 'label', {
      fontSize: '11px',
      color: walking ? INK_UI_HEX.mutedText
        : losing ? '#8a2a1b'
          : loss ? '#4c5f45' : INK_UI_HEX.mutedText,
    }));

    // How the two hosts' arms meet — spears against horse, bows against spears. Computed by the
    // fight, and until now printed in a loose line under the rails, where it sat beside the
    // telegraph and was read as part of it.
    //
    // When the arms have nothing to say, the slot carries the countable half of the duel instead:
    // the shapes the enemy has spent and cannot re-form yet. Their wind is real, it obeys the same
    // three-beat clock ours does, and printing it turns "remember what they left two beats ago"
    // from a memory burden into a read — which is what opens the bait as a play.
    const arms = battle.ourMatchup ?? 1;
    if (Math.abs(arms - 1) > 0.03) {
      orders.add(this.ui.label(
        content.x + 2, y + 13,
        arms > 1 ? t('ascent.battle.armsGood') : t('ascent.battle.armsBad'), 'caption',
        { fontSize: '9px', color: arms > 1 ? '#4c5f45' : '#8a2a1b' },
      ));
    } else {
      const wind = battleWindView(battle);
      const spent = FORMATION_RING
        .filter((shape) => shape !== battle.theirFormation && wind.theirs[shape] > 0)
        .map((shape) => `${t(`ascent.formation.${shape}` as Parameters<typeof t>[0])} · ${wind.theirs[shape]}`);
      if (spent.length) {
        const line = this.ui.label(
          content.x + 2, y + 13,
          t('ascent.battle.cannotReform', { list: spent.join(',  ') }), 'caption',
          { fontSize: '9px', color: '#45606f' },
        );
        // One line, shrunk to fit, never wrapped — the band's height is load-bearing
        // (`verify-battle-dock` measures it on a 620-tall phone).
        for (let size = 9; size >= 7 && line.width > content.width - 96; size -= 0.5) {
          line.setFontSize(size);
        }
        orders.add(line);
      }
    }

    /**
     * One slot on the right, and three things that might want it.
     *
     * Ranked, because they are about narrowing spans of time and the narrowest is the most useful:
     * *the order you just gave landed and it counters* beats *this round went your way* beats *the
     * last three did not and you have not answered*.
     *
     * Winning is announced the moment it is true. Losing is not its mirror — one bad exchange is
     * noise, and a banner that flickers on every other beat is a banner a player learns to ignore
     * inside one fight. It waits for three rounds against us with no order given in them, which is
     * the case actually worth interrupting for: somebody being countered who has not noticed.
     */
    const beatNow = (battle.approachBeats ?? 0) + battle.round;
    const landed = battle.landedBeat !== undefined && beatNow - battle.landedBeat <= 1 && !walking;
    const adrift = (battle.lostRun ?? 0) >= 3 && (battle.beatsSinceOurShape ?? 0) >= 3;
    const verdict = landed
      ? (battle.landedCountered === true
        ? { text: t('ascent.battle.landedGood'), colour: INK_UI.jade, loud: true }
        : { text: t('ascent.battle.landedEven'), colour: undefined, loud: false })
      : battle.wonLast === true
        ? { text: t('ascent.battle.winning'), colour: INK_UI.jade, loud: true }
        : adrift
          ? { text: t('ascent.battle.losing'), colour: INK_UI.cinnabar, loud: true }
          : undefined;
    if (!verdict) return;

    const stamp = this.ui.label(
      content.x + content.width - 2, y + 4, verdict.text, 'label',
      {
        fontSize: verdict.loud ? '10.5px' : '9px',
        color: verdict.colour
          ? `#${verdict.colour.toString(16).padStart(6, '0')}`
          : INK_UI_HEX.mutedText,
      },
    ).setOrigin(1, 0);
    orders.add(stamp);
    if (verdict.loud) {
      this.tweens.add({
        targets: stamp, scale: { from: 1.28, to: 1 }, duration: 260, ease: 'Back.easeOut',
      });
    }
  }

  /**
   * Hand over and leave, along the foot of the screen.
   *
   * **They were in the header, and the header is the one place on this screen a thumb cannot
   * reach.** Everything else here is built around a one-handed grip — the formation strip owns the
   * bottom band precisely because it is worked three to five times a fight — and the two controls
   * that end a player's involvement in it sat about seven hundred points up a phone held in one
   * hand. The justification was that they are semi-final and should be hard to hit by accident;
   * what it actually bought was two controls that had to be hunted for with the other hand.
   *
   * So they take the foot, where the lane's Close button stood on its own. That is not a lost exit:
   * closing the screen and leaving the field already did the same thing to the fight — the general
   * takes the remainder either way — and one button that says so beats two that differ in a way
   * nothing on the screen explained.
   *
   * Accident is guarded by size and by wording instead of by distance. Neither is the loud
   * cinnabar the dock uses, both say plainly what happens next, and the hand-over is reversible
   * from the same slot: the chip flips to "take the field back" the moment it is pressed.
   */
  private buildBattleExits(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui) return;
    const { exits } = ui;
    this.clearLayer(exits);

    const handedOver = Boolean(battle.delegated);
    const chips: Array<{ label: string; sub: string; accent: number; order: string }> = [
      {
        label: handedOver ? t('ascent.battle.takeField') : t('ascent.battle.autoShort'),
        sub: handedOver ? t('ascent.battle.takeFieldNote') : t('ascent.battle.autoSub'),
        accent: handedOver ? INK_UI.gold : INK_UI.softBrush,
        order: handedOver ? 'take-field' : 'auto',
      },
      {
        // Not a retreat and not a concession: the engagement keeps running on the world clock with
        // the general on both dials, and the aftermath card finds the player wherever they are.
        // This is the button for the eleventh battle of a session and it must never read as giving
        // up — breaking off is `Lui binh`, the cold end of the stance dial.
        label: t('ascent.battle.leaveShort'),
        sub: t('ascent.battle.leaveSub'),
        accent: INK_UI.softBrush,
        order: 'leave',
      },
    ];

    const { x: baseX, y, height: h } = ui.exitBounds;
    const gap = 8;
    const w = (ui.exitBounds.width - gap) / 2;
    chips.forEach((chip, index) => {
      const x = baseX + index * (w + gap);
      const bounds = { x, y, width: w, height: h };
      const plate = this.ui.panel(bounds, {
        border: chip.accent, fillAlpha: 0.97, borderWidth: 1.5, radius: 6,
      });
      exits.add(plate);
      exits.add(this.ui.label(x + w / 2, y + 8, chip.label, 'label', {
        fontSize: '12px', align: 'center', wordWrap: { width: w - 10 },
      }).setOrigin(0.5, 0));
      exits.add(this.ui.label(x + w / 2, y + 24, chip.sub, 'caption', {
        fontSize: '8.5px', align: 'center', wordWrap: { width: w - 10 },
      }).setOrigin(0.5, 0));

      const hit = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      // The same dip every other control on this screen gives. A bare zone over a panel is the one
      // shape in this codebase that looks pressable and never acknowledges a press.
      hit.on('pointerdown', () => {
        plate.setScale(0.97);
        plate.setPosition(x + w * 0.015, y + h * 0.015);
      });
      const unpress = (): void => { plate.setScale(1); plate.setPosition(x, y); };
      hit.on('pointerout', unpress);
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        unpress();
        if (scrollGestureConsumedTap(pointer)) return;
        this.releaseBattleHold();
        this.events.emit('ui:battle-order', chip.order);
        // Stepping away closes the screen; handing over keeps it open, which is the whole
        // difference between the two chips.
        if (chip.order === 'leave') this.closeLane();
      });
      exits.add(hit);
    });
  }

  /**
   * The Moment, as a thing a thumb can reach and a thing that looks like a button.
   *
   * It used to be a card pinned to the foot of the *field*, which on a 620-high screen is the
   * middle of the phone — the one part of a one-handed grip that a thumb cannot get to without
   * shifting the whole hand — and its two answers were 29-pixel outlined rows. 29 px is below
   * every touch-target guideline there is (44 is the usual floor), and an outlined row beside a
   * dock full of filled tiles reads as a caption rather than as a control. So the complaint was
   * two separate faults: it was out of reach, and it did not look tappable.
   *
   * Now it takes the order dock's own band — the strip the player's thumb is already on, because
   * that is where every other order in the fight is given — and its answers are `InkUI.button`s,
   * the same object the rest of the game uses, with the same press feedback. The orders underneath
   * are hidden while the question stands rather than left showing through: the question *is* the
   * order for this beat, and two sets of controls in one place is worse than either.
   */
  private buildBattleMoment(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui) return;
    const { content, moment: layer } = ui;
    this.clearLayer(layer);

    const moment = battle.moment;
    ui.momentKey = moment ? `${moment.id}:${moment.raisedAtBeat}` : '';
    // Both dials go dark while the question stands. A stop you can keep playing through is not a
    // stop, and two sets of live controls in one band is worse than either alone.
    ui.orders.setVisible(!moment);
    ui.exits.setAlpha(moment ? 0.38 : 1);
    if (!moment) return;

    // The fight is *held*, and until now nothing on screen admitted it: `advanceBattle` stops
    // draining beats while a Moment stands, so the field simply went quiet — which reads as a
    // dropped frame rather than as a decision being waited for. A wash and a word fix that.
    //
    // In the `moment` layer and not over the field, because `setDepth` inside a container is a
    // no-op: the only thing that puts this above the men is being in a later container.
    const wash = this.add.graphics();
    wash.fillStyle(INK_UI.parchment, 0.55);
    wash.fillRect(content.x, content.y, content.width, ui.fieldHeight);
    layer.add(wash);
    layer.add(this.ui.label(
      content.x + content.width / 2, content.y + ui.fieldHeight * 0.32,
      t('ascent.battle.held'), 'caption',
      {
        fontSize: '10px',
        align: 'center',
        color: `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}`,
      },
    ).setOrigin(0.5));

    const y = content.y + ui.fieldHeight + 8 + BATTLE_RAILS_HEIGHT + 8;

    // Built before the plate is sized, because the plate is sized around it. A Moment's title is
    // one line for `Their baggage is within bowshot.` and two for one carrying a rival's full name
    // — and at the fixed height this used to have, that second line ate the answers' room and the
    // two buttons printed their own sub-lines straight through the timer bar.
    const title = this.ui.label(
      content.x + 12, y + 16,
      t(`ascent.moment.${moment.id}.title` as Parameters<typeof t>[0], { subject: moment.subject ?? '' }),
      'label', { fontSize: '14px', wordWrap: { width: content.width - 28 } },
    );
    /**
     * As tall as the band under the rails will allow, not as tall as some written-down number.
     *
     * It was `BATTLE_DOCK_HEIGHT + 8` plus whatever a wrapped title cost, which is the dock's
     * height — and the dock has three rows of controls where this has two buttons that each carry
     * a heading *and* a line of explanation. At that size a Moment offering `Đánh trước khi chúng
     * dàn xong` over `Đông chỉ có ích khi đã vào hàng.` had about forty points for four lines of
     * type. Taking the whole band gives the two answers the room they were always drawn for, and
     * costs nothing: the dock is hidden while this stands, so the space is not being used for
     * anything else.
     */
    const height = Math.max(BATTLE_DOCK_HEIGHT + 8, ui.exitBounds.y - 8 - y);

    // A plate, not a scrim: the field behind it stays fully visible, because the field is what the
    // question is about. The old card covered the very thing it was asking after.
    const plate = this.add.graphics();
    plate.fillStyle(INK_UI.parchment, 0.97);
    plate.fillRect(content.x + 2, y, content.width - 4, height);
    plate.lineStyle(2, INK_UI.cinnabar, 0.95);
    plate.strokeRect(content.x + 2, y, content.width - 4, height);
    layer.add(plate);

    layer.add(this.ui.label(content.x + 12, y + 5, t('ascent.moment.kicker'), 'caption', {
      fontSize: '9px', color: `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}`,
    }));
    layer.add(title);

    /**
     * Two real buttons, side by side, filling the width — and the clock gets a band of its own
     * under them rather than being squeezed into their margin.
     *
     * 22 points is what the bar and its caption together *are*: a 3-point bar and a 10-point line
     * of type. Sized against that exactly, the caption's own line box overhung the card by a point
     * and printed across the bar it was captioning. `FOOTER` is that content plus the air on both
     * sides of it, which is what it needed all along.
     */
    const FOOTER = 26;
    const rowY = y + 16 + Math.max(16, title.height) + 6;
    const gap = 8;
    const buttonW = (content.width - 24 - gap) / 2;
    const buttonH = Math.max(44, height - (rowY - y) - FOOTER);
    const answer = (index: number, id: 'commit' | 'steady'): void => {
      layer.add(this.ui.button(
        { x: content.x + 12 + index * (buttonW + gap), y: rowY, width: buttonW, height: buttonH },
        t(`ascent.moment.${moment.id}.${id}` as Parameters<typeof t>[0]),
        () => {
          // No gesture guard here: `InkUI.button` has already refused the tap if it was the tail
          // of a scroll, and it did so with the pointer in hand. A second, pointerless check could
          // only ever throw away an answer the player did mean to give.
          this.releaseBattleHold();
          this.events.emit('ui:battle-moment', id);
        },
        {
          // Gold for the committing answer and paper for the steady one: the same pair the stance
          // dock uses for "chosen" and "available", so the two rows speak the same language.
          variant: id === 'commit' ? 'primary' : 'secondary',
          fontSize: '12.5px',
          subLabel: t(`ascent.moment.${moment.id}.${id}D` as Parameters<typeof t>[0]),
        },
      ));
    };
    answer(0, 'commit');
    answer(1, 'steady');

    // The clock, and who answers when it runs out.
    //
    // Drained by a tween rather than by the tick: the fight is *held* while this stands, so the
    // only honest thing to draw against is real time. It runs for the window the world will
    // actually wait — one economy tick per `ticksLeft`.
    const barW = content.width - 24;
    const barY = y + height - FOOTER + 5;
    const bed = this.add.graphics();
    bed.fillStyle(INK_UI.parchmentDark, 0.9);
    bed.fillRect(content.x + 12, barY, barW, 3);
    layer.add(bed);
    const fill = this.add.graphics();
    fill.fillStyle(INK_UI.cinnabar, 0.95);
    fill.fillRect(0, 0, barW, 3);
    fill.setPosition(content.x + 12, barY);
    layer.add(fill);
    this.tweens.add({
      targets: fill,
      scaleX: { from: 1, to: 0 },
      duration: ASCENT_TICK_MS * Math.max(1, moment.ticksLeft),
      ease: 'Linear',
    });
    layer.add(this.ui.label(
      content.x + content.width / 2, barY + 6,
      moment.generalName
        ? t('ascent.moment.fallback', { name: moment.generalName, n: moment.ticksLeft })
        : t('ascent.moment.fallbackNone', { n: moment.ticksLeft }),
      'caption', { fontSize: '9px', align: 'center' },
    ).setOrigin(0.5, 0));
  }


  /**
   * Brings the open battle screen up to date with the fight underneath it.
   *
   * Called from `refresh`, so it runs on the battle's own clock *and* on any state change an
   * order causes — a posture pressed redraws its badge immediately rather than up to a beat
   * later. Each layer decides for itself whether it needs rebuilding; the markers are moved
   * rather than replaced so their focus targets survive a press.
   */
  private updateBattle(): void {
    const ui = this.battleUi;
    const battle = this.state.ascent?.activeBattle;
    if (!ui) return;
    if (!battle) {
      if (this.holdArenaRout()) return;
      this.closeLane();
      return;
    }

    const frame = this.battleFrame(battle);

    if (this.battleFieldSignature(battle) !== ui.fieldSignature) {
      this.buildBattleField(battle);
    } else {
      // The shove is what contact looks like: once the lines meet they press into each other
      // instead of gliding, so the picture reads as a fight rather than a chart.
      const lines = this.battleLines(frame.ourAdvance, frame.theirAdvance);
      // Touching, as *drawn*, not as the advances define it.
      //
      // The two definitions are not the same and the gap between them was a dead window. The
      // advances sum to 1 at contact, but the drawn lines are held apart by the seam gap — which
      // is now measured off the blocks and so is wider than it used to be — so for the beat or
      // two before the sum reaches 1, the positions were already pinned by the clamp while the
      // shove was still switched off. Nothing moved at all. Measured on a real fight: 692 ms of
      // a completely still field in the middle of an engagement.
      const meeting = lines.met || frame.ourAdvance + frame.theirAdvance >= 1;
      // Headcounts come off the beat being shown when there is one, so the strength stamped on a
      // column belongs to the same moment as the position it is standing in.
      const sizes = frame.hostMen ?? new Map(
        [...ourHosts(this.state, battle), ...theirHosts(this.state, battle)]
          .map((host) => [host.id, hostSize(host)] as const),
      );
      this.slideMarkers(ui.ourMarkers, lines.ourX, meeting ? 4 : 0, sizes);
      this.slideMarkers(ui.theirMarkers, lines.theirX, meeting ? -4 : 0, sizes);
    }

    // The rails split in two: the fight's half is rebuilt only when the fight changes under it,
    // and the beat's half is two strings and one graphics.
    if (this.battleRailsSignature(battle) !== ui.railsSignature) this.buildBattleRails(battle);
    this.updateBattleRails(battle);
    this.buildBattlePips(battle);

    // Only when the line actually changes: re-inking the same two lines every beat makes the
    // ribbon flicker, and the newest line needs to hold long enough to be read.
    const newest = battle.log[battle.log.length - 1];
    if (newest !== ui.lastLine) {
      ui.lastLine = newest;
      this.updateBattleLogLine(battle);
    }

    // The men stand up in the new shape on the beat it lands, and not before: a host that
    // re-arranged the instant the order was given would make the walk free, and paying for the
    // walk is the whole decision the fast dial is built around.
    //
    // Per host through `redrawHostBlock` rather than by rebuilding the field: the field carries the
    // ground, the camps and the banners, and none of those have any business flickering because a
    // block moved.
    const standing = `${battle.ourFormation}|${battle.theirFormation}`;
    if (standing !== ui.shapeSignature) {
      ui.shapeSignature = standing;
      [...ui.ourMarkers, ...ui.theirMarkers].forEach((entry) => {
        if (entry.routed) return;
        const host = this.state.armies.find((army) => army.id === entry.hostId);
        if (host) this.redrawHostBlock(entry, hostSize(host));
      });
    }

    if (this.battleOrderSignature(battle) !== ui.orderSignature) {
      this.buildBattleOrders(battle);
      // The exits are their own layer but not their own clock: the hand-over chip is two chips
      // wearing one slot, and without this it kept offering "hand it over" to a player who already
      // had — which is the way back to the fight, greyed into nothing.
      this.buildBattleExits(battle);
    }

    this.updateBattleBubbles(battle);
    this.updateBattleNotice(battle);

    // Rebuilt only when the question or its clock changes — never every beat, because a card
    // destroyed between press and release never fires.
    const momentKey = battle.moment
      ? `${battle.moment.id}:${battle.moment.raisedAtBeat}:${battle.round}`
      : '';
    if (momentKey !== ui.momentKey) {
      this.buildBattleMoment(battle);
      ui.momentKey = momentKey;
    }
  }

  /**
   * Takes one beat off the queue and shows it.
   *
   * This is the whole of the fix for a fight that used to arrive in four frozen jumps. The
   * simulation still resolves `BATTLE_BEATS_PER_TICK` beats in a burst on the economy tick — it
   * has to, or every mode's regression fingerprint moves — but the screen no longer *reads* the
   * burst. It reads the record of it, one moment per interval.
   *
   * When the queue is empty the view falls back to live state, which is the right answer: it
   * means the picture has caught up with the truth.
   */
  private drainBattleBeat(): void {
    const ui = this.battleUi;
    const battle = this.state.ascent?.activeBattle;
    if (!ui || !battle) return;
    const queue = battle.beats;
    if (!queue || queue.length === 0) {
      ui.shown = undefined;
      return;
    }
    // Falling behind is worse than skipping: a queue that keeps growing puts the picture further
    // from the numbers every tick. Above a tick's worth in hand, take two.
    const take = queue.length > BATTLE_BEATS_PER_TICK ? 2 : 1;
    for (let i = 0; i < take && queue.length > 0; i += 1) {
      ui.shown = queue.shift();
    }
    if (ui.shown) {
      this.spawnBattleFloaters(ui.shown);
      this.layFallen(ui.shown);
      this.reactToBeat(ui.shown);
    }
  }

  /**
   * The two moments in a fight that are worth interrupting the rhythm for.
   *
   * `BattleBeat.broke` has been recorded since the buffer was written — its own doc comment calls
   * it "the moment worth a shake" — and nothing has ever read it. Contact was the same: the beat
   * where two lines meet arrived at exactly the cadence of the beat before it and the one after,
   * so the most violent thing on the screen was also the least remarkable.
   *
   * A hit-stop is the cheapest way to say *that mattered*: the clock holds for a fraction of a beat
   * and the picture sits still. It reads as weight rather than as a stutter because it happens only
   * on contact and on a break — measured across a fight, three or four times, never twice in a row.
   */
  private reactToBeat(beat: BattleBeat): void {
    const ui = this.battleUi;
    if (!ui) return;

    // Who won this exchange, as ground.
    //
    // The simulation already decides it — one side loses more men than the other — and the field
    // threw the answer away, because after contact `ourAdvance` and `theirAdvance` never move
    // again. Accumulated rather than set, so a run of won exchanges walks the line across the
    // field and one bad beat does not undo four good ones. Clamped, because the seam is clamped:
    // past the band the picture stops being a fight and becomes a rout, which the rout itself
    // already draws.
    const traded = beat.ourLoss + beat.theirLoss;
    if (traded > 0) {
      const won = (beat.theirLoss - beat.ourLoss) / traded;
      this.battlePress = Math.max(-1, Math.min(1, this.battlePress * 0.72 + won * 0.5));
    }

    const met = beat.ourAdvance + beat.theirAdvance >= 1;
    const firstContact = met && !ui.hadContact;
    if (firstContact) ui.hadContact = true;
    // Only once they are actually touching, and only when the exchange cost somebody something —
    // a ring struck over two lines still walking toward each other is a lie about the picture.
    if (met && traded > 0) this.strikeClash();

    const broke = beat.broke ?? [];
    if (broke.length > 0) {
      // A line breaking shakes the field, not the whole screen: the rails and the dock have to stay
      // readable, and a player reaching for Rally at exactly this moment should not have the button
      // move under their thumb.
      this.tweens.add({
        targets: [ui.field, ui.floaters],
        x: { from: -3, to: 0 },
        duration: 220,
        ease: 'Elastic.easeOut',
      });
      // And the hosts that broke turn away and run off their own edge.
      for (const id of broke) this.routMarker(id);
    }

    if (firstContact || broke.length > 0) this.holdBattleClock(BATTLE_HIT_STOP_MS);
  }

  /** Holds the beat clock for a moment without losing its cadence afterwards. */
  private holdBattleClock(ms: number): void {
    const clock = this.battleClock;
    if (!clock || clock.paused) return;
    clock.paused = true;
    this.time.delayedCall(ms, () => {
      if (this.battleClock === clock) clock.paused = false;
    });
  }

  /**
   * A host that broke turns and runs off its own side of the field.
   *
   * Never `setScale(-1, 1)`: these markers are baked props with a declared native facing, and
   * flipping one directly mirrors whatever it was drawn from. `faceTravel` asks the object which
   * way it was drawn and works out the sign from that.
   */
  private routMarker(hostId: string): void {
    const ui = this.battleUi;
    if (!ui) return;
    const ours = ui.ourMarkers.find((m) => m.hostId === hostId);
    const marker = ours ?? ui.theirMarkers.find((m) => m.hostId === hostId);
    if (!marker?.marker?.active) return;
    // Ours run left, theirs run right: each side flees the way it came.
    const direction: -1 | 1 = ours ? -1 : 1;
    marker.routed = true;
    this.tweens.killTweensOf(marker.marker);
    faceTravel(marker.marker, direction);
    this.tweens.add({
      targets: marker.marker,
      x: marker.marker.x + direction * (ui.geometry.span * 0.6 + 60),
      alpha: { from: 1, to: 0 },
      duration: BATTLE_TICK_MS * 2,
      ease: 'Quad.easeIn',
    });
  }

  /**
   * Keeps the Skirmish's field on screen while the beaten side runs off it.
   *
   * `routHostBlock` carries a broken host away over `BATTLE_TICK_MS * 2`, and until now nobody had
   * ever seen it end: when the last host on a side breaks, the fight resolves inside the same tick,
   * `finishBattle` clears `activeBattle`, and the very next `updateBattle` closed the lane and
   * killed every tween on it. The arena then swapped the whole scene for its report. About a
   * second of animation, shown for a frame or two of it.
   *
   * Only the arena holds. In a real run the fight is one thing happening among many — a wave is
   * still walking in, the economy is still running, and the aftermath card is the thing that wants
   * the player's attention next — so stopping the map to watch an animation would be the tail
   * wagging the dog. The Skirmish exists to *look at the fight*, and it is the one place where the
   * last second of one is the point.
   *
   * Returns true while the hold is running, which is the caller's signal not to close the lane.
   * The dock goes with the fight: an orders card still standing over a finished battle is a set of
   * buttons that resolve against nothing.
   */
  private holdArenaRout(): boolean {
    if (!this.state.ascent?.arena) return false;
    if (this.arenaRoutHold) return true;

    // The dock is dimmed and disarmed, not hidden, and the Moment card is taken away entirely.
    //
    // Both are questions put to a battle that no longer exists: an orders card over a finished
    // fight is a row of buttons that resolve against nothing, and a Moment still counting down
    // "The King decides in 1" is worse, because it implies a choice the result has already made.
    //
    // Hiding them was the first attempt and it punched a hole in the page: the cards *are* the
    // bottom half of this screen's paper, so with them gone the menu still resident behind the
    // whole thing showed through — "Classic Modes" and "Buy me a coffee" reading faintly under a
    // battlefield. Dimming keeps the sheet whole and still says plainly that the controls are
    // spent.
    const ui = this.battleUi;
    if (ui) {
      this.clearLayer(ui.moment);
      for (const dock of [ui.orders, ui.exits]) {
        // Shown again first: `buildBattleMoment` hides the orders dock while a Moment stands, and a
        // fight that ends on one would otherwise hold a screen with its whole middle missing.
        dock.setVisible(true);
        // 0.7, not the 0.3 that reads as "disabled" on a normal page. These cards *are* the
        // lower half of this sheet, and the lane behind them is translucent, so anything darker
        // let the menu still resident behind the game show through between the rows.
        dock.setAlpha(0.7);
        disarm(dock);
      }
    }

    // **Set the losers running, here, rather than waiting for a beat that will never arrive.**
    //
    // The flee is normally driven by `beat.broke`, and the screen runs behind the simulation:
    // `BATTLE_BEATS_PER_TICK` beats are produced per tick and shown one per `BATTLE_TICK_MS`. So
    // the beat that breaks the last host is still queued when `finishBattle` clears the battle out
    // from under it, and the UI never sees the one beat the whole animation hangs on. Holding the
    // field without this showed a frozen line for two seconds, which is worse than cutting away.
    //
    // Read off the record rather than the beats, because the record is what survived: the side
    // named in `outcome` is the side that broke. A fight that ended `spent` or `retreat` had nobody
    // rout, and correctly leaves both lines standing where they stopped.
    const record = this.state.ascent.battleHistory?.[this.state.ascent.battleHistory.length - 1];
    const routing = record?.outcome === 'we-rout' ? ui?.ourMarkers
      : record?.outcome === 'they-rout' ? ui?.theirMarkers
        : undefined;
    for (const entry of routing ?? []) {
      if (!entry.routed) this.routMarker(entry.hostId);
    }

    this.arenaRoutHold = this.time.delayedCall(ARENA_ROUT_HOLD_MS, () => {
      this.arenaRoutHold = undefined;
      if (this.openPromptKey === 'lane:battle') this.closeLane();
    });
    return true;
  }

  /**
   * Walks a side's columns to where the fight says they now stand.
   *
   * Chained rather than yoyo'd: a yoyo returns the marker to where it *started*, so shoving on
   * contact would have undone that beat's advance every time the lines touched. The last hop
   * always lands on the true position, so the picture can never drift from the numbers.
   */
  private slideMarkers(
    markers: BattleMarker[],
    x: number,
    shove: number,
    sizes: Map<string, number>,
  ): void {
    for (const entry of markers) {
      const { hostId, count } = entry;
      if (!entry.marker.active) continue;
      // A host that broke is no longer part of the line. Without this, `slideMarkers` dragged it
      // back into formation every beat and killed the tween carrying it off the field — measured,
      // the runner got forty pixels and never faded, because the rout and the formation were both
      // writing the same `x` and the formation won.
      if (entry.routed) continue;
      const size = sizes.get(hostId);
      if (count?.active && size !== undefined) count.setText(compactNumber(size));
      // The ranks thin. One figure stands for `MEN_PER_MARK` men, so this fires about once per
      // fifty-five lost — twenty-odd redraws across a whole engagement, at ~21 `figure()` calls
      // each. Cheap, exact, and it makes attrition the most legible thing on the screen without
      // a single number being read.
      if (size !== undefined) {
        const marks = hostShapeAt(Math.max(1, size), 1).marks;
        if (entry.marks !== undefined && marks !== entry.marks) this.redrawHostBlock(entry, size);
        entry.marks = marks;
      }
      // Read *after* the possible redraw, and this is the whole of a bug worth writing down.
      //
      // `redrawHostBlock` destroys the block and puts a new one in `entry.marker`. This loop used
      // to hold the old container in a local destructured at the top, so on every beat where a
      // host crossed a mark boundary the tween was added to an object that had just been
      // destroyed — and the new block, having been positioned where the old one stood, simply did
      // not move for that beat. Measured on a real engagement: the field stood perfectly still
      // for 673 ms in the middle of the fight, once per fifty-five men lost. That is the "teleport
      // and freeze" complaint's second half, and it survived the tween timings being fixed
      // because the tween was never running on the thing being drawn.
      const marker = entry.marker;
      // Previous beat's tween is abandoned rather than left to fight this one for the same x.
      this.tweens.killTweensOf(marker);
      if (shove === 0) {
        // The whole interval, and linear. It used to be `BATTLE_TICK_MS * 0.45` on an ease-out,
        // so a host crossed its ground in a quarter of a second and then stood perfectly still
        // for the remaining three tenths — a hop, a freeze, a hop. Measured against the beat, the
        // block was stationary for 55% of the time it was supposedly marching. Linear because a
        // column on the move does not accelerate and brake between each pair of steps.
        this.tweens.add({ targets: marker, x, duration: BATTLE_TICK_MS, ease: 'Linear' });
        continue;
      }
      // In contact: lean in, lean back, and let the two halves fill the beat between them, so
      // there is never a moment where nothing on the field is moving.
      this.tweens.chain({
        targets: marker,
        tweens: [
          { x: x + shove, duration: BATTLE_TICK_MS * 0.46, ease: 'Sine.easeInOut' },
          { x, duration: BATTLE_TICK_MS * 0.54, ease: 'Sine.easeInOut' },
        ],
      });
    }
  }

  /**
   * Redraws one host's block at the strength it is now.
   *
   * Rebuilt in place rather than through `buildBattleField`, because the whole field carries the
   * focus rings and the tap targets — throwing it away to shrink one column would drop the order
   * the player is in the middle of giving.
   */
  /**
   * Half the ground a host's whole formation covers.
   *
   * `BATTLE_SEAM_GAP` is a distance between two hosts' *centres*, so what it has to clear is the
   * deployment, not the shield wall in the middle of it. Measured off one block, a screen thrown
   * forward of the line stands inside the enemy's rear ranks.
   */
  private hostHalfWidth(
    host: Army, men?: number, mustered?: number, shape?: BattleFormation,
  ): number {
    const size = Math.max(1, men ?? hostSize(host));
    return armyShape(
      size, compositionFor(hostKitFor(this.state, host)), this.battleBaseScale(), mustered, 1, shape,
    ).width / 2;
  }

  private redrawHostBlock(entry: BattleMarker, men: number): void {
    const ui = this.battleUi;
    if (!ui || !this.battleItems) return;
    const battle = this.state.ascent?.activeBattle;
    if (!battle) return;
    const host = this.state.armies.find((army) => army.id === entry.hostId);
    if (!host) return;

    const ours = (battle.ourArmyIds ?? []).includes(entry.hostId);
    const { x, y } = entry.marker;
    const rebuilt = this.battleItems.createArmyMarker(
      Math.max(1, men),
      ours,
      ours ? undefined : ui.rivalColor,
      ours
        ? this.state.mapConfig.seed
        : Math.max(0, this.state.kingdoms.findIndex((k) => k.id === battle.kingdomId)),
      { ...hostKitFor(this.state, host), mustered: entry.mustered, shape: ours ? battle.ourFormation : battle.theirFormation },
      this.battleBaseScale(),
    );
    rebuilt.setPosition(x, y);
    if (!ours) faceTravel(rebuilt, -1);
    entry.halfWidth = this.hostHalfWidth(
      host, men, entry.mustered, ours ? battle.ourFormation : battle.theirFormation,
    );

    // Nothing rides on a block any more — the target picker and its ring are gone — so only the
    // drawing is replaced here.
    const parent = entry.marker.parentContainer;
    // Deep, because the endless step belongs to the ranks inside the block and not to the block.
    this.killTweensDeep(entry.marker);
    entry.marker.destroy();
    entry.marker = rebuilt;
    entry.count = rebuilt.list.find((child) => child.type === 'Text') as Phaser.GameObjects.Text | undefined;
    if (parent) parent.add(rebuilt);
    else ui.field.add(rebuilt);

  }

  /**
   * A quân doanh — a field camp, drawn in metres.
   *
   * Every coordinate below is **metres of real camp**, multiplied by `PX_PER_M` and the caller's
   * scale on the way out. That is not decoration: it is the only way this thing can be the right
   * size beside the men, and it was not. Drawn in raw design units and tuned by eye, its tents came
   * out about twice the height a tent is — so a tent stood taller than the buffalo in the next
   * field was long, and the whole camp read as a row of houses that had wandered onto the
   * battlefield. `proportion.ts` records that exact fault happening three times before, always for
   * the same reason: a shape drawn to look right on its own, against nothing.
   *
   * The real dimensions, which are what the numbers below say: a command pavilion 3.8 m at the
   * ridge and seven across, two soldiers' tents at 3.1 and 2.9 m, a palisade of 2 m stakes, a camp
   * gate at 2.8 m, a chòi canh whose platform is 4.6 m up and whose roof reaches 6.6 m, and the
   * đại kỳ on a 6.4 m pole.
   *
   * The first pass had them at 2.4 m and four across, which is a modern hike tent, and beside a
   * five-metre village roof across the field the camp read as a scatter of triangles rather than
   * as the other army's home. A trướng is a pavilion an officer stands up in and holds a council
   * under; the numbers now say that, and the camp reads at about two thirds of the village, which
   * is what the two things actually are.
   */
  private battleCamp(x: number, y: number, color: number, seed = 7, s = 1): Phaser.GameObjects.Container {
    const camp = this.add.container(x, y);
    const g = this.add.graphics();
    // One metre, in pixels, at this scale. Every number below is metres.
    const m = PX_PER_M * s;
    const ink = { colour: PIGMENT.muc, wobble: 0.1 * m, step: 4 };
    // The same three-quarter view every building in the game is drawn in.
    const OB = { x: 0.62, y: -0.42 };

    // The ground it all stands on. Without this the camp floats, which is half of why it read as
    // furniture rather than as a place.
    g.fillStyle(PIGMENT.muc, 0.07);
    g.fillEllipse(0.5 * m, 1.2 * m, 23 * m, 3.6 * m);

    // ── the tents ──────────────────────────────────────────────────────────
    //
    // A ridge tent in oblique: a lit near slope, a shaded far slope, a dark mouth where the flap is
    // tied back, and a ridgepole poking out past the cloth at both ends. Drawn back to front so the
    // near ones print over the far ones — a container does not depth-sort its children.
    const tents = [
      { tx: -6.6, ty: -1.4, w: 2.4, h: 3.1, d: 2.1, seed: seed + 3 },
      { tx: 5.4, ty: -0.9, w: 2.2, h: 2.9, d: 2, seed: seed + 11 },
      // The trướng: the command pavilion, and the reason a camp reads as a headquarters.
      { tx: -0.8, ty: 0.2, w: 3.5, h: 3.8, d: 2.6, seed: seed + 19 },
    ];
    for (const tent of [...tents].sort((a, b) => a.ty - b.ty)) {
      const foot = (tent.ty + 0.5) * m;
      const cx = tent.tx * m;
      const w = tent.w * m;
      const dx = tent.d * m * OB.x;
      const dy = tent.d * m * OB.y;
      const ridgeY = foot - tent.h * m;

      g.fillStyle(PIGMENT.muc, 0.1);
      g.fillEllipse(cx + dx * 0.4, foot + 0.2 * m, w * 2.6, w * 0.7);

      // The far slope, in the shade.
      printedShape(
        g,
        [
          { x: cx + w, y: foot },
          { x: cx + w + dx, y: foot + dy },
          { x: cx + dx, y: ridgeY + dy },
          { x: cx, y: ridgeY },
        ],
        PIGMENT.diepLo, tent.seed + 1, { ...ink, width: 0.22 * m, alpha: 0.62, fillAlpha: 0.95 },
      );
      // The near gable, lit — the face the eye reads the tent off.
      printedShape(
        g,
        [{ x: cx - w, y: foot }, { x: cx, y: ridgeY }, { x: cx + w, y: foot }],
        PIGMENT.diepHi, tent.seed + 2, { ...ink, width: 0.25 * m, alpha: 0.8, fillAlpha: 0.97 },
      );
      // The mouth: a flap tied back on one side, which is what tells you it is a tent and not a
      // wedge of paper.
      printedShape(
        g,
        [
          { x: cx - w * 0.34, y: foot },
          { x: cx - w * 0.05, y: ridgeY + tent.h * m * 0.34 },
          { x: cx + w * 0.3, y: foot },
        ],
        PIGMENT.nauDark, tent.seed + 3, { ...ink, width: 0.16 * m, alpha: 0.5, fillAlpha: 0.72 },
      );
      // The ridgepole, out past the cloth at both ends, and a guy line to a peg.
      inkPath(g, [{ x: cx - 0.25 * m, y: ridgeY + 0.1 * m }, { x: cx + dx + 0.3 * m, y: ridgeY + dy }],
        tent.seed + 4, { ...ink, width: 0.18 * m, alpha: 0.62 });
      inkPath(g, [{ x: cx, y: ridgeY }, { x: cx - w * 1.45, y: foot + 0.15 * m }],
        tent.seed + 5, { ...ink, width: 0.1 * m, alpha: 0.4, wobble: 0.05 * m });
    }

    // ── the fire ───────────────────────────────────────────────────────────
    // A camp is people. One fire and a curl of smoke says so with four strokes.
    const fx = 8.2 * m;
    const fy = 0.4 * m;
    printedShape(
      g,
      [{ x: fx - 0.5 * m, y: fy }, { x: fx, y: fy - 0.85 * m }, { x: fx + 0.5 * m, y: fy }],
      PIGMENT.son, seed + 27, { ...ink, width: 0.14 * m, alpha: 0.55, fillAlpha: 0.8 },
    );
    inkPath(g, [{ x: fx - 0.8 * m, y: fy + 0.08 * m }, { x: fx + 0.8 * m, y: fy - 0.12 * m }], seed + 28,
      { ...ink, width: 0.16 * m, alpha: 0.7 });
    inkPath(
      g,
      [{ x: fx, y: fy - 1.1 * m }, { x: fx - 0.4 * m, y: fy - 2 * m },
        { x: fx + 0.3 * m, y: fy - 2.9 * m }, { x: fx - 0.2 * m, y: fy - 3.8 * m }],
      seed + 29, { ...ink, colour: PIGMENT.mucFaint, width: 0.2 * m, alpha: 0.3, wobble: 0.16 * m },
    );

    // ── the stand of spears ────────────────────────────────────────────────
    // Giá vũ khí: shafts leaned into a cone, which is how an army at rest stacks them.
    const sx = -10 * m;
    for (const lean of [-1, -0.35, 0.35, 1]) {
      inkPath(g, [{ x: sx + lean * 0.6 * m, y: 0.5 * m }, { x: sx + lean * 0.18 * m, y: -2.4 * m }],
        seed + 31 + lean * 10, { ...ink, width: 0.12 * m, alpha: 0.62, wobble: 0.06 * m });
    }

    // ── the palisade, its gate and a watchtower ────────────────────────────
    // In front of the tents, because that is where a fence is — and short, standing on the same
    // ground line as everything else.
    const fenceY = 1.1 * m;
    const stakeH = 2 * m;
    for (let i = -5; i <= 5; i += 1) {
      if (i === 0) continue; // the gateway
      const px = i * 1.9 * m;
      inkPath(g, [{ x: px, y: fenceY }, { x: px + 0.1 * m, y: fenceY - stakeH }], seed + 40 + i,
        { ...ink, width: 0.2 * m, alpha: 0.66, wobble: 0.06 * m });
    }
    // Two rails tying the stakes together — one fence, not a row of sticks.
    for (const t of [0.35, 0.72]) {
      inkPath(g, [{ x: -10 * m, y: fenceY - stakeH * t }, { x: 10 * m, y: fenceY - stakeH * t + 0.1 * m }],
        seed + 47 + t * 10, { ...ink, width: 0.11 * m, alpha: 0.4, step: 6 });
    }
    // The gate: two posts and a lintel.
    for (const gx of [-1.3 * m, 1.3 * m]) {
      inkPath(g, [{ x: gx, y: fenceY + 0.2 * m }, { x: gx, y: fenceY - 2.8 * m }],
        seed + 51 + gx, { ...ink, width: 0.22 * m, alpha: 0.78, wobble: 0.05 * m });
    }
    inkPath(g, [{ x: -1.6 * m, y: fenceY - 2.7 * m }, { x: 1.6 * m, y: fenceY - 2.85 * m }],
      seed + 59, { ...ink, width: 0.2 * m, alpha: 0.72, wobble: 0.06 * m });

    // Chòi canh: a platform 4.6 m up on four legs, with a thatched cap over it.
    const towerX = -9.4 * m;
    for (const lx of [-0.85 * m, 0.85 * m]) {
      inkPath(g, [{ x: towerX + lx, y: fenceY }, { x: towerX + lx * 0.55, y: fenceY - 4.6 * m }],
        seed + 61 + lx, { ...ink, width: 0.17 * m, alpha: 0.66, wobble: 0.05 * m });
    }
    inkPath(g, [{ x: towerX - 0.8 * m, y: fenceY - 2.5 * m }, { x: towerX + 0.8 * m, y: fenceY - 2.5 * m }],
      seed + 63, { ...ink, width: 0.11 * m, alpha: 0.4 });
    printedShape(
      g,
      [{ x: towerX - 1.1 * m, y: fenceY - 4.6 * m }, { x: towerX + 1.1 * m, y: fenceY - 4.6 * m },
        { x: towerX + 0.9 * m, y: fenceY - 5.3 * m }, { x: towerX - 0.9 * m, y: fenceY - 5.3 * m }],
      PIGMENT.diepLo, seed + 65, { ...ink, width: 0.16 * m, alpha: 0.66, fillAlpha: 0.95 },
    );
    printedShape(
      g,
      [{ x: towerX - 1.5 * m, y: fenceY - 5.3 * m }, { x: towerX + 1.5 * m, y: fenceY - 5.3 * m },
        { x: towerX, y: fenceY - 6.6 * m }],
      PIGMENT.nau, seed + 67, { ...ink, width: 0.17 * m, alpha: 0.7, fillAlpha: 0.92 },
    );

    // ── the đại kỳ over the gate ───────────────────────────────────────────
    this.battleStandard(g, 0, fenceY - 2.8 * m, color, seed + 71, m);

    camp.add(g);
    return camp;
  }

  /**
   * The đại kỳ: the great standard an army plants over its own gate.
   *
   * A yellow ground saw-toothed on three sides with a device in the middle, which is what the
   * record describes — but the old one drew the teeth as a rounded scallop and put a plain filled
   * circle at the centre, so at any real size it read as a gold blob with a dot on it. The teeth
   * are cut square now, the cloth carries a border inside its own edge, the device is a ring rather
   * than a disc, and the pole is a pole: a shaft, a finial, and a tassel where the cloth is lashed
   * to it.
   *
   * `m` is one metre in pixels, like the camp it stands in: a 6.4 m pole with three and a half
   * metres of cloth on it.
   */
  private battleStandard(
    g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, seed: number, m: number,
  ): void {
    const ink = { colour: PIGMENT.muc, wobble: 0.08 * m, step: 5 };
    const topY = y - 4.4 * m;
    const botY = y - 2.6 * m;
    const fly = 3.2 * m;
    const tooth = 0.34 * m;

    // The shaft, and the finial on top of it.
    inkPath(g, [{ x, y: y + 0.6 * m }, { x, y: topY - 0.5 * m }], seed,
      { ...ink, width: 0.28 * m, alpha: 0.85, step: 7 });
    printedShape(
      g,
      [{ x: x - 0.28 * m, y: topY - 0.5 * m }, { x, y: topY - 1.1 * m }, { x: x + 0.28 * m, y: topY - 0.5 * m }],
      PIGMENT.hoe, seed + 1, { ...ink, width: 0.13 * m, alpha: 0.7, fillAlpha: 0.95 },
    );

    // The cloth, cut square along the top, the fly and the bottom.
    const teeth: Array<{ x: number; y: number }> = [{ x: x + 0.16 * m, y: topY }];
    const steps = 5;
    for (let i = 0; i < steps; i += 1) {
      const a = x + 0.16 * m + fly * (i / steps);
      const b = x + 0.16 * m + fly * ((i + 0.5) / steps);
      teeth.push({ x: a, y: topY - tooth }, { x: b, y: topY - tooth }, { x: b, y: topY });
    }
    teeth.push({ x: x + 0.16 * m + fly, y: topY });
    teeth.push({ x: x + 0.16 * m + fly + tooth, y: (topY + botY) / 2 });
    teeth.push({ x: x + 0.16 * m + fly, y: botY });
    for (let i = steps; i > 0; i -= 1) {
      const a = x + 0.16 * m + fly * (i / steps);
      const b = x + 0.16 * m + fly * ((i - 0.5) / steps);
      teeth.push({ x: a, y: botY + tooth }, { x: b, y: botY + tooth }, { x: b, y: botY });
    }
    printedShape(g, teeth, PIGMENT.hoe, seed + 2, { ...ink, width: 0.17 * m, alpha: 0.75, fillAlpha: 0.95 });

    // A border inside the edge, so the cloth has a hem instead of being a shape.
    inkPath(
      g,
      [{ x: x + 0.5 * m, y: topY + 0.35 * m }, { x: x + fly - 0.2 * m, y: topY + 0.35 * m },
        { x: x + fly - 0.2 * m, y: botY - 0.35 * m }, { x: x + 0.5 * m, y: botY - 0.35 * m },
        { x: x + 0.5 * m, y: topY + 0.35 * m }],
      seed + 3, { ...ink, colour: PIGMENT.nauDark, width: 0.11 * m, alpha: 0.4, step: 7 },
    );

    // The device, in the side's own colour — a ring, not a dot. The realm's colour rides on the
    // device rather than on the cloth, so sỏi son stays spent on the player alone.
    const cx = x + 0.16 * m + fly * 0.45;
    const cy = (topY + botY) / 2;
    g.lineStyle(0.28 * m, color, 0.9);
    g.strokeCircle(cx, cy, 0.5 * m);
    g.fillStyle(color, 0.9);
    g.fillCircle(cx, cy, 0.18 * m);

    // The lashing, and a tassel hanging off it.
    inkPath(g, [{ x: x - 0.2 * m, y: topY + 0.18 * m }, { x: x + 0.36 * m, y: topY + 0.18 * m }], seed + 4,
      { ...ink, width: 0.16 * m, alpha: 0.6 });
    inkPath(g, [{ x: x - 0.08 * m, y: topY + 0.25 * m }, { x: x - 0.32 * m, y: topY + 1 * m }], seed + 5,
      { ...ink, colour: PIGMENT.son, width: 0.16 * m, alpha: 0.55, wobble: 0.16 * m });
  }



  /**
   * Beats the screen forward.
   *
   * The fight belongs to the world — `advanceBattle` runs it from the economy tick, whether or
   * not anyone is watching — so this clock only asks the screen to catch up. Leaving the screen
   * no longer stops the siege, and coming back shows where it got to.
   */
  private startBattleClock(): void {
    this.stopBattleClock();
    this.battleClock = this.time.addEvent({
      // The player's own dial. Paired with `battleBeatsPerTick` so the screen drains a season's
      // beats inside the season that produced them — see `battleOptions`.
      delay: battleTickMs(),
      loop: true,
      callback: () => {
        // Beat first, then draw: the frame the rest of the refresh reads is the one just taken.
        this.drainBattleBeat();
        this.refresh();
      },
    });
  }

  private stopBattleClock(): void {
    this.battleClock?.remove();
    this.battleClock = undefined;
  }

  private showRivalDemand(prompt: Extract<AscentPrompt, { kind: 'rival-demand' }>): void {
    const kingdom = this.state.kingdoms.find((candidate) => candidate.id === prompt.kingdomId);
    const standing = kingdom ? realmStanding(this.state, kingdom) : 'even';

    const title = prompt.demand === 'tribute'
      ? t('ascent.rival.tributeTitle', { kingdom: prompt.kingdomName })
      : prompt.demand === 'coalition'
        ? t('ascent.rival.coalitionTitle')
        : t('ascent.rival.vassalTitle', { kingdom: prompt.kingdomName });

    const body = prompt.demand === 'tribute'
      ? t('ascent.rival.tributeBody')
      : prompt.demand === 'coalition'
        ? t('ascent.rival.coalitionBody', {
            members: (prompt.memberNames ?? []).join(', '),
            ticks: prompt.ticks ?? 0,
          })
        : t('ascent.rival.vassalBody');

    // Aliased: `body` is already the demand's description text in this scope.
    const { body: scrollBody, bodyWidth, finish } = this.promptScrollBody(
      title,
      `${body}
${t(`ascent.rival.standing.${standing}` as Parameters<typeof t>[0])}`,
      0,
    );

    const rowHeight = 80;
    const cards: Phaser.GameObjects.Container[] = [];
    let used = 0;
    prompt.options.forEach((option) => {
      const gold = option.cost?.gold ?? prompt.gold ?? 0;
      const label = t(`ascent.rival.${option.id === 'buy-off' ? 'buyOff' : option.id}` as Parameters<typeof t>[0]);
      const detail = t(
        `ascent.rival.${option.id === 'buy-off' ? 'buyOff' : option.id}D` as Parameters<typeof t>[0],
        { gold, ticks: prompt.ticks ?? TRIBUTE_REFUSE_TICKS },
      );

      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: rowHeight },
        {
          icon: iconForOption(option.id),
          title: label,
          body: detail,
          note: option.cost?.gold
            ? (option.affordable ? formatResourceList(option.cost) : t('ascent.response.cantAfford'))
            : undefined,
          noteColor: option.affordable ? undefined : '#a4402c',
          // Defiance is the red option: free now, paid for on the wave curve.
          accent: !option.affordable
            ? INK_UI.softBrush
            : option.id === 'refuse' || option.id === 'defy' || option.id === 'endure'
              ? INK_UI.cinnabar
              : INK_UI.gold,
          disabled: !option.affordable,
          parent: scrollBody,
          onTap: () => this.choose(option.id),
        },
      );
      cards.push(card);
      used += ((card.getData('cardHeight') as number) ?? rowHeight) + 10;
    });
    staggerIn(this, cards);
    finish(used);
  }

  private showEmpireResponse(prompt: Extract<AscentPrompt, { kind: 'empire-response' }>): void {
    // Aliased: `body` is the per-option description string built inside the loop below.
    const { body: scrollBody, bodyWidth, finish } = this.promptScrollBody(
      t('ascent.response.title', { kingdom: prompt.kingdomName }),
      t('ascent.response.subtitle', { ticks: prompt.ticksToArrival, threat: Math.round(prompt.threat) }),
      0,
    );

    // Taller than the other prompts' rows: these titles name a commander and can wrap, and the
    // body carries both a cost and an effect.
    const rowHeight = 96;
    const cards: Phaser.GameObjects.Container[] = [];
    let used = 0;

    // Each row carries the *axis* it acts on as a badge — this battle, every battle after it,
    // the next one, or no battle at all. Five answers that differ in kind were reading as one
    // because every row led with a win percentage, and those percentages sat within five points
    // of each other. The badge is what makes the card scannable as a real choice; the odds now
    // appear only on the two options that genuinely move this battle.
    const AXIS: Record<string, string> = {
      'send-host': t('ascent.response.axisNext'),
      'hire-mercenaries': t('ascent.response.axisNow'),
      fortify: t('ascent.response.axisPermanent'),
      'buy-off': t('ascent.response.axisNoBattle'),
      endure: t('ascent.response.axisNow'),
    };

    /**
     * How the odds read on a row.
     *
     * `resolveInvaderBattle` is a threshold with a ±10% roll, not a coin flip, so its honest
     * answer is usually a certainty. Printing "100% to hold" and "0% to hold" is technically
     * right and reads like a bug; saying it plainly is both truer to the model and a far
     * clearer instruction — the whole question on this card is which side of the line the
     * realm ends up on, and which purchase moves it there.
     */
    const oddsLabel = (pct: number | undefined): string => {
      if (pct === undefined) return '';
      if (pct >= 100) return t('ascent.response.willHold');
      if (pct <= 0) return t('ascent.response.willFall');
      return t('ascent.response.oddsPct', { pct });
    };

    prompt.options.forEach((option, index) => {
      const commander = responseCommanderName(this.state, option.heroId);
      let title: string;
      let body: string;

      switch (option.id) {
        case 'send-host':
          // The commander is named on the option itself: choosing who leads and raising the
          // host are one decision on one screen, never a trip to a hero roster.
          title = commander
            ? t('ascent.response.sendHost', { hero: commander })
            : t('ascent.response.sendHostNoHero');
          body = t('ascent.response.sendHostD', {
            supplies: option.cost?.supplies ?? 0,
            n: option.soldiers ?? 0,
          });
          break;
        case 'hire-mercenaries':
          title = t('ascent.response.mercenaries');
          body = t('ascent.response.mercenariesD', {
            gold: option.cost?.gold ?? 0,
            odds: oddsLabel(option.winChance),
          });
          break;
        case 'fortify':
          title = t('ascent.response.fortify');
          body = t('ascent.response.fortifyD', {
            gold: option.cost?.gold ?? 0,
            def: option.defence ?? 0,
            odds: oddsLabel(option.winChance),
          });
          break;
        case 'buy-off':
          title = t('ascent.response.buyOff');
          body = t('ascent.response.buyOffD', { gold: option.cost?.gold ?? 0, ticks: option.delayTicks ?? 0 });
          break;
        default:
          title = t('ascent.response.endure');
          body = t('ascent.response.endureD', { xp: option.momentum ?? 0, odds: oddsLabel(option.winChance) });
          break;
      }

      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: rowHeight },
        {
          icon: iconForOption(option.id),
          title,
          body,
          badge: AXIS[option.id],
          note: option.affordable ? undefined : t('ascent.response.cantAfford'),
          // Buying the wave away is the one row that ends the threat outright, so it reads as
          // the safe choice; enduring takes the hit on purpose, so it reads as the risky one.
          accent: !option.affordable
            ? INK_UI.softBrush
            : option.id === 'buy-off'
              ? INK_UI.jade
              : option.id === 'endure'
                ? INK_UI.cinnabar
                : INK_UI.gold,
          disabled: !option.affordable,
          parent: scrollBody,
          onTap: () => this.choose(option.id),
        },
      );
      cards.push(card);
      used += ((card.getData('cardHeight') as number) ?? rowHeight) + 10;
    });
    staggerIn(this, cards);
    finish(used);
  }

  private showWaveResult(prompt: Extract<AscentPrompt, { kind: 'wave-result' }>): void {
    const content = this.promptFrame(
      prompt.survived ? t('ascent.wave.bossTitle', { wave: prompt.wave }) : t('ascent.wave.bossTitleLost'),
      prompt.lines.filter(Boolean).join('\n'),
    );

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: content.y + 40, width: content.width, height: 46 },
      t('ascent.wave.continue'),
      () => this.choose('ok'),
      { variant: 'primary', fontSize: '14px' },
    ));
  }

  /**
   * The founding: the champion who raises the dynasty you rule, dealt as a hand you hold.
   *
   * Three heroes, one 390-wide screen. Three columns cannot carry a bio, and three full cards
   * do not fit down the page, so the older layout was a carousel with two arrows nobody pressed.
   * A deck fixes the same problem with the gesture a phone already teaches: the front card is
   * whole, the ones behind it are visibly still there, and the thumb decides.
   */
  private showFounder(prompt: Extract<AscentPrompt, { kind: 'founder' }>): void {
    const codex = codexProgress();
    const heroes = prompt.options
      .map((id) => this.state.heroDeck.find((candidate) => candidate.id === id))
      .filter((hero): hero is Hero => Boolean(hero));
    if (heroes.length === 0) {
      this.promptFrame(t('ascent.founder.title'), t('ascent.founder.subtitle'));
      return;
    }

    this.heroDeckPrompt({
      title: t('ascent.founder.title'),
      subtitle: `${t('ascent.founder.subtitle')}
${t('ascent.codex.subtitle', codex)}`,
      heroes,
      noteFor: (hero) => arrivalPreview(hero) ?? t(`ascent.founder.gift.${hero.type}` as Parameters<typeof t>[0]),
      confirmLabel: t('ascent.founder.confirm'),
      onSelect: (hero) => this.choose(hero.id),
    });
  }

  /**
   * The court on the morning it changes hands: the hall, the empty seat, and your two standards.
   *
   * This was a single flag on bare paper, which said "here is a colour" and nothing else. The
   * screen it sits on is the one that announces a reign, so it now draws the place the reign
   * happens — roof, colonnade, steps, bronze urns, and nobody in the courtyard, because the
   * court has not been called yet. The flags stay, one at each side and named underneath: every
   * province the player takes will fly them, and this is still the cheapest place to teach a
   * colour the rest of the run depends on reading quickly.
   */
  private addThroneHall(parent: Phaser.GameObjects.Container, width: number): number {
    // On a short surface — `GAME_HEIGHT` clamps to 620 in a desktop browser — the court plus the
    // three advantages overruns the sheet by about a dozen pixels, and the whole screen starts
    // scrolling for no gain. The diorama is the part that can afford to give: it is a picture,
    // not information.
    const scale = GAME_HEIGHT < 700 ? 0.84 : 1;
    const drawn = Math.round(THRONE_HALL_HEIGHT * scale);
    const hall = throneHallDiorama(this, width, this.state.mapConfig.seed);
    hall.setScale(scale).setPosition((width * (1 - scale)) / 2, 0);
    parent.add(hall);

    const band = this.add.graphics();
    sawtoothBand(band, 0, drawn + 4, width, 7, 0.5);
    parent.add(band);

    const caption = this.add.text(0, drawn + 16, t('ascent.founder.standard'), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', align: 'center',
      wordWrap: { width },
    }).setFixedSize(width, 0);
    parent.add(caption);
    return drawn + 16 + caption.height + 10;
  }

  /**
   * The reign's first card: you take the throne, and choose what it already holds.
   *
   * Three across rather than stacked, because these are three *different first moves* and the
   * player should see all three at once to compare them. At 390 wide that is ~109px a column,
   * which fits a glyph, a name and one line and nothing else — no rarity badge in particular,
   * since `BADGE_CLEARANCE` (86) would drive the title width negative.
   *
   * Built the way `actionTiles` builds a row: every text object first, one `Math.max` over their
   * heights, *then* the surfaces. Letting each card size itself independently gives a ragged row.
   */
  private showMandate(prompt: Extract<AscentPrompt, { kind: 'mandate' }>): void {
    const { body, bodyWidth, finish } = this.promptScrollBody(
      t('ascent.mandate.title'),
      t('ascent.mandate.subtitle'),
      0,
    );

    const top = this.addThroneHall(body, bodyWidth);
    const GAP = 8;
    const column = Math.floor((bodyWidth - GAP * 2) / 3);

    // Pass one: build the text, keep it, and remember the tallest.
    const built = prompt.options.map((cardId, index) => {
      const view = powerCardView(this.state, cardId);
      const x = index * (column + GAP);
      const title = this.ui.label(x + 10, 44, view?.name ?? cardId, 'label', {
        fontSize: '11.5px', align: 'center', wordWrap: { width: column - 20 },
      }).setFixedSize(column - 20, 0);
      const desc = this.add.text(x + 10, 0, view?.description ?? '', {
        color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', align: 'center',
        wordWrap: { width: column - 20 },
      }).setFixedSize(column - 20, 0);
      return { cardId, x, title, desc };
    });
    const headHeight = 44 + Math.max(...built.map((b) => b.title.height)) + 6;
    const height = headHeight + Math.max(...built.map((b) => b.desc.height)) + 12;

    // Pass two: surfaces behind the measured text, every column the same height.
    const cards = built.map(({ cardId, x, title, desc }) => {
      const card = this.add.container(x, top);
      title.setPosition(10, 44);
      desc.setPosition(10, headHeight);
      const surface = this.ui.panel({ x: 0, y: 0, width: column, height },
        { border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52 });
      card.add(surface);
      const wash = this.add.graphics();
      wash.fillStyle(INK_UI.gold, 0.09);
      wash.fillRoundedRect(2, 2, column - 4, height - 4, 8);
      card.add(wash);
      const glyph = drawCardIcon(this, iconForOption(cardId) ?? 'crown', INK_UI.gold);
      glyph.setPosition(column / 2, 26);
      card.add(glyph);
      card.add(title);
      card.add(desc);
      const zone = this.add.zone(0, 0, column, height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (scrollGestureConsumedTap(pointer)) return;
        this.choose(cardId);
      });
      card.add(zone);
      body.add(card);
      return card;
    });
    staggerIn(this, cards);
    finish(top + height + 16);
  }

  /**
   * One champion, drawn as a card you would hold: portrait first, then who they are, then the
   * one line that says what taking them changes on the board.
   *
   * Fixed height on purpose — every card in a stack has to be the same size, or the ones peeking
   * out behind the front one stick out at different distances and the deck reads as a mess. The
   * height comes from the room the screen actually has, so the only thing that gives is the bio:
   * `maxLines` is computed from what is left after the note is placed, rather than letting a long
   * life story push the gift line off the bottom edge.
   */
  private heroDeckCard(
    hero: Hero,
    width: number,
    height: number,
    opts: { badge?: string; note?: string },
  ): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    const tier = tierForHero(hero);
    const PAD = 12;
    const textWidth = width - PAD * 2;

    // Paper, wash and the rarity rail first: everything else is read off them.
    container.add(this.ui.panel({ x: 0, y: 0, width, height }, {
      border: INK_UI.brush, borderWidth: 1.2, borderAlpha: 0.52,
    }));
    const wash = this.add.graphics();
    wash.fillStyle(RARITY_COLOR[tier], RARITY_WASH[tier]);
    wash.fillRoundedRect(2, 2, width - 4, height - 4, 8);
    container.add(wash);
    // A ruler's card is the only one in the mode that gets a ground of its own, and a chop.
    if (hero.arrival) {
      const ground = this.add.graphics();
      ground.fillStyle(INK_UI.gold, 0.1);
      ground.fillRoundedRect(2, 2, width - 4, height - 4, 8);
      container.add(ground);
    }
    const rail = this.add.graphics();
    rail.fillStyle(RARITY_COLOR[tier], 1);
    rail.fillRect(1, 6, 4.5, height - 12);
    container.add(rail);

    // Rarity on the left, whatever the screen wants to shout on the right.
    container.add(this.add.text(PAD, 10, rarityLabel(hero.rarity), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700',
    }));
    if (opts.badge) {
      container.add(this.add.text(width - PAD, 10, opts.badge, {
        color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '10px', fontStyle: '700',
      }).setOrigin(1, 0));
    }

    const faceHeight = Phaser.Math.Clamp(Math.round(height * 0.42), 88, 142);
    const faceWidth = Math.round(faceHeight * 0.78);
    container.add(renderHeroFaceInBox(this, hero, {
      x: (width - faceWidth) / 2, y: 26, width: faceWidth, height: faceHeight,
    }));

    let cursor = 26 + faceHeight + 6;
    const name = this.add.text(width / 2, cursor, heroName(hero), {
      color: INK_UI_HEX.inkText, fontFamily: TITLE_FONT, fontSize: '17px', fontStyle: '700',
      align: 'center', wordWrap: { width: textWidth },
    }).setOrigin(0.5, 0);
    container.add(name);
    cursor += name.height + 2;

    const line = this.add.text(width / 2, cursor,
      `${heroTypeLabel(hero.type)}   ·   ${this.heroStatLine(hero)}`, {
        color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10.5px', align: 'center',
      }).setOrigin(0.5, 0);
    container.add(line);
    cursor += line.height + 6;

    const rule = this.add.graphics();
    sawtoothBand(rule, PAD + 12, cursor, textWidth - 24, 5, 0.4);
    container.add(rule);
    cursor += 12;

    // The note is pinned to the foot, so the bio is given exactly the gap that is left.
    let noteTop = height - PAD;
    if (opts.note) {
      const note = this.add.text(width / 2, 0, opts.note, {
        color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '10.5px', fontStyle: '700',
        align: 'center', wordWrap: { width: textWidth },
      }).setOrigin(0.5, 0);
      noteTop = height - PAD - note.height;
      note.setY(noteTop);
      container.add(note);
    }

    const BIO_LINE = 15;
    const bioRoom = noteTop - 6 - cursor;
    const bioLines = Math.max(1, Math.floor(bioRoom / BIO_LINE));
    const bio = this.add.text(width / 2, cursor, heroBio(hero), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10.5px', align: 'center',
      lineSpacing: 2, wordWrap: { width: textWidth }, maxLines: bioLines,
    }).setOrigin(0.5, 0);
    // `maxLines` alone cuts the last line dead, mid-word, with nothing to say it was cut — the
    // life stories in this game run long enough that a card regularly ended on "Trước khi".
    // Re-set it to the lines that fit, ending on a whole word and an ellipsis.
    const wrapped = bio.getWrappedText();
    if (wrapped.length > bioLines) {
      bio.setText(`${wrapped.slice(0, bioLines).join(' ').replace(/[\s,;:.—–-]+$/u, '')}…`);
    }
    // A two-line life against a card sized for six leaves a hole in the middle of the paper, so
    // the bio floats in the gap it was given rather than clinging to the rule above it.
    bio.setY(cursor + Math.max(0, Math.round((bioRoom - bio.height) / 2)));
    container.add(bio);

    if (hero.arrival) {
      const chop = this.add.graphics();
      seal(chop, width - 28, height - 26, 22, 'lotus');
      container.add(chop);
    }

    // Gold and Jade pulls glow — the one moment the mode leans into the gacha reveal.
    if (tier === 'gold' || tier === 'jade') {
      const glow = this.add.graphics();
      glow.lineStyle(3, RARITY_COLOR[tier], 0.8);
      glow.strokeRoundedRect(-2, -2, width + 4, height + 4, 10);
      container.add(glow);
      this.tweens.add({
        targets: glow, alpha: { from: 0.25, to: 1 }, duration: 900, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    return container;
  }

  /**
   * Every "choose a champion out of a draw" screen in the mode: the founding, the summon, and
   * the court's presentation.
   *
   * One deck, flicked through with the thumb, plus buttons that do exactly what the gestures do —
   * the gestures are the fast path, never the only path, because a mouse has no thumb and a
   * player who has not read the hint still has to be able to finish the screen. Deliberately not
   * built on `promptScrollBody`: an `InkScrollArea` drives itself off the scene's pointer stream,
   * so a vertical flick would scroll the sheet *and* take the card.
   */
  private heroDeckPrompt(opts: {
    title: string;
    subtitle: string;
    heroes: Hero[];
    badgeFor?: (hero: Hero) => string | undefined;
    noteFor?: (hero: Hero) => string | undefined;
    confirmLabel: string;
    ignoreLabel?: string;
    onSelect: (hero: Hero) => void;
    onIgnore?: () => void;
  }): void {
    const content = this.promptFrame(opts.title, opts.subtitle);

    // Room for the footer buttons, the dots-and-hint strip, and the two cards fanned below.
    const HINT_STRIP = 38;
    const available = content.height - PROMPT_FOOTER_HEIGHT - HINT_STRIP - CARD_STACK_PEEK;
    const cardHeight = Phaser.Math.Clamp(available, 200, 340);
    // The fanned cards rotate a little, so the deck is inset from the content edges or their
    // corners clip through the screen's margin.
    const cardWidth = content.width - 12;
    const cardX = content.x + 6;
    const cardY = content.y + Math.max(0, Math.round((available - cardHeight) / 2));

    const cards = opts.heroes.map((hero) => this.heroDeckCard(hero, cardWidth, cardHeight, {
      badge: opts.badgeFor?.(hero),
      note: opts.noteFor?.(hero),
    }));

    const stripY = cardY + cardHeight + CARD_STACK_PEEK + 8;

    // Which of them you are holding. Three cards deep, the fan alone does not say "of three".
    const dots = this.add.graphics();
    this.modalLayer.add(dots);
    const paintDots = (index: number): void => {
      dots.clear();
      const span = opts.heroes.length * 14;
      opts.heroes.forEach((_, i) => {
        dots.fillStyle(i === index ? INK_UI.cinnabar : INK_UI.softBrush, i === index ? 1 : 0.35);
        dots.fillCircle(GAME_WIDTH / 2 - span / 2 + 7 + i * 14, stripY + 4, i === index ? 4 : 3);
      });
    };

    const stack = new CardStack(this, {
      x: cardX,
      y: cardY,
      width: cardWidth,
      height: cardHeight,
      cards,
      onSelect: (index) => opts.onSelect(opts.heroes[index]),
      onBrowse: paintDots,
    });
    this.modalLayer.add(stack.view);
    paintDots(0);

    // How the deck works, said once, under it. A gesture nobody is told about is a gesture nobody
    // makes — the carousel this replaced had exactly that problem and answered it with arrows.
    this.modalLayer.add(this.add.text(GAME_WIDTH / 2, stripY + 14, t('ascent.pick.hint'), {
      color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '10px', align: 'center',
      wordWrap: { width: content.width - 60 },
    }).setOrigin(0.5, 0));

    // The arrows stay, for the mouse and for the player who has not tried the flick yet.
    if (opts.heroes.length > 1) {
      const arrow = (x: number, glyph: string, step: number): void => {
        const hit = this.add.text(x, stripY + 12, glyph, {
          color: INK_UI_HEX.mutedText, fontFamily: UI_FONT, fontSize: '20px',
        }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => stack.browse(step));
        this.modalLayer.add(hit);
      };
      arrow(content.x + 10, '◀', -1);
      arrow(content.x + content.width - 10, '▶', 1);
    }

    const footerY = GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8;
    if (opts.ignoreLabel && opts.onIgnore) {
      const gap = 10;
      const half = Math.floor((content.width - gap) / 2);
      this.modalLayer.add(this.ui.button(
        { x: content.x, y: footerY, width: half, height: 40 },
        opts.ignoreLabel,
        opts.onIgnore,
        { variant: 'ghost', fontSize: '13px' },
      ));
      this.modalLayer.add(this.ui.button(
        { x: content.x + half + gap, y: footerY, width: content.width - half - gap, height: 40 },
        opts.confirmLabel,
        () => stack.select(),
        { variant: 'primary', fontSize: '13px' },
      ));
      return;
    }
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: footerY, width: content.width, height: 40 },
      opts.confirmLabel,
      () => stack.select(),
      { variant: 'primary', fontSize: '14px' },
    ));
  }

  /**
   * The summary. This is the screen that has to sell the *next* run, and it was the least
   * readable screen in the game: seven dim rows of brown-on-brown sitting directly on the
   * dimmed map, ending in one button back to the menu. Nothing named what had killed you,
   * nothing compared the run to your best, and nothing hinted that banked Legacy buys
   * permanent upgrades — so a loss taught the player nothing and offered them nothing.
   *
   * Now: a panel so the text has its own ground, the cause of death in plain words, the score
   * against the record you are chasing, what the run banked and what that is nearly enough to
   * buy, and a one-tap way back in.
   */
  private showRunOver(prompt: Extract<AscentPrompt, { kind: 'run-over' }>): void {
    const ascent = this.state.ascent;
    const beatBest = prompt.score > prompt.previousBest;

    // The reign leads the subtitle when it has a name. The Reckoning previously said only how the
    // dynasty fell, so a run that legislated its way to the Hong Duc code closed on exactly the
    // same sentence as one that never passed a law — the two things it is most worth telling apart.
    const fall = prompt.cause === 'capital'
      ? t('ascent.over.causeCapital', { land: prompt.landName ?? '', waves: ascent?.wavesSurvived ?? 0 })
      : t('ascent.over.causeAnnihilated', { waves: ascent?.wavesSurvived ?? 0 });
    const content = this.promptFrame(
      prompt.reign ?? t('ascent.over.title'),
      prompt.reignDetail ? `${prompt.reignDetail}
${fall}` : fall,
    );

    // ── The headline: this run against the record ───────────────────────────
    const headHeight = 78;
    const head = this.ui.panel(
      { x: content.x, y: content.y, width: content.width, height: headHeight },
      { border: beatBest ? INK_UI.gold : INK_UI.softBrush, borderWidth: 2 },
    );
    this.modalLayer.add(head);
    this.modalLayer.add(this.ui.label(content.x + 16, content.y + 12,
      beatBest ? t('ascent.over.newBest') : t('ascent.over.scoreLabel'), 'caption', {}));
    this.modalLayer.add(this.ui.label(content.x + 16, content.y + 30,
      prompt.score.toLocaleString('en-US'), 'label', { fontSize: '30px' }));
    this.modalLayer.add(this.ui.label(content.x + content.width - 16, content.y + 34,
      t('ascent.over.best', { best: Math.max(prompt.previousBest, prompt.score).toLocaleString('en-US') }),
      'caption', { align: 'right' }).setOrigin(1, 0));

    // ── What the run was made of ────────────────────────────────────────────
    const rows: Array<[string, string]> = [
      [t('ascent.over.waves'), String(ascent?.wavesSurvived ?? 0)],
      [t('ascent.over.peakPower'), Math.round(ascent?.peakPower ?? 0).toLocaleString('en-US')],
      [t('ascent.over.lands'), String(this.state.campaignScore?.peakLandsHeld ?? 0)],
      [t('ascent.over.heroes'), String(ascent?.heroesSummoned ?? 0)],
      [t('ascent.over.cards'), String(Object.values(ascent?.cardStacks ?? {}).reduce((a, b) => a + b, 0))],
    ];
    // The Chronicle, at the one moment the run is being summed up. Five stories conclude in a
    // typical run and the Reckoning used to mention none of them; a reign that mostly followed the
    // record is a different reign from one that mostly did not, and this is the line that says so.
    const storyTally = chronicleTally(this.state);
    const endings = storyTally['chinh-su'] + storyTally['da-su'] + storyTally['ngoai-truyen'];
    if (endings > 0) {
      rows.push([t('ascent.over.stories'), String(endings)]);
      rows.push(['', t('ascent.over.storyLine', storyTally)]);
    }
    const bodyY = content.y + headHeight + 10;
    const bodyHeight = rows.length * 26 + 20;
    this.modalLayer.add(this.ui.panel(
      { x: content.x, y: bodyY, width: content.width, height: bodyHeight },
      { border: INK_UI.softBrush },
    ));
    rows.forEach(([label, value], index) => {
      this.modalLayer.add(this.ui.infoRow(
        { x: content.x + 14, y: bodyY + 12 + index * 26, width: content.width - 28, height: 22 },
        label, value,
      ));
    });

    // ── Legacy: the reason to press the button ──────────────────────────────
    const legacyY = bodyY + bodyHeight + 10;
    const nextPerk = LEGACY_PERKS
      .filter((perk) => !ownsPerk(perk.id))
      .sort((a, b) => a.cost - b.cost)[0];
    const legacyHeight = nextPerk ? 74 : 50;
    this.modalLayer.add(this.ui.panel(
      { x: content.x, y: legacyY, width: content.width, height: legacyHeight },
      { border: INK_UI.gold, borderWidth: 2 },
    ));
    this.modalLayer.add(this.ui.label(content.x + 14, legacyY + 10,
      t('ascent.over.legacyEarned', { earned: prompt.legacyEarned, total: prompt.legacyTotal }), 'label', {
        fontSize: '13px', wordWrap: { width: content.width - 28 },
      }));
    if (nextPerk) {
      const short = Math.max(0, nextPerk.cost - prompt.legacyTotal);
      this.modalLayer.add(this.ui.label(content.x + 14, legacyY + 32,
        short > 0
          ? t('ascent.over.perkShort', { perk: t(`empire.legacy.perk.${nextPerk.id}` as Parameters<typeof t>[0]), short })
          : t('ascent.over.perkReady', { perk: t(`empire.legacy.perk.${nextPerk.id}` as Parameters<typeof t>[0]) }),
        'caption', { wordWrap: { width: content.width - 28 } }));
      this.modalLayer.add(this.ui.statBar(
        { x: content.x + 14, y: legacyY + legacyHeight - 14, width: content.width - 28, height: 6 },
        Math.min(prompt.legacyTotal, nextPerk.cost), nextPerk.cost, INK_UI.gold,
      ));
    }

    // ── Back in, or out to spend ────────────────────────────────────────────
    const buttonY = legacyY + legacyHeight + 14;
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: buttonY, width: content.width, height: 46 },
      t('ascent.over.again'),
      () => this.events.emit('ui:restart-ascent'),
      { variant: 'primary', fontSize: '15px' },
    ));
    // The Codex belongs here and nowhere else in a run: this is the moment the collection actually
    // changed, and the only moment a player has a reason to look at what they have recorded. On the
    // action bar it was a button promising something to do about a list of "???" rows.
    const codex = codexProgress();
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: buttonY + 54, width: content.width / 2 - 5, height: 40 },
      t('ascent.codex.button', codex),
      () => this.showCodex(),
      { fontSize: '12px' },
    ));
    // The other shelf, beside the champions: how much of the Chronicle this player has actually
    // met. The catalogue is several times larger than one run and nothing else says so.
    const stories = storyProgress(storyCatalogIds.length);
    this.modalLayer.add(this.ui.label(
      content.x, buttonY + 100,
      `${t('ascent.codex.stories')}  ${stories.met}/${stories.total}`,
      'caption', { fontSize: '11px' },
    ));
    this.modalLayer.add(this.ui.button(
      { x: content.x + content.width / 2 + 5, y: buttonY + 54, width: content.width / 2 - 5, height: 40 },
      t('ascent.over.return'),
      () => this.events.emit('ui:exit-to-menu'),
      { fontSize: '13px' },
    ));
  }

  // ── Persistent controls ───────────────────────────────────────────────────
  //
  // Pause, Codex and Leave used to be three small floating buttons in the bottom-right
  // corner. They now live on the shared `ActionBar` alongside the three system lanes, so
  // this mode has the same standing bottom bar as the classic ones — and, critically, the
  // player always has somewhere to *go* rather than only cards to answer.

  /**
   * Save and leave, and nothing else.
   *
   * This mode had none of it. The Pause button toggled `isStrategyPause` and nothing else, so a
   * run could be halted but never *left* — there was no way to save and exit at all, and closing
   * the tab lost the run outright. The classic modes have offered exactly these three choices
   * from `UIScene` since the beginning; ascent simply never surfaced them, and `ui:exit-to-menu`
   * (handled in `MapScene`, which `ConquestScene` extends) already does the work.
   *
   * Then the fix overcorrected: those choices were put *behind* the Pause button, so the one
   * control labelled Pause/Resume opened a sheet whose other two options ended the run, and
   * stopping the clock to think meant staring at an exit menu. The two jobs are two buttons
   * now — ❚❚ stops time, ☰ opens this — and this sheet's own first item only closes itself.
   *
   * `saveSnapshot` round-trips this mode: `MenuScene` boots a saved `gameMode === 'ascent'`
   * straight back into `ConquestScene`.
   */
  private showSystemMenu(): void {
    // Reading the world while it moves is not what a menu is for, so it holds the clock — and
    // hands back whatever the player had set when it closes, rather than always resuming.
    this.lanePauseBeforeOpen = this.state.isStrategyPause;
    this.state.isStrategyPause = true;
    this.beginOverlay('menu');

    const content = this.promptFrame(t('ascent.sys.title'), t('ascent.sys.body', {
      year: this.state.year,
      waves: this.state.ascent?.wavesSurvived ?? 0,
    }));

    const rowH = 52;
    let y = content.y;
    const item = (label: string, variant: 'primary' | 'secondary' | 'danger', onTap: () => void): void => {
      this.modalLayer.add(this.ui.button(
        { x: content.x, y, width: content.width, height: rowH },
        label, onTap, { variant, fontSize: '14px' },
      ));
      y += rowH + 10;
    };

    item(t('ascent.sys.back'), 'primary', () => this.closeLane());

    // Battles: watched, or left to the generals.
    //
    // Choosing "leave it to my generals" on the battle screen used to be permanent — nothing
    // anywhere set `autoResolveBattles` back to false, so one tap during one fight silently
    // disabled the best screen in the mode for the rest of the run, with no way to tell that had
    // happened or to undo it. A setting the player can see is also a setting they can reverse.
    const auto = this.state.ascent?.autoResolveBattles ?? false;
    item(
      auto ? t('ascent.sys.battlesAuto') : t('ascent.sys.battlesWatched'),
      'secondary',
      () => {
        if (this.state.ascent) this.state.ascent.autoResolveBattles = !auto;
        // Redraw so the row states the new setting rather than the old one.
        this.state.isStrategyPause = this.lanePauseBeforeOpen;
        this.closeOverlay();
        this.showSystemMenu();
      },
    );

    item(t('action.saveAndExit'), 'secondary', () => this.events.emit('ui:exit-to-menu', true));
    item(t('action.exitWithoutSaving'), 'danger', () => this.events.emit('ui:exit-to-menu', false));
  }

  /** The permanent collection — the reason summoning a new champion is worth something. */
  showCodex(): void {
    // Holds the clock like every other screen that covers the map. It was the one that did not,
    // because it is opened outside `openLane` — so the world kept turning behind a full-screen
    // overlay the player was reading.
    this.lanePauseBeforeOpen = this.state.isStrategyPause;
    this.state.isStrategyPause = true;
    this.beginOverlay('codex');

    const progress = codexProgress();
    const content = this.promptFrame(
      t('ascent.codex.title'),
      `${t('ascent.codex.subtitle', progress)}\n${t('ascent.codex.hint')}`,
    );

    const unlocked = new Set(getCodex().unlocked);
    const scroll = this.ui.scrollArea({
      x: content.x,
      y: content.y,
      width: content.width,
      height: content.height - LANE_FOOTER_HEIGHT,
    });
    scroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(scroll);

    let y = 0;
    for (const hero of heroTemplates) {
      const known = unlocked.has(hero.id);
      const tier = tierForHero(hero);
      const row = this.ui.card({ x: 0, y, width: content.width - 6, height: 54 }, {
        title: known ? heroName(hero) : '???',
        subtitle: known ? `${heroTypeLabel(hero.type)} · ${rarityLabel(hero.rarity)}` : t('ascent.codex.locked'),
        border: known ? RARITY_COLOR[tier] : INK_UI.softBrush,
        muted: !known,
      });
      scroll.content.add(row);
      y += (row.getData('cardHeight') as number ?? 54) + 8;
    }
    scroll.setContentHeight(Math.max(content.height - LANE_FOOTER_HEIGHT, y));

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: content.y + content.height - 46, width: content.width, height: 42 },
      t('ascent.codex.close'),
      () => this.closeLane(),
      { variant: 'primary', fontSize: '13px' },
    ));
  }

  /** Leaving mid-run saves first, so Continue on the menu resumes exactly here. */
  private showQuitConfirm(): void {
    this.beginOverlay('quit');

    const content = this.promptFrame(t('ascent.menu.confirmQuit'), t('ascent.menu.confirmQuitBody'));

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: content.y, width: content.width, height: 46 },
      t('ascent.menu.quitConfirm'),
      () => this.events.emit('ui:exit-to-menu', true),
      { variant: 'primary', fontSize: '14px' },
    ));
    this.modalLayer.add(this.ui.button(
      { x: content.x, y: content.y + 58, width: content.width, height: 44 },
      t('ascent.menu.quitCancel'),
      () => this.closeOverlay(),
      { variant: 'ghost', fontSize: '13px' },
    ));
  }

  /**
   * Claims the modal layer for a chrome overlay.
   *
   * Every screen that opens on top of the map goes through here so none of them can forget a
   * piece of the teardown: scroll areas register a global wheel handler, and the battle clock
   * keeps beating on a screen that is no longer there — both leaked when each screen cleared
   * the modal layer its own way.
   */
  /**
   * The map underneath a full-bleed overlay, hidden while it cannot be seen.
   *
   * Measured on the fight screen at 390x844: the map cost **17 ms of a 67 ms frame** drawing a
   * world that was completely covered by a sheet of parchment. `setVisible(false)` skips the render
   * pass and nothing else — the scene keeps updating, so the world clock, the beats and every
   * system go on exactly as before.
   *
   * Only for screens that really do cover it. A prompt card with the map showing round its edges
   * would simply lose its background.
   */
  private setMapVisible(visible: boolean): void {
    const parent = this.scene.manager.getScene('ConquestScene') ?? this.scene.manager.getScene('MapScene');
    if (parent && parent !== (this as Phaser.Scene) && parent.scene.isActive()) {
      parent.scene.setVisible(visible);
    }
  }

  private beginOverlay(key: string): void {
    this.releaseOverlay();
    this.openPromptKey = key;
    // The battle screen is a full sheet of parchment with nothing showing through it.
    if (key === 'lane:battle') this.setMapVisible(false);
    // Immediately, not on the next tick: an overlay opened while the world is held would
    // otherwise leave the bar and the zoom stack floating over it until something else moved.
    this.renderActionBar();
    this.renderInspect();
  }

  private releaseOverlay(): void {
    this.setMapVisible(true);
    this.stopBattleClock();
    this.battleUi = undefined;
    for (const scroll of this.activeScrollAreas) scroll.destroy();
    this.activeScrollAreas = [];
    this.modalLayer.removeAll(true);
  }

  /** Closes a chrome overlay (Codex / menu / quit) without touching the prompt queue. */
  private closeOverlay(): void {
    this.releaseOverlay();
    this.openPromptKey = '';
    this.refresh();
  }

  // ── Province inspect ──────────────────────────────────────────────────────

  /**
   * Detail for a tapped province, plus the one action it affords.
   *
   * "Select land, then choose how to take it" is the literal shape of the Conquer lane, so a
   * province the realm does not hold gets a button straight into its method sheet — the same
   * prompt the scheduler raises on its own clock, reached the direct way.
   */
  /**
   * Top edge of the province inspect card, or `undefined` when none is shown. Sits clear of
   * the action bar; a province the realm does not hold is taller because it carries the
   * "ways in" button. Shared with the map controls so the two never overlap.
   */
  private inspectCardTop(): number | undefined {
    const land = this.state.lands.find((candidate) => candidate.id === this.state.selectedLandId);
    if (!land || this.state.pendingAscentPrompt) return undefined;
    const mine = land.ownerId === PLAYER_KINGDOM_ID;
    return GAME_HEIGHT - ACTION_BAR_HEIGHT - (mine ? 90 : 134);
  }

  private renderInspect(): void {
    for (const object of this.inspectObjects) object.destroy();
    this.inspectObjects = [];

    const land = this.state.lands.find((candidate) => candidate.id === this.state.selectedLandId);
    if (!land || this.state.pendingAscentPrompt) return;

    const mine = land.ownerId === PLAYER_KINGDOM_ID;
    const cardY = this.inspectCardTop() ?? 0;

    const card = this.ui.card(
      { x: 14, y: cardY, width: GAME_WIDTH - 28, height: 78 },
      {
        title: land.name,
        subtitle: `${t('ascent.march.garrison', { value: Math.round(land.defense * 16 + land.localSoldiers * 2.5) })}`,
        rows: [
          { label: t('resource.gold'), value: String(Math.round(land.outputs.gold)) },
          { label: t('resource.food'), value: String(Math.round(land.outputs.food)) },
        ],
        border: mine ? INK_UI.jade : INK_UI.softBrush,
      },
    );
    card.setDepth(120);
    this.inspectObjects.push(card);

    if (mine) return;

    const claim = this.ui.button(
      { x: 14, y: cardY + 86, width: GAME_WIDTH - 28, height: 38 },
      t('ascent.conquer.claimThis', { land: land.name }),
      () => this.events.emit('ui:ascent-conquer', land.id),
      { variant: 'primary', fontSize: '13px' },
    );
    claim.setDepth(120);
    this.inspectObjects.push(claim);
  }
}
