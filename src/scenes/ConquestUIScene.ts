import Phaser from 'phaser';
import { applyPaperFX } from '../ui/ink/PaperFX';
import { applyRenderScale } from '../game/graphicsQuality';
import { ACTION_BAR_HEIGHT, GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT, PLAYER_KINGDOM_ID } from '../game/constants';
import { codexProgress, getCodex, isHeroUnlocked } from '../state/codex';
import { LEGACY_PERKS, ownsPerk } from '../state/legacy';
import { heroTemplates } from '../data/heroes';
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
import { currentTaxRate, setTaxRate, taxGoldMult, taxGrowthDelta, taxStabilityBase } from '../systems/TaxSystem';
import { lawCardView, seatedEffectSummary } from '../systems/ascent/CourtLaneSystem';
import { envoyOptionDetail } from '../systems/ascent/EnvoySystem';
import { realmStanding } from '../systems/ascent/RivalDirector';
import { ourHosts, theirHosts } from '../systems/ascent/BattleSystem';
import { BATTLE_ROUT_MORALE, BATTLE_TICK_MS, TRIBUTE_REFUSE_TICKS } from '../game/ascentConfig';
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
import { countOpenDoors, isMarked, openingFor, openingView, storyNeedsPlayer, storyOpening, storyParams, storyRegard, storySpokenHistory, takeOpening } from '../systems/story/StorySystem';
import { storyText, storyTitle } from '../i18n/story';
import { INK_UI, INK_UI_HEX, InkUI, scrollGestureConsumedTap, type InkScrollArea, type UIBounds } from '../ui/InkUI';
import { createMapItemRenderer, type MapItemRenderer } from '../ui/MapItemRenderer';
import { CARD_ICON_SIZE, drawCardIcon, iconForOption, type CardIconId } from '../ui/CardIcons';
import { ASCENT_HUD_HEIGHT, AscentHud } from '../ui/ascent/AscentHud';
import { ActionBar } from '../ui/ActionBar';
import { ResourceBar } from '../ui/ResourceBar';
import { staggerIn } from '../ui/animations';
import { TITLE_FONT, UI_FONT } from '../ui/fonts';
import {
  buildingLabel,
  formatResourceList,
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
  ConquestMethodOption,
  ConquestTarget,
  CourtPositionId,
  GameState,
  Hero,
  InvasionRecord,
  Land,
  StoryOpening,
} from '../state/types';
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

/** The battle screen's two fixed bands, above the standing orders. */
const BATTLE_FIELD_HEIGHT = 168;
const BATTLE_READOUT_HEIGHT = 62;

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
/** Width of the portrait column beside a hero row. */
const LANE_PORTRAIT_COLUMN = 62;

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
  private lanePauseBeforeOpen = false;
  /** The "world is stopped" badge, rebuilt with the bar. */
  private pausedBadge?: Phaser.GameObjects.Container;
  /**
   * The engagement the screen last opened itself for. A battle opens the lane exactly once —
   * closing it is a decision, and the fight carries on underneath — so this is keyed on the
   * battle's identity rather than on "is one live".
   */
  private lastAutoOpenedBattleKey = '';
  /** True from the screen opening itself until the first order: the world is held meanwhile. */
  private battleAwaitingOrder = false;
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

    // The battle clock and the published control bounds both outlive a single render; neither
    // may survive the scene that owns them.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopBattleClock();
      window.__hudTapBounds = [];
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

    if (!overlayOpen && key !== this.openPromptKey) {
      this.beginOverlay(key);
      if (prompt) this.renderPrompt(prompt);
    }

    // A fight that has just begun brings its own screen up. After the prompt key is reconciled,
    // so a card that arrived on the same tick is answered first and the battle follows it.
    if (this.maybeAutoOpenBattle()) return;

    // After the prompt key is reconciled, never before: both of these decide whether to show
    // themselves from it, and reading last tick's value left the bar hidden for a whole frame
    // after the final card of a chain was answered.
    this.renderActionBar();
    this.renderInspect();
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

  /** The first order lets the fight run: the opening hold ends and the world resumes. */
  private releaseBattleHold(): void {
    if (!this.battleAwaitingOrder) return;
    this.battleAwaitingOrder = false;
    this.state.isStrategyPause = this.lanePauseBeforeOpen;
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
      case 'parliament': return prompt.cardId;
      case 'envoy': return `${prompt.kingdomId}:${prompt.relations}`;
      case 'famine': return `famine:${prompt.shortfall}`;
      case 'rival-demand': return `${prompt.demand}:${prompt.kingdomId}`;
      case 'empire-response': return `${prompt.wave}`;
      case 'wave-result': return `${prompt.wave}`;
      case 'story-beat': return `${prompt.storyId}:${prompt.fragmentId}`;
      case 'founder': return prompt.options.join(',');
      case 'run-over': return `${prompt.score}`;
    }
  }

  private renderPrompt(prompt: AscentPrompt): void {
    switch (prompt.kind) {
      case 'founder': this.showFounder(prompt); break;
      case 'power-draft': this.showPowerDraft(prompt); break;
      case 'conquer-target': this.showConquerTarget(prompt); break;
      case 'conquer-method': this.showConquerMethod(prompt.target, prompt.notice); break;
      case 'hero-choice': this.showHeroChoice(prompt); break;
      case 'court-appointment': this.showAppointment(prompt); break;
      case 'law-choice': this.showLawChoice(prompt); break;
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
    field: Phaser.GameObjects.Container;
    readout: Phaser.GameObjects.Container;
    /** Scroll holding the standing orders: seven rows do not fit a 390×844 screen. */
    orderScroll: InkScrollArea;
    orders: Phaser.GameObjects.Container;
    rivalColor: number;
    /** Identity of the hosts drawn on the field, so relief and routs trigger a redraw. */
    fieldSignature: string;
    /** Identity of what the order cards offer, so a spent one-shot greys out. */
    orderSignature: string;
    /** Marker plus the host it stands for, so its strength can be re-stamped as men fall. */
    ourMarkers: BattleMarker[];
    theirMarkers: BattleMarker[];
    geometry: { leftX: number; rightX: number; span: number; groundY: number };
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
    // own height is settled.
    const noteHeight = opts.note ? 20 : 0;
    const contentBottom = bodyText.y + bodyText.height + 10 + noteHeight;
    const height = Math.max(bounds.height, contentBottom);

    if (opts.note) {
      container.add(this.add.text(textX, height - 20, opts.note, {
        color: opts.noteColor ?? '#4c6b46',
        fontFamily: UI_FONT,
        fontSize: '11px',
        fontStyle: '700',
        wordWrap: { width: bounds.width - 32 },
      }).setAlpha(alpha));
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
    this.renderMapControls(hidden);
    this.renderPausedBadge(hidden);
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
    addWidget: (height: number, build: (parent: Phaser.GameObjects.Container, width: number) => void) => void;
    finish: () => void;
  } {
    const content = this.promptFrame(title, subtitle);
    const footerExtra = laneOpts.back ? LANE_BACK_BUTTON_HEIGHT + 8 : 0;
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

    /** A custom widget (a slider, a chart) slotted into the list's flow at the cursor. */
    const addWidget = (height: number, build: (parent: Phaser.GameObjects.Container, width: number) => void) => {
      const holder = this.add.container(0, y);
      build(holder, rowWidth);
      scroll.content.add(holder);
      y += height + 8;
    };

    const finish = () => {
      scroll.setContentHeight(Math.max(content.height - LANE_FOOTER_HEIGHT - footerExtra, y));
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

    return { content, addRow, addHeading, addWidget, finish };
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
    this.closeOverlay();
  }

  // ── Bar screens ───────────────────────────────────────────────────────────
  //
  // The same five screens the classic modes reach from their action bar, rebuilt on this
  // scene's card components against the same systems. The autopilot still runs everything
  // between decisions; these exist so the player can *overrule* it at any moment rather than
  // waiting for a card to offer the choice.

  /** Build / upgrade a district by hand, ahead of whatever the autopilot would have picked. */
  private showBuildScreen(): void {
    const state = this.state;
    const lands = state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID);
    const { addRow, addHeading, finish } = this.laneList(
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
    for (const land of lands) {
      const order = state.buildOrders.find((candidate) => candidate.landId === land.id);
      addRow(
        {
          title: land.name,
          subtitle: order
            ? t('ascent.screen.building', { n: Math.max(0, order.required - order.progress) })
            : t('ascent.screen.slots', {
                used: land.buildings.length,
                cap: land.buildingCapacity,
                defense: land.defense,
              }),
          border: order ? INK_UI.gold : INK_UI.jade,
        },
        () => this.showBuildOptions(land.id),
      );
    }
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
    const { addRow, finish } = this.laneList(
      t('action.heroes'),
      `${t('ascent.screen.heroesBody', { n: state.heroes.length })}
${t('ascent.screen.payroll', { gold: heroPayroll(state) })}`,
    );

    // Unposted first: the most common reason to open this screen.
    const ordered = [...state.heroes].sort(
      (a, b) => Number(Boolean(a.assignedTo)) - Number(Boolean(b.assignedTo)),
    );
    for (const hero of ordered) {
      addRow(
        {
          title: `${heroName(hero)}  ·  ${rarityLabel(hero.rarity)}`,
          subtitle: `${this.heroPosting(hero)} — ${this.heroStatLine(hero)}`,
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
    const { addRow, addHeading, addWidget, finish } = this.laneList(
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
    addRow({
      title: t('court.status.stability', {
        stability: Math.round(state.court.stability),
        drift: `${regen >= 0 ? '+' : ''}${(Math.round(regen * 10) / 10).toFixed(1)}`,
      }),
      subtitle: `${t('court.status.seats', { seated, total: unlockedCount })}\n${t('court.status.favor', {
        favor: Math.round(state.court.favor),
        threshold: Math.round(state.court.favorThreshold),
      })}`,
      border: state.court.stability < 35 ? INK_UI.cinnabar : INK_UI.jade,
    });

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
      addRow({ title: view.title, subtitle: view.effect, border: INK_UI.gold, muted: true });
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

    for (const seat of seats) {
      const unlocked = state.court.unlockedSeats.includes(seat);
      const hero = state.heroes.find((candidate) => candidate.id === state.court.seats[seat]);
      addRow(
        {
          title: getCourtPositionLabel(seat),
          subtitle: hero
            ? `${heroName(hero)} — ${seatedEffectSummary(state, seat) ?? ''}`
            : unlocked ? t('ascent.lane.seatEmpty') : t('ascent.lane.seatLocked'),
          border: hero ? INK_UI.jade : unlocked ? INK_UI.gold : INK_UI.softBrush,
          muted: !unlocked,
        },
        // Seated or empty, the row opens the seat's own picker: who could sit here, what each
        // would do for the realm, and what taking them costs. It used to send an empty seat to
        // the generic roster and a seated one to the minister's card — role→hero was never asked.
        unlocked ? () => this.showSeatPicker(seat) : undefined,
      );
    }

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
    const { addRow, addHeading, finish } = this.laneList(
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
    addRow({
      title: t('army.status.strength', { defence, threat }),
      subtitle: t('army.status.hosts', { hosts: mine.length, troops }),
      border: threat > defence ? INK_UI.cinnabar : INK_UI.jade,
    });

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
    addRow({
      title: isBossWave(nextWave)
        ? t('ascent.war.nextWaveBoss', { ticks: waveTicks })
        : t('ascent.war.nextWave', { wave: nextWave, ticks: waveTicks }),
      subtitle: ascent?.coalitionPending ? t('ascent.war.coalition') : '',
      border: isBossWave(nextWave) || ascent?.coalitionPending ? INK_UI.cinnabar : INK_UI.softBrush,
      muted: !isBossWave(nextWave) && !ascent?.coalitionPending,
    });

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
      addRow({
        title: t('ascent.war.unseenCount', { n: unseen }),
        subtitle: '',
        border: INK_UI.softBrush,
        muted: true,
      });
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
      addRow({ title: t('ascent.war.quiet'), subtitle: '', border: INK_UI.softBrush, muted: true });
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
    addRow(
      {
        title: t('ascent.screen.raiseHost'),
        subtitle: commanderId && spare >= MIN_ARMY_SOLDIERS
          ? t('ascent.screen.raiseHostBody', { n: recruitSoldiers(spare) })
          : commanderId
            ? t('ascent.screen.raiseNoPeople')
            : t('ascent.conquer.needHero'),
        border: canRaise ? INK_UI.jade : INK_UI.softBrush,
        muted: !canRaise,
      },
      canRaise ? () => this.showRaiseHostForm() : undefined,
    );

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

    const { addRow, addHeading, finish } = this.laneList(
      army.name,
      t('ascent.army.detailBody', {
        land: land?.name ?? '—',
        general: general ? heroName(general) : t('ascent.screen.noGeneral'),
        morale: Math.round(army.morale),
        supply: Math.round(army.supply),
      }),
    );

    // What the host costs, stated plainly.
    //
    // The screen already knew this — it computed the same figures to price the disband row — but
    // only ever showed them as what you would save by giving up. The runway is the number that
    // actually predicts trouble: a host out of rations bleeds morale, and until now the player
    // only found that out after the morale had gone.
    const upkeep = ascentArmyUpkeep(state);
    const troops = Math.max(1, getPlayerTroops(state));
    const shareGold = Math.round(upkeep.gold * (size / troops));
    const shareFood = Math.round(upkeep.food * (size / troops));
    const rationRunway = Math.floor((army.rations ?? 0) / Math.max(1, size / 100 * ARMY_RATION_USE_PER_100));
    addRow({
      title: t('ascent.army.upkeepHeading'),
      subtitle: `${t('ascent.army.upkeepBody', { gold: shareGold, food: shareFood })}\n${
        (army.rations ?? 0) <= 0
          ? t('ascent.army.runwayOut')
          : t('ascent.army.runway', { ticks: rationRunway })
      }`,
      border: (army.rations ?? 0) <= 0 ? INK_UI.cinnabar : INK_UI.softBrush,
      muted: (army.rations ?? 0) > 0,
    });

    // Why the host is stronger than the men in it.
    //
    // `armyPower` multiplies unit count by morale, supply, level, elite tier, the general's
    // martial skill and every Power Draft card the run has taken — so a host of 800 can be worth
    // far more or far less than a host of 800, and none of that was visible anywhere. Showing the
    // finished figure beside the headcount is what makes drafting a card feel like it reached the
    // field, rather than a number that went up on the HUD.
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
    addRow({
      title: t('ascent.army.powerHeading', { power: Math.round(armyPower(state, army)), men: size }),
      subtitle: multipliers.join('  ·  '),
      border: INK_UI.gold,
      muted: true,
    });

    // ── Standing orders ──
    //
    // What the host is doing until told otherwise, and every way to tell it otherwise. The
    // autopilot used to move and dissolve every host on its own judgement; a host under any
    // order but `auto` is now moved by that order alone (see `StandingOrders`).
    addHeading(t('ascent.orders.heading'));
    const orders = armyOrders(army);
    addRow({
      title: t('ascent.orders.current', { order: hostOrderLabel(state, army) }),
      subtitle: '',
      border: INK_UI.gold,
      muted: true,
    });
    const command = (next: ArmyOrders): void => {
      this.events.emit('ui:ascent-army-orders', { armyId, orders: next });
      this.showArmyDetail(armyId);
    };
    const defendingHere = orders.kind === 'defend' && orders.landId === army.landId;
    addRow(
      {
        title: t('ascent.orders.defendHere'),
        subtitle: t('ascent.orders.defendHereBody', { land: land?.name ?? '—' }),
        border: defendingHere ? INK_UI.gold : INK_UI.jade,
        muted: defendingHere,
      },
      defendingHere ? undefined : () => command({ kind: 'defend', landId: army.landId }),
    );
    const owned = state.lands.filter(
      (candidate) => candidate.ownerId === PLAYER_KINGDOM_ID && candidate.id !== army.landId,
    );
    addRow(
      {
        title: t('ascent.army.marchTo'),
        subtitle: owned.length > 0 ? t('ascent.army.marchToBody') : t('ascent.army.noOwnedLand'),
        border: owned.length > 0 ? INK_UI.jade : INK_UI.softBrush,
        muted: owned.length === 0,
      },
      owned.length > 0 ? () => this.showMarchTargets(armyId) : undefined,
    );
    const attackable = buildAllConquestTargets(state);
    addRow(
      {
        title: t('ascent.orders.attackPick'),
        subtitle: attackable.length > 0 ? t('ascent.orders.attackPickBody') : t('ascent.army.noOwnedLand'),
        border: attackable.length > 0 ? INK_UI.cinnabar : INK_UI.softBrush,
        muted: attackable.length === 0,
      },
      attackable.length > 0 ? () => this.showAttackTargets(armyId) : undefined,
    );
    const others = state.armies.filter(
      (candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID && !candidate.isLevy && candidate.id !== army.id,
    );
    addRow(
      {
        title: t('ascent.orders.followPick'),
        subtitle: t('ascent.orders.followPickBody'),
        border: others.length > 0 ? INK_UI.jade : INK_UI.softBrush,
        muted: others.length === 0,
      },
      others.length > 0 ? () => this.showFollowTargets(armyId) : undefined,
    );

    const quarries = visibleHostileHosts(state);
    addRow(
      {
        title: t('ascent.army.hunt'),
        subtitle: quarries.length > 0
          ? t('ascent.army.huntBody', { n: quarries.length })
          : t('ascent.army.huntNone'),
        border: quarries.length > 0 ? INK_UI.cinnabar : INK_UI.softBrush,
        muted: quarries.length === 0,
      },
      quarries.length > 0 ? () => this.showHuntTargets(armyId) : undefined,
    );
    // Who leads. A host's general was only ever set by an appointment card that offered the
    // *first* leaderless host; the row asks the question the other way round.
    addRow(
      {
        title: general ? t('ascent.orders.commander', { hero: heroName(general) }) : t('ascent.orders.commanderNone'),
        subtitle: t('ascent.orders.commanderBody'),
        border: general ? INK_UI.gold : INK_UI.cinnabar,
        portrait: general,
      },
      () => this.showCommanderPicker(armyId),
    );
    addRow(
      {
        title: t('ascent.orders.autoRow'),
        subtitle: t('ascent.orders.autoBody'),
        border: isAutoHost(army) ? INK_UI.gold : INK_UI.softBrush,
        muted: isAutoHost(army),
      },
      isAutoHost(army) ? undefined : () => command({ kind: 'auto' }),
    );

    // Recall: out of the fight, off the siege, home. Confirmed, because it can abandon both.
    const siege = state.siegeOrders.find((order) => order.armyId === army.id);
    const engaged = Boolean(state.ascent?.activeBattle && !state.ascent.activeBattle.over
      && (state.ascent.activeBattle.ourArmyIds ?? []).includes(army.id));
    addRow(
      {
        title: t('ascent.orders.recall'),
        subtitle: t('ascent.orders.recallBody'),
        border: INK_UI.gold,
      },
      () => {
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
      },
    );

    // Resupply: baggage topped up from the stores, the one thing the autopilot will not do
    // below its own reserve.
    const supply = resupplyPreview(state, armyId);
    addRow(
      {
        title: t('ascent.orders.resupply'),
        subtitle: supply.blocked ?? t('ascent.orders.resupplyBody', {
          r: Math.round(army.rations),
          wantR: supply.wantRations,
          p: Math.round(army.provisions),
          wantP: supply.wantProvisions,
          food: supply.food,
          supplies: supply.supplies,
        }),
        border: supply.blocked ? INK_UI.softBrush : INK_UI.jade,
        muted: Boolean(supply.blocked),
      },
      supply.blocked
        ? undefined
        : () => {
            this.events.emit('ui:ascent-army-resupply', armyId);
            this.showArmyDetail(armyId);
          },
    );

    // ── Upgrades ──
    for (const option of getArmyUpgradeOptions(state, armyId)) {
      const label = t(`ascent.army.${option.kind}` as Parameters<typeof t>[0]);
      const body = option.kind === 'equip'
        ? t('ascent.army.equipBody', { tier: option.gain })
        : option.kind === 'reinforce'
          ? t('ascent.army.reinforceBody', { n: option.gain })
          : t('ascent.army.drillBody', { level: option.gain });
      addRow(
        {
          title: label,
          subtitle: option.available
            ? `${body}\n${formatResourceList(option.cost)}`
            : option.reason ?? '',
          border: option.available ? INK_UI.gold : INK_UI.softBrush,
          muted: !option.available,
        },
        option.available
          ? () => {
              upgradeArmy(state, armyId, option.kind);
              this.showArmyDetail(armyId);
            }
          : undefined,
      );
    }

    addRow(
      {
        title: t('ascent.army.disband'),
        subtitle: t('ascent.army.disbandBody', { n: size, gold: shareGold, food: shareFood }),
        border: INK_UI.cinnabar,
      },
      () => {
        this.closeLane();
        this.events.emit('ui:ascent-disband-army', armyId);
      },
    );

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
    const { addRow, finish } = this.laneList(t('action.affairs'), t('ascent.lane.worldBody'));

    for (const kingdom of rivals) {
      const relations = Math.round(kingdom.relations ?? 50);
      const tags = [
        t('ascent.world.power', { value: Math.round(getEmpirePower(state, kingdom)) }),
        t('ascent.world.appetite', { value: Math.round(kingdom.warAppetite ?? 0) }),
        hasPact(kingdom) ? t('ascent.world.pact') : undefined,
        kingdom.ambassadorHeroId ? t('ascent.world.ambassador') : undefined,
      ].filter(Boolean).join('  ·  ');

      addRow(
        {
          title: `${kingdom.name}  ·  ${relations}`,
          subtitle: tags,
          // Green when content, red once cold enough to march.
          border: relations >= 55 ? INK_UI.jade : relations >= 35 ? INK_UI.gold : INK_UI.cinnabar,
        },
        () => {
          this.closeLane();
          this.events.emit('ui:ascent-envoy', kingdom.id);
        },
      );
    }
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
    const { content, body, bodyWidth, finish } = this.promptScrollBody(
      prompt.source === 'court' ? t('ascent.summon.courtTitle') : t('ascent.summon.title'),
      payrollShare > 55 ? `${subtitle}
${t('ascent.summon.payrollWarn', { pct: payrollShare })}` : subtitle,
      PROMPT_FOOTER_HEIGHT,
    );

    const cardHeight = 132;
    const cards: Phaser.GameObjects.Container[] = [];
    let used = 0;

    prompt.heroIds.forEach((heroId) => {
      const hero = this.state.heroDeck.find((candidate) => candidate.id === heroId);
      if (!hero) return;
      const tier = tierForHero(hero);
      // First-time pulls are the collection payoff — say so on the card.
      const isNew = !isHeroUnlocked(hero.id);

      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: cardHeight },
        {
          title: heroName(hero),
          body: `${heroTypeLabel(hero.type)}  ·  ${rarityLabel(hero.rarity)}`,
          note: isNew ? t('ascent.summon.newCodex') : this.heroStatLine(hero),
          noteColor: isNew ? '#8a5f1c' : undefined,
          badge: t(`ascent.rarity.${tier}` as Parameters<typeof t>[0]),
          accent: RARITY_COLOR[tier],
          washAlpha: RARITY_WASH[tier],
          reserveRight: PORTRAIT_W + 14,
          parent: body,
          onTap: () => this.choose(heroId),
        },
      );
      // The card may have grown past `cardHeight` to fit a long name; the glow and the portrait
      // are sized to what it actually became, or they sit short of its lower edge.
      const drawnHeight = (card.getData('cardHeight') as number) ?? cardHeight;

      // Gold and Jade pulls glow — the one moment the mode leans into the gacha reveal.
      if (tier === 'gold' || tier === 'jade') {
        const glow = this.add.graphics();
        glow.lineStyle(3, RARITY_COLOR[tier], 0.8);
        glow.strokeRoundedRect(-2, -2, bodyWidth + 4, drawnHeight + 4, 10);
        card.add(glow);
        this.tweens.add({
          targets: glow,
          alpha: { from: 0.25, to: 1 },
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      // Procedural portrait, deterministic from the hero id — no art assets involved.
      // Sized to the card's right-hand column, below the badge row. The portrait's art is
      // taller than its frame (the shoulders hang past it), so it must be fitted to a box
      // rather than dropped at a centre point, or it spills out of the card.
      const face = renderHeroFaceInBox(this, hero, {
        x: bodyWidth - PORTRAIT_W - 12,
        y: PORTRAIT_TOP,
        width: PORTRAIT_W,
        height: drawnHeight - PORTRAIT_TOP - 8,
      });
      card.add(face);
      cards.push(card);
      used += drawnHeight + 10;
    });
    staggerIn(this, cards);
    finish(used);

    this.modalLayer.add(this.ui.button(
      { x: content.x, y: GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8, width: content.width, height: 38 },
      t('ascent.summon.pass'),
      () => this.choose('pass'),
      { variant: 'ghost', fontSize: '12px' },
    ));
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
  private showChronicleScreen(): void {
    const state = this.state;
    // A latent story does not exist yet as far as the player is concerned — unless it is
    // holding an open door. An opening is deliberately not "spoken" (an offer is not a line),
    // so filtering on spoken alone hid exactly the stories whose *first* move is the offer:
    // the button glowed red over a list that did not contain the reason.
    const running = (state.stories ?? []).filter((story) => story.spoken.length > 0 || storyNeedsPlayer(story));
    const recorded = [...(state.chronicle ?? [])].reverse();

    const need = running.filter((story) => storyNeedsPlayer(story));
    const waiting = running
      .filter((story) => !storyNeedsPlayer(story))
      .sort((a, b) => b.lastSpokeTurn - a.lastSpokeTurn);

    const { addRow, addHeading, finish } = this.laneList(
      t('ascent.chronicle.title'),
      need.length > 0
        ? t('ascent.chronicle.needCount', { n: need.length })
        : t('ascent.chronicle.body', { year: state.year }),
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
      const status = needsYou
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
      addHeading(t('ascent.chronicle.recorded'));
      for (const entry of recorded) {
        addRow({
          title: storyTitle(entry.templateId),
          subtitle: storyText(`${entry.templateId}.${entry.fragmentId}.chronicle`, entry.params),
          border: entry.tone === 'threat'
            ? INK_UI.cinnabar
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

    heading(t('ascent.story.happened'));
    const beats = storySpokenHistory(state, story);
    beats.forEach((beat, index) => {
      const line = storyText(`${story.templateId}.${beat.fragmentId}.chronicle`, params);
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
    } else {
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
    const { addRow, addHeading, finish } = this.laneList(
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

    const section = (key: 'food' | 'supplies' | 'gold', line: AscentLedgerLine) => {
      addHeading(resourceLabel(key));
      // Signs are formatted here, not in the template: gross can itself go negative (three
      // withholding provinces can outweigh the paying ones), and a hardcoded '+' printed
      // the nonsense "In +-8".
      const gross = Math.round(line.gross);
      const demand = Math.round(line.demand);
      addRow({
        title: t('ascent.ledger.line', {
          gross: gross >= 0 ? `+${gross}` : `${gross}`,
          demand: `−${Math.abs(demand)}`,
        }),
        subtitle: t('ascent.ledger.net', { net: Math.round(line.net) }),
        border: line.net >= 0 ? INK_UI.jade : INK_UI.cinnabar,
      });
    };
    section('food', ledger.food);
    section('supplies', ledger.supplies);
    section('gold', ledger.gold);

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
      for (const row of rows) {
        if (row.n <= 0) continue;
        addRow(
          { title: row.title, subtitle: row.subtitle, border: row.n === biggest ? INK_UI.cinnabar : INK_UI.softBrush },
          row.lane ? () => { const lane = row.lane!; this.closeLane(); this.openLane(lane); } : undefined,
        );
      }
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
    const rival = this.state.kingdoms.find((k) => k.id === battle.kingdomId);
    const rivalColor = rival?.color ?? INK_UI.cinnabar;

    const content = this.promptFrame(
      battle.isGreat
        ? t('ascent.battle.greatTitle', { land: battle.landName })
        : t('ascent.battle.title', { land: battle.landName }),
      t('ascent.battle.subtitle', { kingdom: battle.kingdomName }),
    );

    const fieldY = content.y;
    const groundY = fieldY + 112;
    const leftX = content.x + 44;
    const rightX = content.x + content.width - 44;
    // Full span, not half: the two meet when `ourAdvance + theirAdvance` reaches 1, so the
    // drawing has to use the same scale or the picture and the fight would disagree about where
    // everyone is standing.
    const span = rightX - leftX - 60;

    const field = this.add.container(0, 0);
    const readout = this.add.container(0, 0);
    this.modalLayer.add([field, readout]);

    // The orders scroll: with relief, a reserve and a rally all in play there are seven of
    // them, which is 426px of rows below a 240px field and readout. They ran off the bottom of
    // the screen — and the last row off it was Retreat, the one way out of a losing fight.
    const ordersTop = content.y + BATTLE_FIELD_HEIGHT + 8 + BATTLE_READOUT_HEIGHT + 10;
    const orderScroll = this.ui.scrollArea({
      x: content.x,
      y: ordersTop,
      width: content.width,
      height: Math.max(120, GAME_HEIGHT - 76 - ordersTop),
    });
    orderScroll.addTo(this.modalLayer);
    this.activeScrollAreas.push(orderScroll);

    this.battleUi = {
      content,
      field,
      readout,
      orderScroll,
      orders: orderScroll.content,
      rivalColor,
      fieldSignature: '',
      orderSignature: '',
      ourMarkers: [],
      theirMarkers: [],
      geometry: { leftX, rightX, span, groundY },
    };

    this.buildBattleField(battle);
    this.buildBattleReadout(battle);
    this.buildBattleOrders(battle);
    // The screen had no way out at all: the only exits were Retreat and "leave it to my
    // generals", both of which end the fight. Watching a siege you are winning meant being
    // held there until it resolved.
    this.laneCloseButton(content);

    this.startBattleClock();
  }

  /** Pairs a drawn marker with its host, finding the strength label to keep current. */
  private trackMarker(hostId: string, marker: Phaser.GameObjects.Container): BattleMarker {
    const count = marker.list.find((child) => child.type === 'Text') as Phaser.GameObjects.Text | undefined;
    return { hostId, marker, count };
  }

  /** Who is standing on the field, so relief arriving or a column breaking forces a redraw. */
  private battleFieldSignature(battle: AscentBattle): string {
    const ours = ourHosts(this.state, battle).map((host) => host.id);
    const theirs = theirHosts(this.state, battle).map((host) => host.id);
    return `${ours.join(',')}|${theirs.join(',')}|${battle.focusHostId ?? ''}`;
  }

  /** What the order cards currently offer, so a spent one-shot or a new posture redraws them. */
  private battleOrderSignature(battle: AscentBattle): string {
    const reserveMen = battle.reserve.spearmen + battle.reserve.archers + battle.reserve.heavyInfantry;
    return [
      battle.posture,
      battle.focusHostId ?? '',
      battle.reserveSpent ? 'r1' : 'r0',
      battle.rallySpent ? 'y1' : 'y0',
      reserveMen > 0 ? 'has' : 'none',
      battle.rallyPower > 0 ? 'rally' : 'norally',
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

    field.removeAll(true);
    ui.ourMarkers = [];
    ui.theirMarkers = [];
    ui.fieldSignature = this.battleFieldSignature(battle);

    field.add(this.ui.panel(
      { x: content.x, y: content.y, width: content.width, height: BATTLE_FIELD_HEIGHT },
      { border: INK_UI.softBrush },
    ));

    // Camps: the ground each side is fighting from, and what "hold" means.
    field.add(this.battleCamp(leftX, groundY + 16, INK_UI.jade));
    field.add(this.battleCamp(rightX, groundY + 16, rivalColor));

    const ours = ourHosts(this.state, battle);
    const theirs = theirHosts(this.state, battle);
    const lane = (index: number, count: number): number => groundY + (index - (count - 1) / 2) * 32;

    ours.forEach((host, index) => {
      const marker = this.battleItems!.createArmyMarker(hostSize(host), true, undefined, this.state.mapConfig.seed);
      marker.setPosition(leftX + 30 + span * battle.ourAdvance, lane(index, ours.length));
      field.add(marker);
      ui.ourMarkers.push(this.trackMarker(host.id, marker));
    });

    theirs.forEach((host, index) => {
      const marker = this.battleItems!.createArmyMarker(
        hostSize(host), false, rivalColor, Math.max(0, this.state.kingdoms.findIndex((k) => k.id === battle.kingdomId)),
      );
      marker.setPosition(rightX - 30 - span * battle.theirAdvance, lane(index, theirs.length));
      field.add(marker);
      ui.theirMarkers.push(this.trackMarker(host.id, marker));

      // Tapping an enemy column concentrates the line on it; a ring marks the current target, so
      // the order lives on the field rather than only in a list.
      if (battle.focusHostId === host.id) {
        const ring = this.add.circle(0, -18, 26).setStrokeStyle(2.5, INK_UI.cinnabar, 0.95);
        // Parented to the marker so it travels with the column it is marking, rather than
        // staying behind at the spot the column stood in when the screen opened.
        marker.add(ring);
      }
      const hit = this.add.circle(0, -18, 28, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        this.releaseBattleHold();
        this.events.emit('ui:battle-focus', battle.focusHostId === host.id ? undefined : host.id);
      });
      marker.add(hit);
    });
  }

  /**
   * Strength, morale and the clash mark — everything that changes every beat.
   *
   * Cheap to rebuild and, crucially, carrying nothing tappable: the field's focus targets ride
   * on the markers and the orders live in their own layer, so this can be thrown away and
   * redrawn on the battle's clock without ever destroying a control mid-press.
   */
  private buildBattleReadout(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui) return;
    const { content, readout, rivalColor } = ui;
    const { leftX, rightX, span, groundY } = ui.geometry;

    readout.removeAll(true);

    // Clash mark, only once they have actually met.
    if (battle.ourAdvance + battle.theirAdvance >= 1) {
      // Midway between the two lines, computed from the advances rather than from marker
      // objects — with several hosts a side there is no single 'the line' to read a
      // position off any more.
      const ourLine = leftX + 30 + span * battle.ourAdvance;
      const theirLine = rightX - 30 - span * battle.theirAdvance;
      const clash = this.ui.label(ourLine + (theirLine - ourLine) / 2, groundY - 44, t('ascent.battle.clash'), 'label', {
        fontSize: '22px', align: 'center',
      }).setOrigin(0.5);
      readout.add(clash);
      this.tweens.add({
        targets: clash, scale: { from: 0.7, to: 1.15 }, alpha: { from: 1, to: 0.35 },
        duration: 380, yoyo: true, repeat: -1,
      });
    }

    const readoutY = content.y + BATTLE_FIELD_HEIGHT + 8;
    readout.add(this.ui.panel(
      { x: content.x, y: readoutY, width: content.width, height: BATTLE_READOUT_HEIGHT },
      { border: INK_UI.softBrush },
    ));

    const barW = (content.width - 36) / 2;
    const bar = (x: number, now: number, start: number, color: number, label: string): void => {
      readout.add(this.ui.label(x, readoutY + 8, label, 'caption', {}));
      readout.add(this.ui.label(x + barW, readoutY + 8, `${now}`, 'label', { fontSize: '15px', align: 'right' })
        .setOrigin(1, 0));
      readout.add(this.ui.statBar(
        { x, y: readoutY + 32, width: barW, height: 8 }, now, Math.max(1, start), color,
      ));
    };
    bar(content.x + 12, battle.ourNow, battle.ourStart, INK_UI.jade, t('ascent.battle.ours'));
    bar(content.x + barW + 24, battle.theirNow, battle.theirStart, rivalColor, battle.kingdomName);

    // Morale under strength: this is the bar that actually decides the fight, since `armyPower`
    // multiplies by it and a host below the rout threshold breaks outright.
    const heart = (x: number, value: number): void => {
      readout.add(this.ui.statBar(
        { x, y: readoutY + 44, width: barW, height: 5 }, value, 100,
        value <= BATTLE_ROUT_MORALE + 10 ? INK_UI.cinnabar : INK_UI.gold,
      ));
    };
    heart(content.x + 12, battle.ourMorale);
    heart(content.x + barW + 24, battle.theirMorale);

    // The opening hold, said out loud: the world is stopped for the first order, and the caption
    // goes with the first tap. Lives in the readout because that layer is redrawn every beat.
    if (this.battleAwaitingOrder) {
      readout.add(this.ui.label(content.x + content.width / 2, content.y + 12, t('ascent.battle.holdNote'), 'caption', {
        align: 'center',
        wordWrap: { width: content.width - 40 },
        color: `#${INK_UI.cinnabar.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5, 0));
    }
  }

  /** The standing orders. Rebuilt only when what they offer changes, never on the beat. */
  private buildBattleOrders(battle: AscentBattle): void {
    const ui = this.battleUi;
    if (!ui) return;
    const { content, orders } = ui;

    orders.removeAll(true);
    ui.orderSignature = this.battleOrderSignature(battle);

    // Laid out inside the scroll's own space, so every row starts from its top edge.
    const rowWidth = content.width - 6;
    const rowH = 54;
    let optY = 0;
    const control = (id: string, accent: number, badge?: string): void => {
      this.optionCard(
        { x: 0, y: optY, width: rowWidth, height: rowH },
        {
          icon: iconForOption(id),
          title: t(`ascent.battle.${id}` as Parameters<typeof t>[0]),
          body: t(`ascent.battle.${id}D` as Parameters<typeof t>[0]),
          badge,
          accent,
          parent: orders,
          onTap: () => { this.releaseBattleHold(); this.events.emit('ui:battle-order', id); },
        },
      );
      optY += rowH + 8;
    };

    // Focus is discoverable from a row as well as from the field: a tap target with no label is
    // a secret, and the two together teach each other.
    const focused = theirHosts(this.state, battle)
      .find((host) => host.id === battle.focusHostId);
    this.optionCard(
      { x: 0, y: optY, width: rowWidth, height: rowH },
      {
        icon: focused ? 'blade' : 'banner',
        title: focused ? t('ascent.battle.focusOn', { name: focused.name }) : t('ascent.battle.spread'),
        body: focused ? t('ascent.battle.focusD') : t('ascent.battle.spreadD'),
        accent: focused ? INK_UI.cinnabar : INK_UI.softBrush,
        parent: orders,
        onTap: () => { this.releaseBattleHold(); this.events.emit('ui:battle-focus', undefined); },
      },
    );
    optY += rowH + 8;

    const pressing = battle.posture === 'press';
    control('press', pressing ? INK_UI.gold : INK_UI.softBrush, pressing ? t('ascent.battle.current') : undefined);
    control('hold', !pressing ? INK_UI.gold : INK_UI.softBrush, !pressing ? t('ascent.battle.current') : undefined);

    // The two one-shots. Shown spent rather than hidden, so the player can see what they still
    // hold — waiting for the right moment only works if you know you still have the card.
    const reserveMen = battle.reserve.spearmen + battle.reserve.archers + battle.reserve.heavyInfantry;
    if (reserveMen > 0) {
      this.optionCard(
        { x: 0, y: optY, width: rowWidth, height: rowH },
        {
          icon: 'banner',
          title: t('ascent.battle.reserve'),
          body: t('ascent.battle.reserveD', { n: reserveMen }),
          badge: battle.reserveSpent ? t('ascent.battle.spent') : undefined,
          accent: battle.reserveSpent ? INK_UI.softBrush : INK_UI.jade,
          disabled: battle.reserveSpent,
          parent: orders,
          onTap: () => { if (!battle.reserveSpent) { this.releaseBattleHold(); this.events.emit('ui:battle-order', 'reserve'); } },
        },
      );
      optY += rowH + 8;
    }
    if (battle.rallyPower > 0) {
      this.optionCard(
        { x: 0, y: optY, width: rowWidth, height: rowH },
        {
          icon: 'crown',
          title: t('ascent.battle.rally'),
          body: t('ascent.battle.rallyD'),
          badge: battle.rallySpent ? t('ascent.battle.spent') : undefined,
          accent: battle.rallySpent ? INK_UI.softBrush : INK_UI.gold,
          disabled: battle.rallySpent,
          parent: orders,
          onTap: () => { if (!battle.rallySpent) { this.releaseBattleHold(); this.events.emit('ui:battle-order', 'rally'); } },
        },
      );
      optY += rowH + 8;
    }

    control('retreat', INK_UI.cinnabar);
    control('auto', INK_UI.softBrush);

    ui.orderScroll.setContentHeight(optY);
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
    if (!battle) { this.closeLane(); return; }

    if (this.battleFieldSignature(battle) !== ui.fieldSignature) {
      this.buildBattleField(battle);
    } else {
      const { leftX, rightX, span } = ui.geometry;
      // The shove is what contact looks like: once the lines meet they press into each other
      // instead of gliding, so the picture reads as a fight rather than a chart.
      const meeting = battle.ourAdvance + battle.theirAdvance >= 1;
      const sizes = new Map(
        [...ourHosts(this.state, battle), ...theirHosts(this.state, battle)]
          .map((host) => [host.id, hostSize(host)] as const),
      );
      this.slideMarkers(ui.ourMarkers, leftX + 30 + span * battle.ourAdvance, meeting ? 4 : 0, sizes);
      this.slideMarkers(ui.theirMarkers, rightX - 30 - span * battle.theirAdvance, meeting ? -4 : 0, sizes);
    }

    this.buildBattleReadout(battle);

    if (this.battleOrderSignature(battle) !== ui.orderSignature) {
      this.buildBattleOrders(battle);
    }
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
    for (const { hostId, marker, count } of markers) {
      if (!marker.active) continue;
      const size = sizes.get(hostId);
      if (count?.active && size !== undefined) count.setText(compactNumber(size));
      // Previous beat's tween is abandoned rather than left to fight this one for the same x.
      this.tweens.killTweensOf(marker);
      if (shove === 0) {
        this.tweens.add({ targets: marker, x, duration: BATTLE_TICK_MS * 0.45, ease: 'Sine.easeOut' });
        continue;
      }
      this.tweens.chain({
        targets: marker,
        tweens: [
          { x: x + shove, duration: BATTLE_TICK_MS * 0.28, ease: 'Sine.easeOut' },
          { x, duration: BATTLE_TICK_MS * 0.32, ease: 'Sine.easeIn' },
        ],
      });
    }
  }

  /** A side's camp: a few tents on its own ground, so "hold the line" has somewhere to mean. */
  private battleCamp(x: number, y: number, color: number): Phaser.GameObjects.Container {
    const camp = this.add.container(x, y);
    const g = this.add.graphics();
    for (let i = -1; i <= 1; i += 1) {
      const tx = i * 15;
      const ty = Math.abs(i) * -3;
      g.fillStyle(INK_UI.parchmentShade, 0.95);
      g.fillTriangle(tx - 10, ty + 8, tx, ty - 9, tx + 10, ty + 8);
      g.lineStyle(1.5, INK_UI.brush, 0.8);
      g.strokeTriangle(tx - 10, ty + 8, tx, ty - 9, tx + 10, ty + 8);
    }
    // A standard over the camp, in the side's own colours.
    g.lineStyle(2, INK_UI.brush, 0.9);
    g.lineBetween(0, -12, 0, -30);
    g.fillStyle(color, 0.95);
    g.fillTriangle(0, -30, 14, -26, 0, -21);
    camp.add(g);
    return camp;
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
      delay: BATTLE_TICK_MS,
      loop: true,
      callback: () => this.refresh(),
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

  private showFounder(prompt: Extract<AscentPrompt, { kind: 'founder' }>): void {
    const codex = codexProgress();
    const { body, bodyWidth, finish } = this.promptScrollBody(
      t('ascent.founder.title'),
      `${t('ascent.founder.subtitle')}\n${t('ascent.codex.subtitle', codex)}`,
      0,
    );

    const cardHeight = 116;
    const cards: Phaser.GameObjects.Container[] = [];
    let used = 0;
    prompt.options.forEach((heroId) => {
      const hero = this.state.heroDeck.find((candidate) => candidate.id === heroId);
      if (!hero) return;
      const tier = tierForHero(hero);
      const card = this.optionCard(
        { x: 0, y: used, width: bodyWidth, height: cardHeight },
        {
          title: heroName(hero),
          body: `${heroTypeLabel(hero.type)}  ·  ${rarityLabel(hero.rarity)}`,
          note: this.heroStatLine(hero),
          badge: t(`ascent.rarity.${tier}` as Parameters<typeof t>[0]),
          accent: RARITY_COLOR[tier],
          washAlpha: RARITY_WASH[tier],
          reserveRight: PORTRAIT_W + 14,
          parent: body,
          onTap: () => this.choose(heroId),
        },
      );
      const drawnHeight = (card.getData('cardHeight') as number) ?? cardHeight;
      card.add(renderHeroFaceInBox(this, hero, {
        x: bodyWidth - PORTRAIT_W - 12,
        y: PORTRAIT_TOP,
        width: PORTRAIT_W,
        height: drawnHeight - PORTRAIT_TOP - 8,
      }));
      cards.push(card);
      used += drawnHeight + 10;
    });
    staggerIn(this, cards);
    finish(used);
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

    const content = this.promptFrame(
      t('ascent.over.title'),
      prompt.cause === 'capital'
        ? t('ascent.over.causeCapital', { land: prompt.landName ?? '', waves: ascent?.wavesSurvived ?? 0 })
        : t('ascent.over.causeAnnihilated', { waves: ascent?.wavesSurvived ?? 0 }),
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
  private beginOverlay(key: string): void {
    this.releaseOverlay();
    this.openPromptKey = key;
    // Immediately, not on the next tick: an overlay opened while the world is held would
    // otherwise leave the bar and the zoom stack floating over it until something else moved.
    this.renderActionBar();
    this.renderInspect();
  }

  private releaseOverlay(): void {
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
