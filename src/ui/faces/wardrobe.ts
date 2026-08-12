import type { Hero, HeroEra } from '../../state/types';
import type { HeroLookPart } from './heroLook';
import { ROBES } from './palette';

/**
 * What a person of a given identity is allowed to wear.
 *
 * Split from the renderer and from the resolver on purpose. `FaceRenderer` stacks whatever
 * parts it is handed and knows nothing about heroes; `heroLook` decides *who* someone is; this
 * file is the only place that answers *what they wear*, era by era. Adding a dynasty, or
 * giving an office a new hat, touches this file and the part library and nothing else.
 *
 * Đại Việt did not dress the same way for a thousand years, which is why these are keyed on
 * era first: Nguyễn Phúc Khoát's 1744 reform replaced the crossed lapel of the áo giao lĩnh
 * with the standing collar of the áo ngũ thân, so an official of the wrong century is as
 * plainly wrong as an office in the wrong hat.
 */

/** Headwear each era actually offers, by role and sex. A monk's list has one entry. */
export function headwearFor(era: HeroEra, type: Hero['type'], woman: boolean, rank: number): string[] {
  if (woman) {
    if (era === 'nguyen') return rank >= 2 ? ['hat-crown-nhatbinh', 'hat-moqua'] : ['hat-moqua', 'hat-moqua'];
    if (era === 'le' || era === 'tayson') return rank >= 2 ? ['hat-coronet', 'hat-moqua'] : ['hat-moqua', ''];
    return rank >= 2 ? ['hat-coronet', ''] : ['', 'hat-band'];
  }
  if (era === 'dinh') return type === 'general' ? ['hat-helm', ''] : ['', 'hat-khanvan'];
  if (era === 'ly') {
    if (type === 'general') return ['hat-helm', 'hat-khanvan'];
    if (type === 'minister') return ['hat-phocdau-short', 'hat-khanvan'];
    return ['hat-khanvan', 'hat-non'];
  }
  if (era === 'tran') {
    if (type === 'general') return ['hat-helm', ''];
    if (type === 'minister') return ['hat-phocdau-short', ''];
    return ['hat-khanvan', '', 'hat-non'];
  }
  if (era === 'le') {
    if (type === 'general') return ['hat-helm', 'hat-khanvan'];
    if (type === 'minister') return ['hat-phocdau-short', 'hat-phocdau-short'];
    return ['hat-khanvan', 'hat-non'];
  }
  if (era === 'tayson') return type === 'general' ? ['hat-helm', 'hat-band'] : ['hat-band', 'hat-khanvan', 'hat-non'];
  return type === 'minister' ? ['hat-phocdau-short', 'hat-khandong'] : ['hat-khandong', 'hat-non'];
}

/** Rank lengthens the dragonfly wings, as the 1499 court regulations did. */
export function rankWings(hat: string, rank: number): string {
  if (!hat.startsWith('hat-phocdau')) return hat;
  return rank >= 3 ? 'hat-phocdau-grand' : rank >= 2 ? 'hat-phocdau-long' : 'hat-phocdau-short';
}

/** The robe, its collar, and whatever fastens it — one coherent set per era and sex. */
export function garmentsFor(era: HeroEra, woman: boolean, monastic: boolean, type: Hero['type']): HeroLookPart[] {
  if (monastic) {
    return [{ key: 'robe-body', tint: 'robe' }, { key: 'kesa', tint: 'none' }];
  }
  if (woman) {
    if (era === 'nguyen') {
      return [
        { key: 'robe-body', tint: 'robe' },
        { key: 'robe-sheen', tint: 'robeLight' },
        { key: 'collar-nhatbinh', tint: 'robeDark' },
        { key: 'collar-nhatbinh-trim', tint: 'none' },
      ];
    }
    const dress: HeroLookPart[] = [
      { key: 'robe-body', tint: 'robe' },
      { key: 'robe-sheen', tint: 'robeLight' },
      { key: 'collar-yem-wrap', tint: 'robeLight' },
      { key: 'yem', tint: 'none' },
    ];
    if (era === 'le' || era === 'tayson') dress.push({ key: 'sash-waist', tint: 'none' });
    return dress;
  }
  const body: HeroLookPart[] = [
    { key: type === 'general' ? 'robe-armour' : 'robe-body', tint: 'robe' },
    { key: 'robe-sheen', tint: 'robeLight' },
  ];
  if (era === 'nguyen') {
    // Áo ngũ thân: a standing collar closing to the right, five buttons for the Five Constants.
    return [...body, { key: 'collar-nguthan-body', tint: 'robe' }, { key: 'collar-nguthan', tint: 'robeLight' }, { key: 'buttons-five', tint: 'none' }];
  }
  if (era === 'dinh') {
    // The two-flap wrap the Đông Sơn drums show, closed with a sash.
    return [...body, { key: 'collar-twoflap', tint: 'robeDark' }, { key: 'collar-twoflap-over', tint: 'robeLight' }, { key: 'sash-ochre', tint: 'none' }];
  }
  const giaoLinh: HeroLookPart[] = [
    ...body,
    { key: 'collar-giaolinh', tint: 'robeDark' },
    { key: 'collar-giaolinh-over', tint: 'robeLight' },
  ];
  if (era === 'tayson') giaoLinh.push({ key: 'sash-baldric', tint: 'none' });
  return giaoLinh;
}

export function robeColour(type: Hero['type'], woman: boolean, monastic: boolean, era: HeroEra, rank: number): number {
  if (monastic) return ROBES.ochre;
  if (woman) return rank >= 3 ? ROBES.vermilion : rank >= 2 ? ROBES.azure : ROBES.nau;
  if (type === 'minister') return rank >= 2 ? ROBES.azure : ROBES.jade;
  if (type === 'general') return era === 'tayson' ? ROBES.vermilion : ROBES.cham;
  if (type === 'governor') return ROBES.nau;
  return rank >= 2 ? ROBES.jade : ROBES.nau;
}

