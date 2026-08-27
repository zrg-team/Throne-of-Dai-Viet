// The coffee link is store-forbidden on iOS and store-inappropriate on Android — the Play build is
// sold, and a paid game does not also pass the hat. Both stores therefore lose it, and the web and
// desktop builds keep it. The gate is `allowsDonationLinks()` and it now keys off the *cabinet*
// rather than the OS, which is the kind of change that silently inverts if the predicate is wrong.
//
// The "help build the game" half must survive everywhere: it is a repository link, neither a tip
// nor a purchase, and hiding it would cost the project its only visible call for contributors.
import { chromium } from 'playwright';
const BASE = process.env.DEV_URL ?? 'http://127.0.0.1:5179';

// `menu.support.coffee` and `menu.support.improve*`, both catalogs.
const COFFEE = { en: 'Buy me a coffee', vi: 'Mời mình ly cà phê' };
const IMPROVE = { en: ['help build the game', 'Help build the game'], vi: ['chung tay làm game', 'Chung tay làm game'] };

// A shell declares itself; the game never sniffs. `undefined` is the web, which is the absence of
// a shell rather than a kind of one.
const CABINETS = [
  ['web', undefined, true],
  ['mobile/android', { kind: 'mobile', os: 'android' }, false],
  ['mobile/ios', { kind: 'mobile', os: 'ios' }, false],
  // A shell that forgot to say which OS it is still counts as a store cabinet.
  ['mobile/unknown-os', { kind: 'mobile' }, false],
  ['desktop/tauri', { kind: 'desktop', os: 'windows' }, true],
];

const browser = await chromium.launch();
let bad = 0;

for (const [label, shell, wantCoffee] of CABINETS) {
  for (const lang of ['en', 'vi']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    // Before the bundle's first line: `main.ts` asks the shell questions at module scope, so a
    // descriptor posted after load arrives too late to change anything.
    await page.addInitScript(([l, s]) => {
      localStorage.setItem('mandate:language:v1', l);
      if (s) window.__shell = Object.assign(s, { ready() {} });
    }, [lang, shell]);

    await page.goto(`${BASE}/?capture=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__phaserGame?.scene.isActive('MenuScene'), null, { timeout: 30000 });
    await page.waitForTimeout(900);

    // Recursive, because `renderSupportRow` builds a Container and the links are inside it — a
    // flat scan of `children.list` finds neither half of the sentence and reports both as absent,
    // which looks exactly like the gate being wrong in both directions at once.
    const texts = await page.evaluate(() => {
      const out = [];
      const walk = (list) => {
        for (const c of list) {
          if (c.type === 'Text' && c.text?.trim()) out.push(c.text);
          if (c.list) walk(c.list);
        }
      };
      walk(window.__phaserGame.scene.getScene('MenuScene').children.list);
      return out;
    });

    const hasCoffee = texts.some((t) => t.includes(COFFEE[lang]));
    const hasImprove = texts.some((t) => IMPROVE[lang].some((s) => t.includes(s)));

    const ok = hasCoffee === wantCoffee && hasImprove && errors.length === 0;
    if (!ok) bad += 1;
    const why = [
      hasCoffee === wantCoffee ? '' : `coffee ${hasCoffee ? 'shown' : 'hidden'}, wanted ${wantCoffee ? 'shown' : 'hidden'}`,
      hasImprove ? '' : 'improve link missing',
      errors[0] ?? '',
    ].filter(Boolean).join(' · ');
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(18)} ${lang}  coffee=${hasCoffee ? 'yes' : 'no '} improve=${hasImprove ? 'yes' : 'no '}  ${why}`);
    await page.close();
  }
}

await browser.close();
console.log(bad === 0 ? 'DONATION GATE OK — STORES HIDE THE COFFEE, EVERYONE KEEPS THE REPO LINK' : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
