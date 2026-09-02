/**
 * The Conquer drill-down, three sheets deep — the provinces in reach, the ways into the one you
 * picked, then who carries the chosen way out — plus the power draft, which sits here because it
 * is built the same way and for no other reason.
 *
 * Each sheet pins its exit under a scrolling list at `GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8`.
 * The conquest three are one back-stack: `showMethodActorPicker` re-enters `showConquerMethod`
 * through `replaceLanePage` and must carry the same `notice` back, or the refusal the player was
 * halfway through reading vanishes on the return trip. `methodPriceTag` is quoted by both the
 * method card and the picker's confirmation, so a way in cannot be priced two ways on two sheets.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, PLAYER_KINGDOM_ID } from '../../../game/constants';
import { powerCardView, skipRefundAmount } from '../../../systems/ascent/PowerDraftSystem';
import { buildAllConquestTargets, methodActorLine, methodHasActor }
  from '../../../systems/ascent/ConquestSystem';
import { buildHeroPickerRows, buildHostPickerRows } from '../../../ui/heroPickerRows';
import { CardFan } from '../../../ui/ascent/CardFan';
import { UI_FONT } from '../../../ui/fonts';
import { INK_UI, type UIBounds } from '../../../ui/InkUI';
import { iconForOption } from '../../../ui/CardIcons';
import { staggerIn } from '../../../ui/animations';
import { formatResourceList, heroName, t } from '../../../i18n';
import type { AscentPrompt, ConquestMethodOption, ConquestTarget } from '../../../state/types';
import { PROMPT_FOOTER_HEIGHT, RARITY_COLOR } from '../constants';
import { promptFoot } from './frame';
import type { ConquestUIScene } from '../../ConquestUIScene';


// ── Prompts ───────────────────────────────────────────────────────────────

/**
 * The Power Draft as a fanned hand — cards get a **body**.
 *
 * The old sheet was a scrolling list of `optionCard` rows: correct, and indistinguishable from
 * every administrative prompt in the mode. This is the run's central reward moment, so the
 * cards are now real card faces (baked once per `(id, level)` — see `cardFace.ts`, and the perf
 * ledger's warning about live Graphics), held across the bottom third the way a hand is held:
 * tap to raise, tap the raised card to take. The reroll and skip stay in the footer, and the
 * prompt bus and resolver are untouched — a reroll re-renders through `promptSignature` exactly
 * as before.
 *
 * Everything the row used to print — description, stack, the power preview, the evolution
 * call-out — moves to a readout above the fan describing the *raised* card, which is also what
 * makes four faces legible at 390 wide: the fan carries identity, the readout carries numbers.
 */
export function showPowerDraft(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'power-draft' }>): void {
  const content = self.promptFrame(
    t('ascent.draft.title', { level: prompt.level }),
    t('ascent.draft.subtitle'),
  );

  const views = prompt.cards
    .map((cardId) => powerCardView(self.state, cardId))
    .filter((view): view is NonNullable<typeof view> => Boolean(view));
  if (views.length === 0) return;

  // The bottom third holds the hand; the readout takes what is left above it. Both are measured
  // back from the pinned footer, so the sheet holds together at the 620 clamp.
  const footerY = GAME_HEIGHT - PROMPT_FOOTER_HEIGHT + 8;
  const HINT = 16;
  const fanHeight = Phaser.Math.Clamp(Math.round(content.height * 0.48), 180, 232);
  const fanTop = footerY - 10 - fanHeight;
  // Capped: on a tall sheet the leftover space above the fan runs past 400 units, and a readout
  // stretched to fill it is a page of blank paper with four lines in its corner.
  const infoHeight = Math.min(fanTop - content.y - HINT - 10, 214);

  const info = self.add.container(content.x, content.y);
  self.modalLayer.add(info);

  const describe = (index: number): void => {
    info.removeAll(true);
    const view = views[index];
    info.add(self.ui.panel({ x: 0, y: 0, width: content.width, height: infoHeight },
      { border: view.evolutionReady ? INK_UI.gold : RARITY_COLOR[view.rarity], borderWidth: 1.4, fillAlpha: 0.55 }));
    const rail = self.add.graphics();
    rail.fillStyle(RARITY_COLOR[view.rarity], 1);
    rail.fillRect(1.5, 6, 4, infoHeight - 12);
    info.add(rail);

    let cursor = 10;
    const title = self.ui.label(14, cursor, `${view.name}  ·  ${view.stackLabel}`, 'label',
      { fontSize: '13px', wordWrap: { width: content.width - 28 } });
    info.add(title);
    cursor += title.height + 4;
    info.add(self.ui.label(14, cursor,
      `${t(`ascent.rarity.${view.rarity}` as Parameters<typeof t>[0])}  ${view.stackCount}`,
      'caption', { fontSize: '10px' }));
    cursor += 18;
    const body = self.add.text(14, cursor, view.description, {
      color: '#4a3a28', fontFamily: 'Georgia, serif', fontSize: '11.5px',
      wordWrap: { width: content.width - 28 }, lineSpacing: 2,
    });
    info.add(body);
    cursor += body.height + 6;

    // The evolution call-out outranks the power preview: completing a pair is the headline
    // reward, and a bare percentage would undersell it.
    const note = view.evolutionReady
      ? t('ascent.draft.evoReady')
      : view.powerGainPct > 0
        ? t('ascent.draft.powerPreview', { pct: view.powerGainPct })
        : undefined;
    if (note && cursor < infoHeight - 14) {
      info.add(self.add.text(14, cursor, note, {
        color: '#8a5f1c', fontFamily: UI_FONT, fontSize: '11px', fontStyle: '700',
        wordWrap: { width: content.width - 28 },
      }));
      cursor += 16;
    }
    // The forge remembers: a learned recipe names the partner from run one.
    if (view.recipeHint && cursor < infoHeight - 14) {
      info.add(self.add.text(14, cursor, view.recipeHint, {
        color: '#4a6a55', fontFamily: UI_FONT, fontSize: '10px',
        wordWrap: { width: content.width - 28 },
      }));
    }
  };

  // The evolution-ready card sits raised by default — the fan opens on the headline.
  const initial = Math.max(0, views.findIndex((view) => view.evolutionReady));
  const fan = new CardFan(self, {
    x: content.x, y: fanTop, width: content.width, height: fanHeight,
    cards: views.map((view) => ({ id: view.id })),
    initial,
    onRaise: describe,
    onTake: (index) => self.choose(views[index].id),
  });
  self.modalLayer.add(fan.view);

  // The gesture, said once, between the readout and the hand.
  self.modalLayer.add(self.add.text(content.x + content.width / 2, fanTop - HINT + 2,
    t('ascent.draft.fanHint'), {
      color: '#6f6250', fontFamily: UI_FONT, fontSize: '10px', align: 'center',
    }).setOrigin(0.5, 0));
  const affordable = self.state.resources.gold >= prompt.rerollCost;
  self.modalLayer.add(self.ui.button(
    { x: content.x, y: footerY, width: content.width / 2 - 6, height: 40 },
    affordable
      ? t('ascent.draft.reroll', { cost: prompt.rerollCost })
      : t('ascent.draft.rerollPoor', { cost: prompt.rerollCost }),
    () => self.events.emit('ui:ascent-reroll'),
    { variant: affordable ? 'secondary' : 'disabled', fontSize: '12px' },
  ));
  self.modalLayer.add(self.ui.button(
    { x: content.x + content.width / 2 + 6, y: footerY, width: content.width / 2 - 6, height: 40 },
    t('ascent.draft.skip', { xp: skipRefundAmount(self.state) }),
    () => self.choose('skip'),
    { variant: 'ghost', fontSize: '12px' },
  ));
}

/** One province row, shared by the Conquer prompt and the Conquer lane browser. */
function provinceCard(self: ConquestUIScene,
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

  return self.optionCard(bounds, {
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

export function showConquerTarget(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'conquer-target' }>): void {
  // `frontLandId` is cleared the moment a province falls, so it cannot distinguish these
  // cases — keying off how much ground the realm holds does.
  const held = self.state.lands.filter((land) => land.ownerId === PLAYER_KINGDOM_ID).length;
  const { content, body, bodyWidth, finish } = self.promptScrollBody(
    t('ascent.conquer.title'),
    held <= 1 ? t('ascent.conquer.subtitleFirst') : t('ascent.conquer.subtitle', { held }),
    PROMPT_FOOTER_HEIGHT,
  );

  const rowHeight = 92;
  const cards: Phaser.GameObjects.Container[] = [];
  prompt.targets.forEach((target, index) => {
    cards.push(provinceCard(self, 
      { x: 0, y: index * (rowHeight + 10), width: bodyWidth, height: rowHeight },
      target,
      () => self.choose(target.landId),
      body,
    ));
  });
  staggerIn(self, cards);
  finish(prompt.targets.length * (rowHeight + 10));

  promptFoot(self, content, {
    close: { label: t('ascent.march.hold'), onTap: () => self.choose('hold') },
  });
}

/**
 * The price tag on a method card, on one line: cost, duration, resulting loyalty, and the
 * odds. Kept to a single line deliberately — it sits in the card's fixed-height note slot,
 * and a second line would be clipped by the card edge.
 */
function methodPriceTag(option: ConquestMethodOption): string {
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
export function showConquerMethod(self: ConquestUIScene, target: ConquestTarget, notice?: string): void {
  const { content, body, bodyWidth, finish } = self.promptScrollBody(
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
    const banner = self.ui.card(
      { x: 0, y: 0, width: bodyWidth, height: 54 },
      { title: t('ascent.conquer.refused'), subtitle: notice, border: INK_UI.cinnabar },
    );
    body.add(banner);
    used += ((banner.getData('cardHeight') as number) ?? 54) + 12;
  }

  target.methods.forEach((option) => {
    const blocked = Boolean(option.blockedReason);
    const actorLine = !blocked && methodHasActor(option.method) ? methodActorLine(self.state, option) : undefined;

    const card = self.optionCard(
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
        note: option.blockedReason ?? methodPriceTag(option),
        noteColor: blocked ? '#6f6250' : undefined,
        accent: blocked ? INK_UI.softBrush : option.chance >= 60 ? INK_UI.jade : INK_UI.gold,
        disabled: blocked,
        parent: body,
        // A method with an actor opens the picker over the sheet: the player names the envoy or
        // the host, confirms, and the choice carries the actor's id. Bribe and settle commit nobody.
        onTap: () => (actorLine ? showMethodActorPicker(self, target, option, notice) : self.choose(option.method)),
      },
    );
    cards.push(card);
    used += ((card.getData('cardHeight') as number) ?? rowHeight) + 9;
  });
  staggerIn(self, cards);
  finish(used);

  promptFoot(self, content, {
    back: {
      label: t('ascent.conquer.back'),
      onTap: () => {
        // Genuinely back to the list, rebuilt against the world as it stands. The button was
        // labelled "choose another province" and did not do that: it dismissed the whole sheet.
        self.state.pendingAscentPrompt = {
          kind: 'conquer-target',
          targets: buildAllConquestTargets(self.state),
        };
        self.refresh();
      },
    },
    close: { label: t('ascent.lane.close'), onTap: () => self.choose('back') },
  });
}

/** Who carries a method out: an envoy for diplomacy, a host for the military methods. */
export function showMethodActorPicker(self: ConquestUIScene, target: ConquestTarget, option: ConquestMethodOption, notice?: string): void {
  const state = self.state;
  const back = () => self.replaceLanePage(() => showConquerMethod(self, target, notice));
  const role = t(`ascent.pick.role.${option.method === 'diplomacy' ? 'envoy' : option.method}` as Parameters<typeof t>[0], { land: target.landName });
  if (option.method === 'diplomacy') {
    self.showHeroPicker({
      title: t('ascent.pick.title.envoy', { land: target.landName }),
      rows: buildHeroPickerRows(state, { kind: 'envoy', landId: target.landId }),
      confirm: (row) => ({
        title: t('ascent.pick.confirmTitle', { hero: heroName(row.hero), role }),
        lines: [row.effectLine, methodPriceTag(option)],
      }),
      onPick: (heroId) => self.choose(`${option.method}:${heroId}`),
      onBack: back,
    });
    return;
  }
  const kind = option.method === 'intimidation' ? 'intimidation' : option.method === 'occupy' ? 'occupy' : 'siege';
  self.showHostPicker({
    title: t('ascent.pick.title.host'),
    rows: buildHostPickerRows(state, { kind, landId: target.landId }),
    confirm: (row) => ({
      title: t('ascent.pick.confirmHost', { army: row.army.name, role }),
      lines: [
        row.chance !== undefined ? t('ascent.pick.hostOdds', { pct: row.chance }) : '',
        kind === 'intimidation' ? '' : t('ascent.pick.willAttack', { land: target.landName }),
      ],
    }),
    onPick: (armyId, force) => self.choose(`${option.method}:${armyId}${force ? ':force' : ''}`),
    onBack: back,
  });
}
