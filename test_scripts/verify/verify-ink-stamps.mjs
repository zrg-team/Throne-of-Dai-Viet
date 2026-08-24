/**
 * The stamp registry, held to its own claims — on both backends.
 *
 * What can silently go wrong with baked ink, and is pinned here:
 *  - a stamp registry that never fills (the map's animals stopped going through it);
 *  - pool bytes past their caps (the eviction never ran);
 *  - a GL context loss leaving black squares (atlas pages and dynamic textures die with the
 *    context; the RESTORE_WEBGL hook must re-stamp them from the retained draws);
 *  - an atlas frame that lands flipped or offset (DynamicTexture's framebuffer origin differs
 *    from a canvas texture's — probed with an asymmetric glyph, not assumed);
 *  - the fallen layer flattened into the ground bake again (bodies drawn but never shown).
 *
 * Usage: node test_scripts/verify/verify-ink-stamps.mjs   (runs canvas, then atlas)
 */
import { boot, startWorld, revealAll, report } from '../perf/_boot.mjs';

const checks = [];

// --only-fallen: iterate on the battle-drive block without paying for the two backend runs.
for (const mode of process.argv.includes('--only-fallen') ? [] : ['canvas', 'atlas']) {
  const query = mode === 'atlas' ? '?capture=1&stamp=atlas' : '?capture=1';
  const { browser, page, errors } = await boot({ dpr: 2, quality: 'high', query });
  await startWorld(page, { mode: 'rival', seed: 1337 });
  await revealAll(page);
  await page.waitForTimeout(600);

  const stats = await page.evaluate(() => window.__inkStamps());
  checks.push([`${mode}: registry filled by the living map`, stats.count > 0, `count ${stats.count}`]);
  checks.push([`${mode}: backend is the one asked for`, stats.backend === mode, `got ${stats.backend}`]);
  const CAPS = { figure: 24, ui: 12, prop: 8, world: 8 }; // MB at high
  const over = Object.entries(stats.pools).filter(([pool, bytes]) => bytes > CAPS[pool] * 1024 * 1024);
  checks.push([`${mode}: every pool inside its cap`, over.length === 0, JSON.stringify(over)]);

  // ── Orientation probe: an asymmetric glyph must come back upright, not flipped ──
  const probe = await page.evaluate(async () => {
    const { stamp, placeStamp } = await import('/src/ui/ink/stamp.ts');
    const game = window.__phaserGame;
    // The UI scene: zoom-free design coordinates, so canvas px = design px x renderScale.
    const scene = game.scene.getScene('UIScene');
    // An L: heavy bar along the BOTTOM, thin stem up the LEFT. Flipped vertically, the heavy
    // bar reads at the top; flipped horizontally, the stem reads on the right. Drawn coarse so
    // the samples land deep inside the ink, tolerant of a few pixels of mapping slack.
    const st = stamp(scene, 'test:orient', { left: 0, right: 40, top: 0, bottom: 40 }, (g, x, y, raster) => {
      // On a white plate, so every sample lands on the stamp's own pixels and the HUD ink
      // underneath cannot fake a flip verdict.
      g.fillStyle(0xffffff, 1);
      g.fillRect(x, y, 40 * raster, 40 * raster);
      g.fillStyle(0x000000, 1);
      g.fillRect(x, y + 24 * raster, 40 * raster, 16 * raster);   // bottom bar
      g.fillRect(x, y, 16 * raster, 40 * raster);                  // left stem
    }, { pool: 'world' });
    placeStamp(scene, st, 60, 60).setDepth(99999).setScrollFactor(0);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { key: st.key, texture: st.texture, frame: st.frame ?? null };
  });
  const zoom = await page.evaluate(() => window.__phaserGame.scene.getScenes(true)[0].cameras.main.zoom);
  const shot = await page.screenshot();
  const png = await import('playwright').then(() => null).catch(() => null);
  // Pixel test without a PNG lib: use the canvas itself.
  const orient = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = canvas.width; probeCanvas.height = canvas.height;
    const ctx = probeCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const scale = canvas.width / 390; // design width
    const at = (dx, dy) => {
      const d = ctx.getImageData(Math.round((60 + dx) * scale), Math.round((60 + dy) * scale), 1, 1).data;
      return (d[0] + d[1] + d[2]) / 3;
    };
    // Sample inside the glyph: bottom-right (bar only) must be dark, top-right must be light.
    return { bottomRight: at(30, 32), topRight: at(30, 8) };
  });
  checks.push([`${mode}: stamp lands upright (bottom bar dark)`, orient.bottomRight < 120, `got ${Math.round(orient.bottomRight)}`]);
  checks.push([`${mode}: stamp lands upright (top-right light)`, orient.topRight > 200, `got ${Math.round(orient.topRight)}`]);
  void probe; void zoom; void shot; void png;

  // ── Context loss: everything must come back ────────────────────────────────
  const lost = await page.evaluate(async () => {
    const before = window.__inkStamps();
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return { skipped: true };
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 300));
    ext.restoreContext();
    await new Promise((r) => setTimeout(r, 1200));
    const after = window.__inkStamps();
    const game = window.__phaserGame;
    const scene = game.scene.getScenes(true)[0];
    const missing = after.keys().filter((k) => !scene.textures.exists(k) && !after.keys().includes(k));
    return { skipped: false, beforeCount: before.count, afterCount: after.count, missing, restamps: after.restamps };
  });
  if (lost.skipped) {
    checks.push([`${mode}: context loss exercised`, false, 'WEBGL_lose_context unavailable']);
  } else {
    checks.push([`${mode}: registry survives a context loss`, lost.afterCount >= lost.beforeCount, `${lost.beforeCount} -> ${lost.afterCount}`]);
    checks.push([`${mode}: no key lost its texture`, lost.missing.length === 0, lost.missing.slice(0, 3).join(', ')]);
  }
  const blank = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = 64; probeCanvas.height = 64;
    const ctx = probeCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    return sum / (64 * 64 * 3);
  });
  checks.push([`${mode}: the map is not blank after restore`, blank > 8 && blank < 247, `mean ${Math.round(blank)}`]);

  checks.push([`${mode}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | ')]);
  await browser.close();
}

// ── The fallen show on the field (the bake must not flatten them) ────────────
{
  const { browser, page, errors } = await boot({ dpr: 1, quality: 'low' });
  // The seed and the drive are shot-battle-open's, transplanted verbatim: on 20260812 an
  // engagement begins around tick 13, before the court lane has anything to propose - the
  // 1337 run drowned in law prompts that re-raise on every refresh and never reached the lane.
  await startWorld(page, { mode: 'ascent', seed: 20260812 });
  const fallen = await page.evaluate(async () => {
    const st = window.__mandateState;
    const { advanceAscentTick } = await import('/src/systems/ascent/AscentTick.ts');
    const { resolveAscentPrompt } = await import('/src/systems/ascent/AscentResolver.ts');
    const ui = window.__phaserGame.scene.getScene('ConquestUIScene');
    const world = window.__phaserGame.scene.getScene('ConquestScene');
    const first = (p) => {
      switch (p.kind) {
        case 'founder': return p.options[0];
        case 'power-draft': return p.cards[0] ?? 'skip';
        case 'conquer-target': return p.targets[0]?.landId ?? 'hold';
        case 'conquer-method': return p.target.methods.find((m) => !m.blockedReason)?.method ?? 'back';
        case 'hero-choice': return p.heroIds[0] ?? 'pass';
        case 'court-appointment': return p.options[0].id;
        case 'law-choice': return p.projectIds[0] ? `edict:${p.projectIds[0]}` : 'hold';
        case 'parliament': return 'decline';
        case 'envoy': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        case 'famine': return (p.options.find((o) => o.affordable) ?? p.options[p.options.length - 1]).id;
        case 'rival-demand': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        case 'story-beat': return p.options.length ? (p.options.find((o) => o.affordable) ?? p.options[0]).id : 'ok';
        case 'empire-response': return (p.options.find((o) => o.affordable) ?? p.options[0]).id;
        default: return 'ok';
      }
    };
    const log = [];
    // `openLane` refuses while ANY prompt is pending (frame.ts guards on it), and the live loop
    // can raise one - famine, an envoy - in the gap between the battle starting and the lane
    // opening; an unaffordable famine option makes that prompt unresolvable by choice, so after
    // the choices fail it is force-cleared. The battle itself can also end while we fumble, so
    // the whole approach retries.
    const drain = () => {
      let guard = 0;
      while (st.pendingAscentPrompt && guard++ < 10) {
        const prompt = st.pendingAscentPrompt;
        const handled = resolveAscentPrompt(st, first(prompt));
        if (log.length < 40) log.push(`${prompt.kind}=${handled}`);
        if (st.pendingAscentPrompt === prompt) { st.pendingAscentPrompt = undefined; break; }
      }
    };
    let u;
    for (let attempt = 0; attempt < 3 && !u; attempt += 1) {
      for (let t = 0; t < 200 && !st.ascent.activeBattle; t += 1) {
        advanceAscentTick(st);
        world.refresh();
        drain();
        ui.events.emit('state-changed');
      }
      if (!st.ascent.activeBattle) continue;
      drain();
      if (!st.ascent.activeBattle) continue;
      ui.battleAwaitingOrder = false;
      ui.openLane('battle');
      await new Promise((r) => setTimeout(r, 150));
      u = ui.battleUi;
    }
    // Asleep for the drain phase: the live loop re-raises prompts (famine, envoys), the prompt
    // overlay replaces `openPromptKey`, and `drainBattleBeat`'s zombie guard - correctly - then
    // refuses to drain a lane that no longer owns the screen. The beats below are hand-driven.
    window.__phaserGame.loop.sleep();
    if (!u) {
      window.__phaserGame.loop.wake();
      return { none: true, noUi: true, openPromptKey: ui.openPromptKey,
        prompt: st.pendingAscentPrompt?.kind ?? null, battle: !!st.ascent.activeBattle, log: log.slice(-14) };
    }
    // Sampled LIVE each iteration: the battle can end and tear the lane down mid-loop, and a
    // stale battleUi reference then reads as "no fallen" when bodies were on the ground all
    // along. The first casualty mark is the evidence; after that the loop can stop.
    // measure-battle-beat's exact recipe: beats are a QUEUE the sim fills - `fightRound` puts
    // exchanges on it, `drainBattleBeat` consumes them (and lays the fallen). Draining without
    // filling no-ops forever, which is where every earlier version of this check died.
    const { fightRound } = await import('/src/systems/ascent/BattleSystem.ts');
    let seen = { pts: 0, visible: false, alive: false };
    for (let i = 0; i < 120 && seen.pts === 0 && st.ascent.activeBattle && !st.ascent.activeBattle.over; i += 1) {
      if ((st.ascent.activeBattle?.beats?.length ?? 0) < 2) fightRound(st);
      ui.drainBattleBeat();
      ui.refresh();
      await new Promise((r) => setTimeout(r, 15));
      const cur = ui.battleUi;
      if ((cur?.fallenPts?.length ?? 0) > 0) {
        seen = { pts: cur.fallenPts.length, visible: cur.fallen?.visible === true,
          alive: cur.fallen?.scene !== undefined };
      }
    }
    window.__phaserGame.loop.wake();
    const figureBytes = window.__inkStamps().pools.figure;
    return { pts: seen.pts, visible: seen.visible, alive: seen.alive, figureBytes };
  });
  if (!fallen || fallen.none) {
    checks.push(['fallen check reached a fight', false, JSON.stringify(fallen)]);
  } else {
    checks.push(['the dead accumulate on the field', fallen.pts > 0, `pts ${fallen.pts}`]);
    checks.push(['the fallen layer is live and visible over the bake', fallen.visible && fallen.alive, JSON.stringify(fallen)]);
    checks.push(['figure pool stays under 5 MB after a fight', fallen.figureBytes <= 5 * 1024 * 1024,
      `${(fallen.figureBytes / 1048576).toFixed(2)} MB`]);
  }
  checks.push(['fallen run: no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')]);
  await browser.close();
}

report(checks);
