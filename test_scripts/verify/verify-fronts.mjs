// Two fields at once, and the player able to move between them.
//
// The mode fought one engagement and settled everything else as hidden dice — measured over four
// 400-tick runs, 20–96 engagements a run with the screen opening for 6–15. This drives the case
// the old code could not reach at all: two invader hosts on
// two different provinces of ours, at the same time. Both must open, both must keep beating, the
// world must stop to say so, and `focusBattle` must swap the player between them without the fight
// they leave freezing or the one they take staying in a general's hands.
//
// Deterministic by construction rather than by seed: waiting for a seeded run to serve up two
// simultaneous contacts is how this went unverified in the first place.
//
// `st.pendingAscentPrompt` is the live prompt slot, not `st.ascent.prompt` — the latter does not
// exist, and a harness that polls it answers nothing, leaves `isPaused` true for the whole run and
// measures a realm that never fortifies, hires or musters. That mistake cost this round a set of
// wrong numbers before it was caught.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
await page.goto(`${process.env.DEV_URL ?? 'http://127.0.0.1:5179'}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });

const out = await page.evaluate(async () => {
  const { createAscentGameState } = await import('/src/state/GameState.ts');
  const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
  const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
  const { beginBattle } = await import('/src/systems/ascent/BattleSystem.ts');
  const F = await import('/src/systems/ascent/fronts.ts');
  const { createBattlePreview } = await import('/src/systems/WarSystem.ts');
  const { MAX_LIVE_BATTLES } = await import('/src/game/ascentConfig.ts');

  let s = 20260826 >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const st = createAscentGameState({ seaSides: 1, difficulty: 'normal' });
  const pick = (p) => {
    switch (p.kind) {
      case 'founder': return p.options[0];
      case 'power-draft': return p.cards[0] ?? 'skip';
      case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
      case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
      case 'hero-choice': return p.heroIds[0] ?? 'pass';
      case 'court-appointment': return p.options[0].id;
      case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
      case 'doctrine': return p.options[0];
      case 'battle': return 'hold';
      case 'parliament': return 'decline';
      default: return (p.options?.find?.((o) => o.affordable) ?? p.options?.[0])?.id ?? 'ok';
    }
  };
  const settle = () => { for (let g = 0; g < 12; g += 1) { const p = st.pendingAscentPrompt; if (!p) break; resolveAscentPrompt(st, pick(p)); } };

  // Let the realm grow a little so it holds more than one province worth attacking.
  for (let i = 0; i < 40; i += 1) { advanceAscentTick(st); settle(); if (st.ascent.pendingAftermath) st.ascent.pendingAftermath = undefined; }
  st.ascent.activeBattle = undefined;
  st.ascent.sideBattles = [];
  // One watched engagement per province per wave is a ration on *screens*, and the forty seasons
  // above spend it wherever they like. This is testing the multi-field machinery, not the ration,
  // so the stamp is cleared before the probes go in — left standing, a probe whose province the
  // warm-up already fought on is refused and the second field never opens.
  st.ascent.lastWatchedKey = undefined;
  // And the standing hand-over is off for these probes. This section is about the player moving
  // between fields, which needs a field the player is actually holding; under the default
  // (`handToGenerals`) both open delegated and the general fought the first one to a finish
  // before the walk-onto test could run.
  st.ascent.handToGenerals = false;

  // A realm of one province cannot be attacked in two places, and how fast the autopilot expands
  // is not what this is testing. Hand it a neighbour if forty seasons did not win one.
  let mine = st.lands.filter((l) => l.ownerId === 'dai-viet');
  if (mine.length < 2) {
    const seat = mine[0];
    const next = seat?.neighbors.map((id) => st.lands.find((l) => l.id === id))
      .find((l) => l && l.ownerId !== 'dai-viet');
    if (!next) return { fatal: 'the seat has no neighbour to hold' };
    next.ownerId = 'dai-viet';
    next.localSoldiers = Math.max(240, next.localSoldiers);
    mine = st.lands.filter((l) => l.ownerId === 'dai-viet');
  }
  if (mine.length < 2) return { fatal: `only ${mine.length} province(s) held` };

  // Put a hostile host on each of two provinces of ours, and open a battle on each the way the
  // tick does — through `beginBattle`, off a `pendingBattle`, so nothing here bypasses the gates.
  const rival = st.kingdoms.find((k) => k.id !== 'dai-viet');
  const openOn = (land, n) => {
    const army = {
      id: `probe-${land.id}-${n}`, kingdomId: rival.id, name: `Probe ${n}`, landId: land.id,
      units: { spearmen: 420, archers: 180, heavyInfantry: 100 },
      morale: 85, supply: 90, rations: 999, provisions: 999,
      level: 1, experience: 0, experienceToNextLevel: 120,
    };
    st.armies.push(army);
    (st.invasions ??= []).push({
      armyId: army.id, kingdomId: rival.id, targetLandId: land.id, intent: 'conquest', plan: 'spearhead',
    });
    const preview = createBattlePreview(st, army.id, land.id);
    st.pendingBattle = {
      invaderArmyId: army.id, landId: land.id, landName: land.name,
      kingdomId: rival.id, kingdomName: rival.name, isGreat: false,
      attackerPower: preview?.attackerPower ?? 0, defenderPower: preview?.defenderPower ?? 0,
    };
    const ok = beginBattle(st);
    st.pendingBattle = undefined;
    return ok;
  };

  const first = openOn(mine[0], 1);
  const secondLand = mine.find((l) => l.id !== mine[0].id);
  const second = openOn(secondLand, 2);
  // A province can only be fought over once at a time. `lastWatchedKey` is keyed on the wave, so
  // before this was checked the same ground opened a second field the moment the wave counter
  // moved — two fights over one province, each enrolling the same hosts.
  //
  // And the second column is *absorbed*, not refused. `beginBattle` used to answer this contact
  // with `false`, which the tick answers with `resolvePendingBattle(…, 'delegate')` — a hidden
  // odds roll that could take the province out from under the battle still being fought over it.
  // It now joins the standing fight and reports the contact as handled.
  st.ascent.wave += 1;
  const duplicate = openOn(mine[0], 3);
  const absorbed = (F.battleAt(st, mine[0].id)?.theirArmyIds ?? []).includes(`probe-${mine[0].id}-3`);

  const afterOpen = {
    first, second, duplicate, absorbed,
    oneFieldPerProvince: new Set(F.liveBattles(st).map((b) => b.landId)).size === F.liveBattles(st).length,
    live: F.liveBattles(st).length,
    focus: st.ascent.activeBattle?.landId,
    sides: (st.ascent.sideBattles ?? []).map((b) => b.landId),
    alerted: st.ascent.frontsOpened ?? 0,
    stopped: Boolean(st.isStrategyPause),
    sideHeldByGeneral: (st.ascent.sideBattles ?? []).every((b) => b.delegated === true),
  };

  // Both fields must move on the same clock. The failure the old queueing had was a second
  // invader frozen for the length of the first fight, so this is the assertion that matters most.
  const beatOf = (b) => (b.approachBeats ?? 0) + b.round;
  const before = F.liveBattles(st).map((b) => ({ land: b.landId, beat: beatOf(b) }));
  st.isStrategyPause = false;
  // One tick, not three. All this has to show is that both fields moved on the same clock — and
  // three ticks is long enough for a 700-man column to finish reducing a province, which leaves
  // the walk-between-fields checks below with nothing to walk from. How long that takes depends
  // on forty seasons of autopilot before it, so it is not a thing to tune against.
  advanceAscentTick(st); settle();
  if (st.ascent.pendingAftermath) st.ascent.pendingAftermath = undefined;
  const moved = before.map((was) => {
    const now = F.liveBattles(st).find((b) => b.landId === was.land);
    return { land: was.land, gone: !now, from: was.beat, to: now ? beatOf(now) : -1 };
  });

  // Walking from one field to the other.
  const target = (st.ascent.sideBattles ?? [])[0]?.landId;
  const leaving = st.ascent.activeBattle?.landId;
  const swapped = target ? F.focusBattle(st, target) : false;
  const afterSwap = {
    swapped, target, leaving,
    focus: st.ascent.activeBattle?.landId,
    sides: (st.ascent.sideBattles ?? []).map((b) => b.landId),
    focusIsOurs: st.ascent.activeBattle?.delegated === false,
    leftFieldHeld: (st.ascent.sideBattles ?? []).find((b) => b.landId === leaving)?.delegated === true,
    live: F.liveBattles(st).length,
  };

  // Ending the commanded fight must hand the player the field a general is still holding, rather
  // than dropping them back on a map with a war on it and no door into the war.
  // The field left behind has been taking losses since it opened, and promotion has nothing to
  // promote if it settles on the same tick. Reinforced here so the thing under test is the
  // promotion and not how long a probe column lasts.
  const survivor = (st.ascent.sideBattles ?? [])[0];
  if (survivor) {
    for (const id of survivor.ourArmyIds ?? []) {
      const host = st.armies.find((army) => army.id === id);
      if (host) host.units = { spearmen: 900, archers: 300, heavyInfantry: 150 };
    }
    survivor.ourNow = 1350;
    survivor.ourMorale = 95;
  }
  const held = st.ascent.activeBattle;
  if (held) held.over = true;
  advanceAscentTick(st); settle();
  const promoted = {
    focus: st.ascent.activeBattle?.landId,
    wasSide: afterSwap.sides.includes(st.ascent.activeBattle?.landId),
    // And it must not be answered with the opening drum: this field has been fought on for beats.
    beat: (st.ascent.activeBattle?.approachBeats ?? 0) + (st.ascent.activeBattle?.round ?? 0),
  };

  return { afterOpen, moved, afterSwap, promoted, cap: MAX_LIVE_BATTLES, mine: mine.length };
});

const fails = [];
const line = (ok, label, detail) => {
  if (!ok) fails.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${detail}`);
};

if (out.fatal) {
  console.log(`FAIL: ${out.fatal}`);
  await browser.close();
  process.exit(1);
}
console.log('═══ TWO FIELDS AT ONCE ═══\n');
const a = out.afterOpen;
line(a.first && a.second, 'both contacts open a battle', `first=${a.first} second=${a.second}`);
line(a.oneFieldPerProvince, 'one field per province, whatever the wave says',
  `${a.live} field(s) over ${new Set([a.focus, ...a.sides]).size} province(s)`);
line(a.duplicate && a.absorbed, 'a second column joins the fight instead of rolling for the ground',
  `handled=${a.duplicate} enrolled=${a.absorbed}`);
line(a.live === 2, 'two fields are live at once', `${a.live} live`);
line(a.sides.length === 1 && a.focus && !a.sides.includes(a.focus),
  'one is the player\'s, the other a side front', `focus ${a.focus}, sides ${a.sides.join(',') || '-'}`);
line(a.sideHeldByGeneral, 'the side front opens under a general', String(a.sideHeldByGeneral));
line(a.alerted >= 2, 'the count is announced', `frontsOpened=${a.alerted}`);
// Announced, not frozen: stopping a running battle to report another one is the stall reported
// as "fight stop in middle, nothing to do". The hold is kept only when nobody is on a field, and
// then the board comes up to choose from — see `addSideBattle`.
line(!a.stopped, 'and the world does NOT stop for it while a fight is under way', `isStrategyPause=${a.stopped}`);

console.log('');
const stalled = out.moved.filter((m) => !m.gone && m.to <= m.from);
line(stalled.length === 0, 'every field keeps beating — none frozen',
  out.moved.map((m) => `${m.land} ${m.from}->${m.gone ? 'ended' : m.to}`).join('  '));

console.log('');
const b = out.afterSwap;
line(b.swapped, 'the player can walk onto the other field', `${b.leaving} -> ${b.target}`);
line(b.focus === b.target, 'and it becomes the commanded one', `focus ${b.focus}`);
line(b.focusIsOurs, 'taken back from its general by the walk', `delegated=${!b.focusIsOurs}`);
line(b.leftFieldHeld, 'the field left behind is handed over, not dropped', `held=${b.leftFieldHeld}`);
line(b.live === 2, 'and both are still being fought', `${b.live} live`);

console.log('');
const p = out.promoted;
line(Boolean(p.focus) && p.wasSide, "ending your fight hands you the general's field",
  `focus is now ${p.focus}`);
line(p.beat > 0, 'and it arrives mid-fight, not at a fresh opening', `beat ${p.beat}`);

console.log('');
line(errors.length === 0, 'no console errors', errors.length ? errors.slice(0, 2).join(' ; ') : 'none');
await browser.close();
console.log(fails.length === 0
  ? `\nPASS: the war runs on up to ${out.cap} fields and the player moves between them`
  : `\nFAIL: ${fails.length} check(s) — ${fails.join(' | ')}`);
process.exit(fails.length === 0 ? 0 : 1);
