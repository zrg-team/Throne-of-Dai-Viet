/**
 * Is any soldier's ink clipped by his stamp box?
 *
 * `FIGURE_REACH` claims how far a figure's drawing extends around his feet, and the stamps trust
 * it: ink past the box is silently cut off — a spear without its tip, a crown without its crest —
 * and nobody notices until a screenshot does. So this walks EVERY (theme × tier × arm) at the
 * field bucket, rasterises each stamp, and fails if ink lands within one pixel of a texture edge
 * (touching the edge means the box is too small; the pad exists so real ink never does).
 *
 * Usage: node test_scripts/diag/diag-figure-reach.mjs
 */
import { boot, report } from '../perf/_boot.mjs';

const { browser, page, errors } = await boot({ dpr: 1, quality: 'low' });
await page.waitForFunction(() => window.__phaserGame?.scene?.isActive('MenuScene'), null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const { figureStamp, FIGURE_VARIANTS } = await import('/src/ui/ink/figureStamps.ts');
  const { FIGURE_THEMES } = await import('/src/ui/ink/devices.ts');
  const game = window.__phaserGame;
  const scene = game.scene.getScene('MenuScene');

  const themes = Object.keys(FIGURE_THEMES);
  const tiers = [0, 1, 2];
  const arms = [undefined, 'spear', 'sword', 'skirmish', 'bow', 'mounted'];
  const clipped = [];
  let checked = 0;

  for (const theme of themes) {
    for (const tier of tiers) {
      for (const arm of arms) {
        for (let variant = 0; variant < FIGURE_VARIANTS; variant += 1) {
          const st = figureStamp(scene, { theme, tier, arm, colour: 0x2b2b23, accent: 0x8a2b1d, variant, bucket: 'f' });
          checked += 1;
          const texture = scene.textures.get(st.texture);
          const source = texture.getSourceImage();
          // Canvas-backed stamps expose their source canvas directly; read its edge rows/cols.
          const probe = document.createElement('canvas');
          probe.width = source.width; probe.height = source.height;
          const ctx = probe.getContext('2d');
          ctx.drawImage(source, 0, 0);
          const data = ctx.getImageData(0, 0, source.width, source.height).data;
          const alphaAt = (px, py) => data[(py * source.width + px) * 4 + 3];
          let hit = '';
          for (let px = 0; px < source.width && !hit; px += 1) {
            if (alphaAt(px, 0) > 8 || alphaAt(px, 1) > 8) hit = 'top';
            else if (alphaAt(px, source.height - 1) > 8 || alphaAt(px, source.height - 2) > 8) hit = 'bottom';
          }
          for (let py = 0; py < source.height && !hit; py += 1) {
            if (alphaAt(0, py) > 8 || alphaAt(1, py) > 8) hit = 'left';
            else if (alphaAt(source.width - 1, py) > 8 || alphaAt(source.width - 2, py) > 8) hit = 'right';
          }
          if (hit) clipped.push(`${theme}/${tier}/${arm ?? 'x'}/v${variant}: ${hit}`);
        }
      }
    }
  }
  return { checked, clipped: clipped.slice(0, 12), clippedTotal: clipped.length };
});

await browser.close();

console.log(`${result.checked} stamps rasterised`);
report([
  ['every kind of soldier was stamped', result.checked >= 12 * 3 * 6 * 3, `${result.checked}`],
  ['no ink touches a stamp border', result.clippedTotal === 0,
    `${result.clippedTotal} clipped: ${result.clipped.join(', ')}`],
  ['no console errors', errors.length === 0, errors.slice(0, 3).join(' | ')],
]);
