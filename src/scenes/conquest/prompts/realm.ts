/**
 * The cards the world deals the realm — foreign affairs and calamity, raised on the wave and
 * season clocks rather than opened by the player: the envoy sheet and a rival's demand (the two
 * halves of diplomacy, one the player starts and one they do not), famine, the autopilot asking
 * to raise a host, and the invasion arriving (`showEmpireResponse`) and over (`showWaveResult`).
 *
 * 'Adjust' on the muster card is the one cross-file thread: it parks the plan in
 * `self.musterHandover` and resolves the prompt *before* opening the army lane, so the form is
 * never built under a live card. `lanes/frame.ts` drains that field on the way in.
 */
import Phaser from 'phaser';
import { responseCommanderName } from '../../../systems/ascent/WaveDirector';
import { envoyOptionDetail } from '../../../systems/ascent/EnvoySystem';
import { realmStanding } from '../../../systems/ascent/RivalDirector';
import { TRIBUTE_REFUSE_TICKS } from '../../../game/ascentConfig';
import { renderHeroFaceInBox } from '../../../ui/FaceRenderer';
import { INK_UI } from '../../../ui/InkUI';
import { PROMPT_FOOTER_HEIGHT } from '../constants';
import { promptFoot } from './frame';
import { iconForOption, type CardIconId } from '../../../ui/CardIcons';
import { staggerIn } from '../../../ui/animations';
import { formatResourceList, heroName, t } from '../../../i18n';
import type { AscentPrompt } from '../../../state/types';
import type { ConquestUIScene } from '../../ConquestUIScene';


/** One rival empire, and everything the realm can do about it. */
export function showEnvoy(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'envoy' }>): void {
  const kingdom = self.state.kingdoms.find((candidate) => candidate.id === prompt.kingdomId);
  // **A way back and a way out, pinned, like every other child page's.**
  //
  // This is the page the Ngoại giao list opens, so it is a child page and it gets a child page's
  // foot. Every answer used to be a card in the scroll, "say nothing" among them — so on a court
  // offering eight the only way to leave was to scroll to the bottom and find it, and there was
  // no way at all back to the list you came from. Both stand at the foot now, in the order the
  // lanes use: the way back above, the way out below.
  const leave = prompt.options.find((option) => option.id === 'ignore');
  const offers = prompt.options.filter((option) => option !== leave);
  const footHeight = leave ? PROMPT_FOOTER_HEIGHT : 0;
  const { content, body, bodyWidth, finish } = self.promptScrollBody(
    t('ascent.envoy.title', { kingdom: prompt.kingdomName }),
    t('ascent.envoy.subtitle', { relations: prompt.relations, power: prompt.power }),
    footHeight,
  );

  // Tall enough for a two-line body: the ambassador option names the hero, which wraps for
  // most names and overlapped the price line at a shorter height.
  const rowHeight = 84;
  const cards: Phaser.GameObjects.Container[] = [];
  let used = 0;
  offers.forEach((option) => {
    const price = option.cost && Object.keys(option.cost).length > 0
      ? formatResourceList(option.cost)
      : option.influenceCost
        ? t('ascent.envoy.influence', { n: option.influenceCost })
        : t('ascent.conquer.free');

    const card = self.optionCard(
      { x: 0, y: used, width: bodyWidth, height: rowHeight },
      {
        title: t(`ascent.envoy.${option.id}` as Parameters<typeof t>[0]),
        body: kingdom ? envoyOptionDetail(self.state, kingdom, option) : '',
        note: option.affordable ? price : t('ascent.response.cantAfford'),
        noteColor: option.affordable ? undefined : '#a4402c',
        accent: option.affordable ? (option.id === 'tribute' ? INK_UI.cinnabar : INK_UI.gold) : INK_UI.softBrush,
        disabled: !option.affordable,
        parent: body,
        onTap: () => self.choose(option.id),
      },
    );
    cards.push(card);
    used += ((card.getData('cardHeight') as number) ?? rowHeight) + 9;
  });
  staggerIn(self, cards);
  if (leave) {
    // Back means the list of courts, which is where this page was opened from. Saying nothing is
    // the answer either way — the difference is only where the player is left standing.
    promptFoot(self, content, {
      back: { onTap: () => { self.choose(leave.id); self.openLane('affairs'); } },
      close: { label: t('ascent.envoy.ignore'), onTap: () => self.choose(leave.id) },
    });
  }
  finish(used);
}

/**
 * Something that happened between two courts, and what we do about it.
 *
 * Built on the same scaffold as the envoy sheet because it is the same *kind* of decision seen
 * from the other side — but the body line names both courts by name wherever an event has two, so
 * the player can see who they are choosing between without having to remember the feud map.
 */
export function showWorldEvent(
  self: ConquestUIScene,
  prompt: Extract<AscentPrompt, { kind: 'world-event' }>,
): void {
  const key = (suffix: string) => `ascent.event.${prompt.eventId}.${suffix}` as Parameters<typeof t>[0];
  const { body, bodyWidth, finish } = self.promptScrollBody(
    t(key('title'), { kingdom: prompt.kingdomName, other: prompt.otherKingdomName ?? '' }),
    t(key('body'), { kingdom: prompt.kingdomName, other: prompt.otherKingdomName ?? '' }),
    0,
  );

  const rowHeight = 84;
  const cards: Phaser.GameObjects.Container[] = [];
  let used = 0;
  prompt.options.forEach((option) => {
    const price = option.cost && Object.keys(option.cost).length > 0
      ? formatResourceList(option.cost)
      : t('ascent.conquer.free');
    const card = self.optionCard(
      { x: 0, y: used, width: bodyWidth, height: rowHeight },
      {
        title: t(key(`${option.id}.label`), {
          kingdom: prompt.kingdomName, other: prompt.otherKingdomName ?? '',
        }),
        body: t(key(`${option.id}.fx`), {
          kingdom: prompt.kingdomName, other: prompt.otherKingdomName ?? '',
        }),
        note: option.affordable ? price : t('ascent.response.cantAfford'),
        noteColor: option.affordable ? undefined : '#a4402c',
        accent: option.affordable ? INK_UI.gold : INK_UI.softBrush,
        disabled: !option.affordable,
        parent: body,
        onTap: () => self.choose(option.id),
      },
    );
    cards.push(card);
    used += ((card.getData('cardHeight') as number) ?? rowHeight) + 9;
  });
  staggerIn(self, cards);
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
/**
 * The autopilot asking before it raises a host.
 *
 * The card leads with the two facts a player wants before saying yes — who, and how many — and
 * then the bill: people off the land, food and supplies into the baggage train, seasons to
 * muster. The purpose line says why the general is asking now, and where the host will go once
 * it stands. Three answers, never more: raise it, change it, not now.
 */
export function showMusterProposal(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'muster-proposal' }>): void {
  const state = self.state;
  const hero = state.heroes.find((candidate) => candidate.id === prompt.heroId);
  const land = state.lands.find((candidate) => candidate.id === prompt.landId);
  const front = prompt.frontLandId ? state.lands.find((candidate) => candidate.id === prompt.frontLandId) : undefined;
  const who = hero ? heroName(hero) : t('ascent.screen.noGeneral');
  const { body, bodyWidth, finish } = self.promptScrollBody(
    t('ascent.muster.title', { hero: who }),
    t(prompt.purpose === 'pressure' ? 'ascent.muster.whyPressure' : 'ascent.muster.whyTarget'),
    0,
  );

  let used = 0;
  // The commander and the number, as a band: a face on the left, the headcount in the largest
  // type this card prints, the doctrine and the muster ground under it.
  const bandH = 64;
  const holder = self.add.container(0, used);
  body.add(holder);
  holder.add(self.ui.panel({ x: 0, y: 0, width: bodyWidth, height: bandH }, { border: INK_UI.gold, fillAlpha: 0.9 }));
  if (hero) holder.add(renderHeroFaceInBox(self, hero, { x: 6, y: 6, width: bandH - 12, height: bandH - 12 }));
  holder.add(self.ui.label(bandH + 4, 6, `${prompt.plan.soldiers}`, 'title', { fontSize: '24px' }).setOrigin(0, 0));
  holder.add(self.ui.label(bandH + 4 + 74, 14, t('ascent.muster.men'), 'caption', {}).setOrigin(0, 0));
  holder.add(self.ui.label(bandH + 4, 38, t('ascent.muster.where', {
    doctrine: t(`comp.${prompt.plan.composition}` as Parameters<typeof t>[0]),
    land: land?.name ?? '—',
    ticks: prompt.ticks,
  }), 'caption', { wordWrap: { width: bodyWidth - bandH - 12 } }).setOrigin(0, 0));
  used += bandH + 10;

  const bill = [
    t('ascent.muster.billPeople', { n: prompt.plan.soldiers }),
    t('ascent.muster.billBaggage', { food: prompt.plan.rations, supplies: prompt.plan.provisions + prompt.suppliesCost }),
    front
      ? t('ascent.muster.thenFront', { land: front.name })
      : t('ascent.muster.thenHold', { land: land?.name ?? '—' }),
  ].join('\n');
  const note = self.ui.label(2, used, bill, 'caption', { wordWrap: { width: bodyWidth - 4 }, lineSpacing: 3 }).setOrigin(0, 0);
  body.add(note);
  used += note.height + 12;

  const rowHeight = 58;
  const answers: Array<{ id: string; accent: number; icon?: CardIconId }> = [
    { id: 'accept', accent: INK_UI.gold },
    { id: 'adjust', accent: INK_UI.jade },
    { id: 'decline', accent: INK_UI.softBrush },
  ];
  for (const answer of answers) {
    const card = self.optionCard(
      { x: 0, y: used, width: bodyWidth, height: rowHeight },
      {
        title: t(`ascent.muster.${answer.id}` as Parameters<typeof t>[0]),
        body: t(`ascent.muster.${answer.id}.d` as Parameters<typeof t>[0]),
        accent: answer.accent,
        parent: body,
        onTap: () => {
          if (answer.id === 'adjust') {
            // The plan goes to the form, and the form opens once the card has closed — the
            // choice resolves the prompt first, so the lane is not opened under a live card.
            self.musterHandover = { ...prompt.plan, orders: { ...prompt.plan.orders } };
            self.choose('adjust');
            self.openLane('army');
            return;
          }
          self.choose(answer.id);
        },
      },
    );
    used += ((card.getData('cardHeight') as number) ?? rowHeight) + 10;
  }
  finish(used);
}

export function showFamine(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'famine' }>): void {
  const { body, bodyWidth, finish } = self.promptScrollBody(
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

    const card = self.optionCard(
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
        onTap: () => { if (option.affordable) self.choose(option.id); },
      },
    );
    used += ((card.getData('cardHeight') as number) ?? rowHeight) + 10;
  });
  finish(used);
}

export function showRivalDemand(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'rival-demand' }>): void {
  const kingdom = self.state.kingdoms.find((candidate) => candidate.id === prompt.kingdomId);
  const standing = kingdom ? realmStanding(self.state, kingdom) : 'even';

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
  const { body: scrollBody, bodyWidth, finish } = self.promptScrollBody(
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

    const card = self.optionCard(
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
        onTap: () => self.choose(option.id),
      },
    );
    cards.push(card);
    used += ((card.getData('cardHeight') as number) ?? rowHeight) + 10;
  });
  staggerIn(self, cards);
  finish(used);
}

export function showEmpireResponse(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'empire-response' }>): void {
  // Aliased: `body` is the per-option description string built inside the loop below.
  const { body: scrollBody, bodyWidth, finish } = self.promptScrollBody(
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
    const commander = responseCommanderName(self.state, option.heroId);
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

    const card = self.optionCard(
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
        onTap: () => self.choose(option.id),
      },
    );
    cards.push(card);
    used += ((card.getData('cardHeight') as number) ?? rowHeight) + 10;
  });
  staggerIn(self, cards);
  finish(used);
}

export function showWaveResult(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'wave-result' }>): void {
  const content = self.promptFrame(
    prompt.survived ? t('ascent.wave.bossTitle', { wave: prompt.wave }) : t('ascent.wave.bossTitleLost'),
    prompt.lines.filter(Boolean).join('\n'),
  );

  self.modalLayer.add(self.ui.button(
    { x: content.x, y: content.y + 40, width: content.width, height: 46 },
    t('ascent.wave.continue'),
    () => self.choose('ok'),
    { variant: 'primary', fontSize: '14px' },
  ));
}
