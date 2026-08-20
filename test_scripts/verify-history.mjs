// The History page: reachable from the menu, four lists that actually fill, a list you can drag
// without picking a row, and every line of it written in both languages.
//
// The last check is the one that cannot be seen in a screenshot. History prose lives outside the
// validated catalogues on purpose (a missing line falls back to English rather than crashing the
// game at import), so nothing else in the project would ever notice a Vietnamese paragraph that
// was never written.
import { chromium } from 'playwright';

const BASE = process.env.DEV_URL ?? process.env.PLAYTEST_URL ?? 'http://localhost:5173';
const TABS = ['dynasties', 'figures', 'stories', 'terms'];
// Floors, not targets: eleven ages, the fifty-one authored real champions with their era headings,
// the whole story catalogue, and the glossary.
const MIN_OBJECTS = { dynasties: 11, figures: 100, stories: 40, terms: 20 };

const browser = await chromium.launch();
let bad = 0;
const fail = (message) => { bad += 1; console.log(`FAIL  ${message}`); };

for (const [lang, height] of [['en', 844], ['vi', 844], ['vi', 620]]) {
  const tag = `${lang} h=${height}`;
  const page = await browser.newPage({ viewport: { width: 390, height }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Language is read from localStorage at boot, so it has to be set before navigation.
  await page.addInitScript((l) => localStorage.setItem('mandate:language:v1', l), lang);
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Reached by pressing the real button, not by starting the scene: a History page nothing can
  // navigate to is the failure this check exists for. Design units are CSS pixels here — the
  // render scale inflates the game size and the camera zoom takes it straight back out.
  const button = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('MenuScene');
    for (const child of scene.children.list) {
      const label = child.list?.find?.((k) => k.type === 'Text');
      if (label && /Sử thật|Real History/.test(label.text)) {
        const m = child.getWorldTransformMatrix();
        return { x: m.tx + 141, y: m.ty + 16 };
      }
    }
    return null;
  });
  if (!button) {
    fail(`${tag}  no History button on the front page`);
    await page.close();
    continue;
  }
  await page.mouse.click(button.x, button.y);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('HistoryScene'), null, { timeout: 8000 })
    .catch(() => {});
  if (!(await page.evaluate(() => window.__phaserGame.scene.isActive('HistoryScene')))) {
    fail(`${tag}  the History button did not open the page`);
    await page.close();
    continue;
  }
  await page.waitForTimeout(700);

  const tabX = [56, 148, 240, 332];
  for (const [index, tab] of TABS.entries()) {
    await page.mouse.click(tabX[index], 84);
    await page.waitForTimeout(450);
    const count = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('HistoryScene');
      return scene.scroll ? scene.scroll.content.list.length : -1;
    });
    if (count < MIN_OBJECTS[tab]) {
      fail(`${tag}  ${tab}: ${count} rows, expected at least ${MIN_OBJECTS[tab]}`);
    } else {
      console.log(`PASS  ${tag}  ${tab}: ${count} rows`);
    }

    // Every tab expands, and every tab animates the row it expanded. Both were wired per-tab, so
    // both can be forgotten per-tab.
    await page.mouse.click(195, 200);
    await page.waitForTimeout(350);
    const opened = await page.evaluate(() => {
      const scene = window.__phaserGame.scene.getScene('HistoryScene');
      return {
        expanded: scene.expanded ?? null,
        revealed: scene.scroll.content.list.some((o) => o.getData?.('revealed') === true),
      };
    });
    if (!opened.expanded) fail(`${tag}  ${tab}: tapping the first row did not open it`);
    else if (!opened.revealed) fail(`${tag}  ${tab}: the opened row did not animate in`);
    // Close it again, so the next tab starts from the same place this one did.
    await page.mouse.click(195, 200);
    await page.waitForTimeout(250);
  }

  // Back to the first tab, then the gesture pair: a drag must scroll and must NOT open a row; a
  // tap must open one. Getting this backwards is the classic scrolling-list defect.
  await page.mouse.click(tabX[0], 84);
  await page.waitForTimeout(400);
  await page.mouse.move(195, Math.min(500, height - 120));
  await page.mouse.down();
  await page.mouse.move(195, Math.min(500, height - 120) - 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const afterDrag = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('HistoryScene');
    return { offset: -scene.scroll.content.y, expanded: scene.expanded ?? null };
  });
  if (afterDrag.offset <= 0) fail(`${tag}  dragging the list did not scroll it`);
  if (afterDrag.expanded) fail(`${tag}  dragging the list opened "${afterDrag.expanded}"`);

  await page.mouse.click(195, 300);
  await page.waitForTimeout(400);
  const afterTap = await page.evaluate(() => {
    const scene = window.__phaserGame.scene.getScene('HistoryScene');
    // The opened card carries a tag set by the reveal tween's setup, so this asserts the animation
    // ran without racing a 170ms tween.
    const revealed = scene.scroll.content.list.some((o) => o.getData?.('revealed') === true);
    return { offset: -scene.scroll.content.y, expanded: scene.expanded ?? null, revealed };
  });
  if (!afterTap.expanded) fail(`${tag}  tapping a row did not open it`);
  if (!afterTap.revealed) fail(`${tag}  the opened row did not animate in`);
  // Opening a row rebuilds the list; a rebuild that forgets where the reader was is a bug you only
  // notice forty rows down.
  if (afterTap.offset === 0 && afterDrag.offset > 0) fail(`${tag}  opening a row threw the list back to the top`);
  if (!afterDrag.expanded && afterTap.expanded) console.log(`PASS  ${tag}  drag scrolls, tap opens, position kept`);

  // And back out again.
  await page.mouse.click(44, 24);
  await page.waitForFunction(() => window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 8000 })
    .catch(() => {});
  if (!(await page.evaluate(() => window.__phaserGame.scene.isActive('MenuScene')))) {
    fail(`${tag}  Back did not return to the menu`);
  }

  if (errors.length) fail(`${tag}  console: ${errors.slice(0, 2).join(' | ')}`);
  await page.close();
}

// Coverage: every key the page asks for has to resolve in Vietnamese as well as English.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => fail(`coverage page error: ${e.message}`));
await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
const missing = await page.evaluate(async () => {
  const history = await import('/src/i18n/history/index.ts');
  const data = await import('/src/data/history/index.ts');
  const story = await import('/src/i18n/story/index.ts');
  const wanted = [];
  for (const era of data.HISTORY_ERAS) {
    wanted.push(`eras.${era.id}.title`, `eras.${era.id}.body`, `eras.${era.id}.inGame`);
  }
  for (const term of data.GLOSSARY_TERMS) {
    wanted.push(`terms.${term}.title`, `terms.${term}.body`);
  }
  // Story notes are allowed to be unwritten — the page says so in words. What is NOT allowed is a
  // note written in one language only.
  for (const id of story.storyCatalogIds) {
    if (history.hasHistoryText(`stories.${id}.happened`, 'en')) {
      wanted.push(`stories.${id}.happened`, `stories.${id}.inGame`);
    }
  }
  return {
    en: wanted.filter((key) => !history.hasHistoryText(key, 'en')),
    vi: wanted.filter((key) => !history.hasHistoryText(key, 'vi')),
    total: wanted.length,
  };
});
if (missing.en.length) fail(`English prose missing ${missing.en.length}: ${missing.en.slice(0, 4).join(', ')}`);
if (missing.vi.length) fail(`Vietnamese prose missing ${missing.vi.length}: ${missing.vi.slice(0, 4).join(', ')}`);
if (!missing.en.length && !missing.vi.length) console.log(`PASS  all ${missing.total} history keys resolve in both languages`);
await page.close();

await browser.close();
console.log(bad === 0 ? 'HISTORY PAGE OK' : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
