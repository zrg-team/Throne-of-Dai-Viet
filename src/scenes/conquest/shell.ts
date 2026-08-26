/**
 * The standing screen of Dragon Ascent: `create`, the per-tick `refresh`, and the furniture that
 * floats over the map rather than on top of it — the action bar's routing and status dots, the
 * advisor and whisper strips, the paused badge, the right-edge zoom/mode stack and the province
 * inspect card. `beginOverlay`/`closeOverlay` are here because claiming the modal layer and
 * deciding what furniture survives are one decision.
 *
 * `refresh` is the priority order of the whole mode, and it runs several times a tick — the
 * battle clock drives it at `BATTLE_TICK_MS` — so anything once-only is latched, never guarded.
 * `renderMapControls` rewrites `window.__hudTapBounds` wholesale, so appenders run after it; and
 * `create`'s SHUTDOWN handler is the only teardown advisor, whispers, tour and banner ever get.
 */
import Phaser from 'phaser';
import { applyPaperFX } from '../../ui/ink/PaperFX';
import { applyRenderScale } from '../../game/graphicsQuality';
import { qualityLadder } from '../../game/qualityLadder';
import {
  ACTION_BAR_HEIGHT,
  GAME_HEIGHT,
  GAME_WIDTH,
  HEADER_HEIGHT,
  PLAYER_KINGDOM_ID,
} from '../../game/constants';
import { refreshAscentLaneState } from '../../systems/ascent/ConquestSystem';
import { countOpenDoors } from '../../systems/story/StorySystem';
import { contestedFronts, realmUnderAttack } from '../../systems/ascent/battleReport';
import { INK_UI, InkUI } from '../../ui/InkUI';
import { playWaveBanner } from '../../ui/ascent/waveBanner';
import { AscentHud } from '../../ui/ascent/AscentHud';
import { AdvisorStrip } from '../../ui/ascent/AdvisorStrip';
import { WhisperLine } from '../../ui/ascent/WhisperLine';
import { hasSeenRunTour, takeGuidedRun } from '../../state/tour';
import { ActionBar } from '../../ui/ActionBar';
import { ResourceBar } from '../../ui/ResourceBar';
import { UI_FONT } from '../../ui/fonts';
import { t } from '../../i18n';
import type { AscentLane } from '../../state/types';
import { promptSignature } from './constants';
import { clearLanePage } from './layers';
import { showWarBoard, warBoardSignature } from './screens/warBoard';
import type { ConquestUIScene } from '../ConquestUIScene';
import { attachPaperSheet } from '../../ui/ink/paperSheet';


/** The three map controls stacked at the right edge, matching the classic modes. */
type MapControlIcon = 'zoom-in' | 'zoom-out' | 'mode';

/**
 * The floating map controls: half their tap area, and the clearance kept below the lowest one.
 * The buttons draw 36×36 but claim 42×42 of touch, and it is the touch area that has to stay
 * off the action bar.
 */
const MAP_CONTROL_RADIUS = 21;
const MAP_CONTROL_GAP = 12;
/** Vertical pitch of the stack. */
const MAP_CONTROL_PITCH = 42;


export function create(self: ConquestUIScene): void {
  applyRenderScale(self);
  // The chrome is printed on the same sheet as the world, so it takes the same paper pass.
  applyPaperFX(self);
  attachPaperSheet(self);
  self.ui = new InkUI(self);
  self.resourceBar = new ResourceBar(self, self.state);
  self.add.existing(self.resourceBar);
  self.resourceBar.setDepth(80);

  // The resource strip is the door to the ledger. A player wondering about a number taps
  // the number — no new bar button, and the books open exactly where the question arose.
  const ledgerHit = self.add
    .rectangle(0, 0, GAME_WIDTH, HEADER_HEIGHT, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setDepth(81)
    .setInteractive();
  ledgerHit.on('pointerup', () => {
    if (self.state.pendingAscentPrompt || self.openPromptKey !== '') return;
    self.openLane('ledger');
  });

  self.hud = new AscentHud(self);

  // Built once and refreshed in place. Rebuilding it every tick would churn a dozen game
  // objects a second for a bar whose labels change only when the run's state does.
  self.actionBar = new ActionBar(self, self.state, (action) => handleBarAction(self, action));
  self.actionBar.statusColor = (action) => barStatusColor(self, action);
  // Not `Boolean(activeBattle)`. See `realmUnderAttack`: a siege raises no watched battle, so the
  // one control that leads to the war used to leave the bar at the exact moment the war became
  // unwinnable without it.
  self.actionBar.context = () => ({ battleLive: realmUnderAttack(self.state) });
  self.actionBar.refresh();

  // The advisor. Built here beside the bar rather than per render for the same reason: it is
  // written into on every economy tick and rebuilding its text would cost a canvas measure a
  // second for a line that usually has not changed.
  //
  // Its action goes through `handleBarAction`, not through a private door of its own — the
  // advice names a lane and the bar already knows how to open every lane there is. A second
  // route into those screens is a second thing to keep correct.
  self.advisor = new AdvisorStrip(self, (lane) => handleBarAction(self, lane));
  // Under the advisor, and a door rather than a notice: every whisper has a scene written for
  // it that nothing in this mode could reach.
  self.whispers = new WhisperLine(self, (storyId) => self.showStoryPage(storyId));

  // Taken once, here, rather than read where it is used: the flag is a one-shot handoff from the
  // manual and any second reader would find it already spent.
  self.guidedRun = takeGuidedRun();
  // A first run teaches by default, and the manual's button forces it for any run.
  self.tourActive = self.guidedRun || !hasSeenRunTour();

  // The battle clock and the published control bounds both outlive a single render; neither
  // may survive the scene that owns them.
  self.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    self.stopBattleClock();
    window.__hudTapBounds = [];
    self.advisor.destroy();
    self.whispers.destroy();
    self.runTour?.destroy();
    self.runTour = undefined;
    self.waveBanner?.destroy();
    self.waveBanner = undefined;
    self.waveCueQueue = [];
    self.arenaRoutHold?.remove();
    self.arenaRoutHold = undefined;
    // The emitter and the scroll areas survive scene.stop(); everything above dies with the
    // display list, these two do not.
    self.events.off('state-changed', self.onStateChanged);
    clearLanePage(self);
  });

  self.modalLayer = self.add.container(0, 0).setDepth(500);

  self.events.on('state-changed', self.onStateChanged);
  refresh(self);
}

// ── Frame ─────────────────────────────────────────────────────────────────

export function refresh(self: ConquestUIScene): void {
  if (!self.state.ascent) return;

  refreshAscentLaneState(self.state);
  self.resourceBar.refresh();
  self.hud.render(self.state.ascent);
  // Written before the lane guards below: those can return early, and the one line on screen
  // that claims to be reading the run must never be a tick behind the band above it — but not
  // while an overlay covers it: `renderActionBar` hides the strip under every lane and prompt,
  // and re-reading the whole run per beat for an invisible line was pure cost. The overlay's
  // close runs `refresh` again, which brings it straight back up to date.
  if (!self.state.pendingAscentPrompt && self.openPromptKey === '') self.advisor.render(self.state);
  self.whispers.render(self.state, self.advisor.bottom());

  // A lane that renders nothing has stranded the player: the bar and the map controls are
  // torn down before the screen is built, so an empty modal layer means no UI at all and no
  // way back. Recovering here rather than only at each lane's own guard makes the whole class
  // of bug survivable instead of fatal.
  if (self.openPromptKey.startsWith('lane:') && self.modalLayer.length === 0) {
    self.closeLane();
    return;
  }

  // The battle lane is the one screen whose contents move on their own — the fight runs on
  // the world's clock whether or not it is being watched — so it updates in place instead of
  // being rebuilt. Rebuilding it would also make its standing-order cards untappable, since a
  // card destroyed between press and release never fires.
  if (self.openPromptKey === 'lane:battle') {
    if (self.state.pendingAscentPrompt) {
      // A card has arrived over the fight. The prompt owns the screen while it is up — the
      // world is paused with it, so the siege waits — and the battle comes straight back after.
      self.reopenBattleAfterPrompt = true;
      self.closeLane();
      return;
    }
    self.updateBattle();
    // A fight that ended closes its own screen, which re-enters `refresh` — let that pass
    // finish the frame rather than carrying on against a key that no longer applies.
    if (self.openPromptKey !== 'lane:battle') return;
    // The lane's other screen is the war board, and it is the only page here with no clock of
    // its own. Redrawn when the *shape* of the war changes — see `warBoardSignature`.
    if (!self.battleUi && self.warBoardKey && self.warBoardKey !== warBoardSignature(self)) {
      self.replaceLanePage(() => showWarBoard(self));
      return;
    }
  }

  const prompt = self.state.pendingAscentPrompt;
  const key = prompt ? `${prompt.kind}:${promptSignature(prompt)}` : '';
  // Chrome overlays own the modal layer until dismissed; don't let a tick tear them down.
  const overlayOpen = self.openPromptKey === 'codex'
    || self.openPromptKey === 'quit'
    || self.openPromptKey === 'menu'
    || self.openPromptKey.startsWith('lane:');

  // The last fight of a run reports itself before the run does.
  //
  // The Reckoning waits for a clear screen — no overlay, no card — and `run-over` is itself a
  // card, raised on the same tick the fight that ended the run resolved. So the one engagement
  // in the whole run that matters most was the one whose result was never shown: the screen went
  // straight from the battlefield to the end of the run, which is exactly what "it doesn't show
  // any results, it jumps immediately to the last page" describes. Every other card can wait its
  // turn behind the Reckoning; this one cannot wait behind anything, because nothing follows it.
  const runEnding = prompt?.kind === 'run-over';
  if (runEnding && self.state.ascent?.pendingAftermath && !overlayOpen) {
    self.openAftermath();
    return;
  }

  // What the last answer actually did, before the next question is asked.
  //
  // Ahead of the prompt block on purpose: a story that chains straight into another beat would
  // otherwise overwrite `lastStoryOutcome` before it was ever read, and the one thing the player
  // asked for — being able to tell what a choice was worth — would be the thing dropped. It
  // yields only to the Reckoning, which nothing may sit in front of.
  //
  // Deliberately NOT an `AscentPrompt`: it would come out of `STORY_PROMPT_SHARE`'s fifteen per
  // cent and be rationed against the story cards it is reporting on.
  const outcome = self.state.lastStoryOutcome;
  if (outcome && !overlayOpen && !runEnding) {
    if (self.openPromptKey !== 'story-outcome') {
      self.lanePauseBeforeOpen = self.state.isStrategyPause;
      self.state.isStrategyPause = true;
      beginOverlay(self, 'story-outcome');
      self.showStoryOutcome(outcome);
      if (self.modalLayer.length === 0) self.dismissStoryOutcome();
    }
    return;
  }

  if (!overlayOpen && key !== self.openPromptKey) {
    // A decision card leaving the screen is a decision the player has answered. Counted here,
    // where the transition is already being detected, rather than in each of the twenty-odd
    // prompt renderers — the guided run's `decision` stage only needs to know that one has
    // happened, and a counter kept at the single place the key changes cannot drift from it.
    if (self.openPromptKey !== '' && key === '') self.promptsAnswered += 1;
    beginOverlay(self, key);
    if (prompt) self.renderPrompt(prompt);
  }

  // A fight that has just begun brings its own screen up. After the prompt key is reconciled,
  // so a card that arrived on the same tick is answered first and the battle follows it.
  if (self.maybeAutoOpenBattle()) return;

  // The war spreading to a second province brings the board up, ahead of the Reckoning for a
  // fight that has just ended: one is news about what happened, the other is a decision about
  // what to do next, and the decision does not wait behind the news. `addSideBattle` has already
  // stopped the world; `showWarBoard` clears the flag and hands the pause back on the way out.
  //
  // `!overlayOpen` would be wrong here and it is the case that matters most: the player is very
  // often *already on the battle screen* when the war spreads, and that is precisely the moment
  // they need telling. The battle lane is the one overlay this may replace, because it is the
  // same lane — it re-renders as the board and its own Close still leads home.
  if (self.state.ascent?.frontsOpened && !prompt
    && (!overlayOpen || self.openPromptKey === 'lane:battle')) {
    self.openLane('battle');
    return;
  }

  // A fight that has just ended brings its own screen up too. After the battle, obviously, and
  // after any card that arrived with it — the world is held while it is read, exactly as every
  // other lane holds it.
  if (self.state.ascent?.pendingAftermath && !overlayOpen && !prompt) {
    self.openAftermath();
    return;
  }

  // The proclamation, once the screen is its own again.
  //
  // Deferred rather than dropped when a lane or a card owns the screen: the banner draws at 470
  // and the modal layer at 500, so playing it under a decision would spend the one moment the
  // mode has to say "you won that" on a strip of paper nobody can see. It waits, and a newer cue
  // overwrites an older one, so there is no backlog to drain.
  playPendingWaveCue(self);
  // After the prompt key is reconciled, never before: both of these decide whether to show
  // themselves from it, and reading last tick's value left the bar hidden for a whole frame
  // after the final card of a chain was answered.
  renderActionBar(self);
  renderInspect(self);
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
function playPendingWaveCue(self: ConquestUIScene): void {
  const ascent = self.state.ascent;
  if (!ascent) return;

  // Drained out of state on sight, whether or not one can be played now. The director's queue is
  // capped at three and would otherwise keep the *oldest* three while the scene waited for a
  // clear screen; taking them here and holding them in the scene keeps them in the order they
  // were raised, and `lastWaveCueId` drops any a reloaded save has already shown.
  const raised = ascent.waveCues;
  if (raised && raised.length > 0) {
    for (const cue of raised) {
      if (cue.id > self.lastWaveCueId) {
        self.lastWaveCueId = cue.id;
        self.waveCueQueue.push(cue);
      }
    }
    ascent.waveCues = [];
  }

  if (self.waveBanner || self.waveCueQueue.length === 0) return;
  // Never over a decision. The banner draws at 470 and the modal layer at 500, so playing one
  // under a card would spend the moment on a strip of paper nobody can see.
  if (self.state.pendingAscentPrompt || self.openPromptKey !== '') return;

  const cue = self.waveCueQueue.shift();
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
    self.wavePauseBefore = self.state.isStrategyPause;
    self.state.isStrategyPause = true;
  }

  self.waveBanner = playWaveBanner(self, cue, () => {
    self.waveBanner = undefined;
    if (holdsWorld) self.state.isStrategyPause = self.wavePauseBefore;
    // Straight into the next one. A wave the realm plainly holds is met without a card, so a
    // result and the next landing are raised on the same tick and read as one sentence: this
    // invasion ended, that one is beginning.
    playPendingWaveCue(self);
  });
}

// ── Three Lane Surface ───────────────────────────────────────────────────

/**
 * Keeps the bar current and hides it while something owns the modal layer — behind the dim
 * its buttons would be half-visible and untappable.
 */
export function renderActionBar(self: ConquestUIScene): void {
  const hidden = Boolean(self.state.pendingAscentPrompt) || self.openPromptKey !== '';
  self.actionBar.setVisible(!hidden);
  if (!hidden) self.actionBar.refresh();
  self.advisor.setVisible(!hidden);
  self.whispers.setVisible(!hidden);
  renderMapControls(self, hidden);
  // Composed wholesale on every refresh, from the stack's recorded rectangles plus whatever the
  // advisor and the whisper strip currently occupy. The controls themselves are keyed and only
  // rebuilt when they move; the published guard list is cheap and must always be current.
  window.__hudTapBounds = hidden
    ? [{ x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT }]
    : [...self.mapControlBounds, ...self.advisor.tapBounds(), ...self.whispers.tapBounds()];
  renderPausedBadge(self, hidden);
  self.maybeRunTour(hidden);
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
function renderPausedBadge(self: ConquestUIScene, hidden: boolean): void {
  const key = hidden || !self.state.isStrategyPause ? '' : 'paused';
  if (key === self.pausedBadgeKey && (key === '') === (self.pausedBadge === undefined)) return;
  self.pausedBadgeKey = key;
  self.pausedBadge?.destroy();
  self.pausedBadge = undefined;
  if (key === '') return;

  const width = 128;
  const height = 24;
  const x = (GAME_WIDTH - width) / 2;
  const y = GAME_HEIGHT - ACTION_BAR_HEIGHT - height - 10;

  const badge = self.add.container(0, 0).setDepth(430);
  badge.add(self.ui.panel({ x, y, width, height }, {
    fill: INK_UI.backgroundInk,
    fillShade: INK_UI.brush,
    border: INK_UI.gold,
    radius: 12,
  }));
  badge.add(self.add.text(GAME_WIDTH / 2, y + height / 2, t('ascent.hud.paused'), {
    color: '#2a2118',
    fontFamily: UI_FONT,
    fontSize: '11px',
    fontStyle: '700',
  }).setOrigin(0.5));
  self.pausedBadge = badge;
}

/**
 * Zoom and the terrain/control toggle, in the same right-edge stack the classic modes use.
 *
 * These are map controls, not menu entries, so they belong on the map rather than in the
 * action bar — and without the mode toggle the player has no way to reach the control view,
 * which is the one view that answers "who holds what" across the whole board at once.
 */
function renderMapControls(self: ConquestUIScene, hidden: boolean): void {
  // Keyed on everything the stack is drawn from. It was destroyed and rebuilt on every refresh
  // — every beat, during a fight — to draw the same three buttons in the same three places.
  const key = hidden ? 'hidden' : `${inspectCardTop(self) ?? '-'}:${self.state.mapRenderMode}`;
  if (key === self.mapControlsKey) return;
  self.mapControlsKey = key;
  for (const object of self.mapControlObjects) object.destroy();
  self.mapControlObjects = [];
  self.mapControlBounds = [];
  if (hidden) {
    // A prompt or lane overlay covers the map, so nothing below it is a map tap; the guard
    // itself is published by `renderActionBar`'s composition below.
    return;
  }

  const x = GAME_WIDTH - 30;
  // The inspect card spans the full width, so when one is up the stack sits above it
  // rather than on top of it.
  //
  // Measured from the *edge* of the lowest button rather than its centre. Clearing the bar by
  // 16px from the centre left only 16 − 21 = −5px between its tap area and the bar's, so the
  // bottom control sat on the bar it was supposed to float above.
  const inspectTop = inspectCardTop(self);
  const floor = inspectTop ?? GAME_HEIGHT - ACTION_BAR_HEIGHT;
  const bottom = floor - MAP_CONTROL_GAP - MAP_CONTROL_RADIUS;
  const controls: Array<[MapControlIcon, () => void]> = [
    ['zoom-in', () => self.events.emit('ui:zoom-map', 1)],
    ['zoom-out', () => self.events.emit('ui:zoom-map', -1)],
    ['mode', () => {
      self.events.emit('ui:toggle-render-mode');
      refresh(self);
    }],
  ];

  controls.forEach(([icon, onTap], index) => {
    const y = bottom - (controls.length - 1 - index) * MAP_CONTROL_PITCH;
    self.mapControlObjects.push(createMapIconButton(self, x, y, icon, onTap));
    // Published, not hardcoded: the stack shifts up when a province is selected, so a fixed
    // band in the world scene would guard the wrong pixels half the time. Without this the
    // canvas-level tap handler underneath treated a press on + / − as a tap on the province
    // behind it, selected that land, and the re-render destroyed the button before Phaser
    // could deliver the release — so the zoom controls never fired at all.
    //
    // Recorded on the scene rather than pushed straight into `__hudTapBounds`: the stack is
    // keyed now, so `renderActionBar` recomposes the published list every refresh from this.
    self.mapControlBounds.push({ x: x - 22, y: y - 22, width: 44, height: 44 });
  });
}

/** The classic modes' round map button, redrawn here rather than reaching into UIScene. */
function createMapIconButton(self: ConquestUIScene,
  x: number,
  y: number,
  icon: MapControlIcon,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const container = self.add.container(x, y).setDepth(430);
  const g = self.add.graphics();
  g.fillStyle(INK_UI.parchment, 0.96);
  g.fillRoundedRect(-18, -18, 36, 36, 8);
  g.lineStyle(2, INK_UI.brush, 0.9);
  g.strokeRoundedRect(-18, -18, 36, 36, 8);
  g.lineStyle(3, INK_UI.brush, 0.9);

  if (icon === 'zoom-in' || icon === 'zoom-out') {
    g.lineBetween(-8, 0, 8, 0);
    if (icon === 'zoom-in') g.lineBetween(0, -8, 0, 8);
  } else if (self.state.mapRenderMode === 'terrain') {
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

  const hit = self.add.rectangle(0, 0, 42, 42, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
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
function handleBarAction(self: ConquestUIScene, action: string): void {
  if (action === 'pause') {
    togglePause(self);
    return;
  }
  if (action === 'menu') {
    self.showSystemMenu();
    return;
  }
  if (action === 'codex') {
    self.showCodex();
    return;
  }
  self.openLane(action as AscentLane);
}

/**
 * Stop and start the world's clock. Nothing else.
 *
 * This is the "let me think" pause, and it used to be impossible to reach: the button
 * labelled Pause/Resume opened the save-and-quit sheet instead, so the only way to stop time
 * was through a menu whose other two options left the run. Two different jobs now have two
 * different buttons — this one, and the ☰ beside it.
 */
function togglePause(self: ConquestUIScene): void {
  self.state.isStrategyPause = !self.state.isStrategyPause;
  refresh(self);
}

/**
 * The dot on a bar button: a standing invitation to open that screen. Each condition is
 * about that screen specifically, so a lit button always means there is something real
 * behind it — never a decorative badge.
 */
function barStatusColor(self: ConquestUIScene, action: string): number | undefined {
  const state = self.state;
  const ascent = state.ascent;
  if (!ascent) return undefined;

  switch (action) {
    // A live siege is the loudest thing the bar can say — and a province under attack that the
    // screen did not open for is the second loudest. It used to say nothing at all about the
    // second, which is most of the 20–96 engagements a measured run settles.
    case 'battle': {
      if (ascent.activeBattle) return INK_UI.cinnabar;
      const fronts = contestedFronts(state);
      if (fronts.length === 0) return undefined;
      return fronts.some((front) => front.besieged || front.theirMen > front.ourMen)
        ? INK_UI.cinnabar
        : INK_UI.gold;
    }
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
function setMapVisible(self: ConquestUIScene, visible: boolean): void {
  const parent = self.scene.manager.getScene('ConquestScene') ?? self.scene.manager.getScene('MapScene');
  if (parent && parent !== (self as Phaser.Scene) && parent.scene.isActive()) {
    parent.scene.setVisible(visible);
  }
}

export function beginOverlay(self: ConquestUIScene, key: string): void {
  // Building a full-screen overlay costs a burst of heavy frames; the ladder must not read
  // that burst as the device failing — a step down here is what blurred iPhones at high.
  qualityLadder()?.hold(800);
  releaseOverlay(self);
  self.openPromptKey = key;
  // The battle screen is a full sheet of parchment with nothing showing through it.
  if (key === 'lane:battle') setMapVisible(self, false);
  // Immediately, not on the next tick: an overlay opened while the world is held would
  // otherwise leave the bar and the zoom stack floating over it until something else moved.
  renderActionBar(self);
  renderInspect(self);
}

function releaseOverlay(self: ConquestUIScene): void {
  setMapVisible(self, true);
  self.stopBattleClock();
  self.battleUi = undefined;
  clearLanePage(self);
}

/** Closes a chrome overlay (Codex / menu / quit) without touching the prompt queue. */
export function closeOverlay(self: ConquestUIScene): void {
  // The close rebuilds the map chrome in one frame — held for the same reason as the open.
  qualityLadder()?.hold(800);
  releaseOverlay(self);
  self.openPromptKey = '';
  refresh(self);
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
function inspectCardTop(self: ConquestUIScene): number | undefined {
  const land = self.state.lands.find((candidate) => candidate.id === self.state.selectedLandId);
  if (!land || self.state.pendingAscentPrompt) return undefined;
  const mine = land.ownerId === PLAYER_KINGDOM_ID;
  return GAME_HEIGHT - ACTION_BAR_HEIGHT - (mine ? 90 : 134);
}

function renderInspect(self: ConquestUIScene): void {
  const land = self.state.lands.find((candidate) => candidate.id === self.state.selectedLandId);
  // Keyed on everything the card prints. It was destroyed and rebuilt on every refresh — every
  // beat, while a fight held a province selected — to show the same four numbers. An overlay
  // covering it empties the key, and the overlay's close rebuilds it fresh.
  const key = !land || self.state.pendingAscentPrompt || self.openPromptKey !== ''
    ? ''
    : [land.id, land.ownerId, Math.round(land.outputs.gold), Math.round(land.outputs.food),
      Math.round(land.defense * 16 + land.localSoldiers * 2.5)].join(':');
  if (key === self.inspectKey) return;
  self.inspectKey = key;
  for (const object of self.inspectObjects) object.destroy();
  self.inspectObjects = [];

  if (key === '') return;
  if (!land) return;

  const mine = land.ownerId === PLAYER_KINGDOM_ID;
  const cardY = inspectCardTop(self) ?? 0;

  const card = self.ui.card(
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
  self.inspectObjects.push(card);

  if (mine) return;

  const claim = self.ui.button(
    { x: 14, y: cardY + 86, width: GAME_WIDTH - 28, height: 38 },
    t('ascent.conquer.claimThis', { land: land.name }),
    () => self.events.emit('ui:ascent-conquer', land.id),
    { variant: 'primary', fontSize: '13px' },
  );
  claim.setDepth(120);
  self.inspectObjects.push(claim);
}
