/**
 * The five pick-a-target pages a host's sheet opens: who commands it, where to march, what to
 * storm, whom to keep station with, whom to hunt.
 *
 * Each is a list and a single tap that emits one `ui:ascent-army-orders` — or, for the commander,
 * one `ui:ascent-assign` — and then leaves. None of them holds state, and every one is reached
 * only from `showArmyDetail` in `army.ts`, which is also where the commander pick returns to.
 *
 * Every page here must clear `activeScrollAreas` and the modal layer before calling `laneList`,
 * which only appends: two do it through `replaceLanePage` and two by hand.
 */
import { PLAYER_KINGDOM_ID } from '../../../game/constants';
import { buildAllConquestTargets } from '../../../systems/ascent/ConquestSystem';
import { findLandPath } from '../../../systems/WarSystem';
import { hostOrderLabel } from '../../../systems/ascent/armyOrders';
import { hostOddsAgainst } from '../../../systems/ascent/StandingOrders';
import { buildHeroPickerRows } from '../../../ui/heroPickerRows';
import { MARCH_MIN_WIN_CHANCE } from '../../../game/ascentConfig';
import { INK_UI } from '../../../ui/InkUI';
import { heroName, t } from '../../../i18n';
import type { Land } from '../../../state/types';
import { armyPower } from '../../../systems/WarSystem';
import { showArmyDetail, showArmyScreen } from './army';
import { hostSize, visibleHostileHosts } from '../constants';
import { clearLanePage } from '../layers';
import type { ConquestUIScene } from '../../ConquestUIScene';


/** Who commands a standing host. */
export function showCommanderPicker(self: ConquestUIScene, armyId: string): void {
  const state = self.state;
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (!army) return;
  const back = () => self.showArmyDetail(armyId);
  self.showHeroPicker({
    title: t('ascent.pick.title.commander', { army: army.name }),
    rows: buildHeroPickerRows(state, { kind: 'commander', armyId }),
    confirm: (row) => ({
      title: t('ascent.pick.confirmTitle', { hero: heroName(row.hero), role: t('ascent.pick.role.commander', { army: army.name }) }),
      lines: [row.effectLine],
    }),
    onPick: (heroId) => {
      self.events.emit('ui:ascent-assign', { heroId, optionId: `general:${armyId}` });
      back();
    },
    onBack: back,
  });
}

/** Owned provinces this host can march to, with how far and what is threatening each. */
export function showMarchTargets(self: ConquestUIScene, armyId: string): void {
  const state = self.state;
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (!army) return;

  clearLanePage(self);

  const { addRow, finish } = self.laneList(t('ascent.army.marchTo'), t('ascent.army.marchToBody'),
    { back: () => showArmyDetail(self, armyId) },
  );

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
        self.events.emit('ui:ascent-army-orders', { armyId, orders: { kind: 'defend', landId: land.id } });
        self.closeLane();
      },
    );
  }

  finish();
}

/** Provinces on the border this host could be sent to storm, with the odds it would carry. */
export function showAttackTargets(self: ConquestUIScene, armyId: string): void {
  const state = self.state;
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (!army) return;
  self.replaceLanePage(() => {
    const { addRow, finish } = self.laneList(t('ascent.orders.attackPick'), t('ascent.orders.targetHint'),
    { back: () => showArmyDetail(self, armyId) },
  );
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
          self.events.emit('ui:ascent-army-orders', {
            armyId,
            orders: { kind: 'attack', landId: target.landId, force: thin },
          });
          self.closeLane();
        },
      );
    }
    finish();
  });
}

/** Other hosts of ours this one could keep station with. */
export function showFollowTargets(self: ConquestUIScene, armyId: string): void {
  const state = self.state;
  self.replaceLanePage(() => {
    const { addRow, finish } = self.laneList(t('ascent.orders.followPick'), t('ascent.orders.followHint'),
    { back: () => showArmyDetail(self, armyId) },
  );
    const others = state.armies.filter(
      (candidate) => candidate.kingdomId === PLAYER_KINGDOM_ID && !candidate.isLevy && candidate.id !== armyId,
    );
    for (const other of others) {
      const at = state.lands.find((candidate) => candidate.id === other.landId);
      const men = hostSize(other);
      addRow(
        {
          title: other.name,
          subtitle: t('ascent.orders.followRow', { men, land: at?.name ?? '—', order: hostOrderLabel(state, other) }),
          border: INK_UI.jade,
        },
        () => {
          self.events.emit('ui:ascent-army-orders', { armyId, orders: { kind: 'follow', armyId: other.id } });
          self.closeLane();
        },
      );
    }
    finish();
  });
}

/** Enemy hosts in sight, and the order to go after one. */
/**
 * The hunt, asked the other way round: here is the enemy host — who goes after it?
 *
 * `showHuntTargets` starts from one of ours and lists the quarry. That is the right question when
 * you are already reading a host's orders, and the wrong one when you are reading the war: the
 * invaders on the army screen were rows you could only look at, so seeing a host marching on a
 * province told you nothing you could act on without first guessing which of your own hosts to
 * open. Same order underneath — `hunt`, at the same event — asked from the end the player is
 * standing at.
 */
export function showHunters(self: ConquestUIScene, quarryId: string): void {
  const state = self.state;
  clearLanePage(self);

  const quarry = state.armies.find((candidate) => candidate.id === quarryId);
  const at = state.lands.find((candidate) => candidate.id === quarry?.landId);
  const ours = state.armies.filter((army) => army.kingdomId === PLAYER_KINGDOM_ID
    && !army.isLevy && !army.patron);

  const { addRow, addNote, finish } = self.laneList(
    t('ascent.army.hunters'),
    quarry
      ? t('ascent.army.huntRow', { size: hostSize(quarry), land: at?.name ?? '—' })
      : '',
    { back: () => self.replaceLanePage(() => showArmyScreen(self)) },
  );

  if (!quarry || ours.length === 0) {
    addNote(t('ascent.army.huntNobody'));
    finish();
    return;
  }

  for (const army of ours) {
    const standing = state.lands.find((candidate) => candidate.id === army.landId);
    // A host mid-refit takes no orders at all, and one already chasing this quarry has nothing
    // to be told. Both stay on the list, greyed, so the page answers "why not" without a guess.
    const already = army.orders?.kind === 'hunt' && army.orders.armyId === quarryId;
    const busy = Boolean(army.refit);
    addRow(
      {
        title: `${army.name}  ·  ${hostSize(army)}`,
        subtitle: busy
          ? t('ascent.army.refitBusy')
          : already
            ? t('ascent.army.huntAlready')
            : t('ascent.army.hunterRow', {
              land: standing?.name ?? '—',
              power: Math.round(armyPower(state, army)),
            }),
        border: busy || already ? INK_UI.softBrush : INK_UI.gold,
        muted: busy || already,
        portrait: state.heroes.find((hero) => hero.id === army.generalHeroId),
      },
      busy || already ? undefined : () => {
        self.events.emit('ui:ascent-army-orders', {
          armyId: army.id,
          orders: { kind: 'hunt', armyId: quarryId },
        });
        self.replaceLanePage(() => showArmyScreen(self));
      },
    );
  }

  finish();
}

export function showHuntTargets(self: ConquestUIScene, armyId: string): void {
  const state = self.state;
  clearLanePage(self);

  const { addRow, finish } = self.laneList(t('ascent.army.hunt'), t('ascent.army.huntBody', {
    n: visibleHostileHosts(state).length,
  }),
    { back: () => showArmyDetail(self, armyId) },
  );

  for (const quarry of visibleHostileHosts(state)) {
    const at = state.lands.find((candidate) => candidate.id === quarry.landId);
    const size = hostSize(quarry);
    addRow(
      {
        title: quarry.name,
        subtitle: t('ascent.army.huntRow', { size, land: at?.name ?? '—' }),
        border: INK_UI.cinnabar,
      },
      () => {
        self.events.emit('ui:ascent-army-orders', { armyId, orders: { kind: 'hunt', armyId: quarry.id } });
        self.closeLane();
      },
    );
  }

  finish();
}
