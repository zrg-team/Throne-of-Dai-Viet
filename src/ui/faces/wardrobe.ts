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
 *
 * Every list here is a *pool* the seed then picks from, never a single answer. That is the
 * difference between a roster of two hundred and the same six portraits repeated: the
 * constraint is historical, the choice inside it is not.
 */

type Pick = <T>(items: readonly T[]) => T;

/**
 * Headwear each era actually offers, by role and sex. A monk's list has one entry.
 *
 * The pools are deliberately uneven. A Lê general has five war helms to choose from because
 * the sources describe that many; a Đinh one has two, because the tenth century did not have a
 * court to regulate the rest.
 */
export function headwearFor(era: HeroEra, type: Hero['type'], woman: boolean, rank: number): string[] {
  if (woman) return womenHeadwear(era, rank);
  if (era === 'dinh') {
    // Weighted to the war helm rather than merely offering it: the Đinh state was a võ trị —
    // the army was the government — and the pool used to be the shortest in this file for want
    // of a source. The 2026 Hoa Lư reconstruction is not a source, but it is a coherent
    // proposal, and one specific helm beats three generic ones.
    if (type === 'general') return ['hat-helm-dinh', 'hat-helm-dinh', 'hat-helm', 'hat-helm-leather', 'hat-band-warrior', ''];
    return ['', '', 'hat-khanvan-low', 'hat-khanvuong', 'hat-band-cloth', 'hat-non'];
  }
  if (era === 'ly') {
    if (type === 'general') return ['hat-helm', 'hat-helm-plume', 'hat-helm-daumau', 'hat-khanvan', 'hat-band-warrior'];
    if (type === 'minister') return ['hat-phocdau-short', 'hat-khanvan', 'hat-duongcan', 'hat-osa', rank >= 3 ? 'hat-xungthien' : 'hat-binhdinh'];
    if (type === 'governor') return ['hat-khanvan', 'hat-osa', 'hat-khanvuong', 'hat-non'];
    return ['hat-khanvan', 'hat-non', 'hat-khanvuong', 'hat-non-chop'];
  }
  if (era === 'tran') {
    if (type === 'general') return ['hat-helm', 'hat-helm-lamellar', 'hat-helm-cheeks', 'hat-helm-daumau', ''];
    if (type === 'minister') return ['hat-phocdau-short', 'hat-duongcan', 'hat-osa', 'hat-tamson', ''];
    if (type === 'governor') return ['hat-khanvan', 'hat-osa', '', 'hat-non-chop'];
    return ['hat-khanvan-low', '', 'hat-non', 'hat-non-dau'];
  }
  if (era === 'le') {
    if (type === 'general') return ['hat-helm', 'hat-helm-crest', 'hat-helm-horned', 'hat-helm-lamellar', 'hat-khanvan'];
    // 1499: the court wrote wing length into the regulations, so a Lê minister wears the
    // dragonfly cap more often than anything else and the wings say how senior he is.
    if (type === 'minister') return ['hat-phocdau-short', 'hat-phocdau-short', 'hat-osa', 'hat-binhdinh', 'hat-tamson'];
    if (type === 'governor') return ['hat-khanvan', 'hat-osa', 'hat-khanvuong', 'hat-non', 'hat-binhdinh'];
    return ['hat-khanvan', 'hat-non', 'hat-khanvuong', 'hat-non-dau', 'hat-band-cloth'];
  }
  if (era === 'tayson') {
    if (type === 'general') return ['hat-helm-crest', 'hat-helm-plume', 'hat-band-warrior', 'hat-helm-leather', 'hat-band'];
    if (type === 'minister') return ['hat-khanvan', 'hat-duongcan', 'hat-osa', 'hat-band'];
    return ['hat-band', 'hat-khanvan', 'hat-non', 'hat-non-dau', 'hat-band-cloth'];
  }
  // Nguyễn: the khăn đóng is the everyday form and the folded khăn xếp the formal one; the
  // dragonfly cap survives only at court.
  if (type === 'general') return ['hat-helm-daumau', 'hat-helm', 'hat-khandong', 'hat-band-warrior', 'hat-helm-leather'];
  if (type === 'minister') return ['hat-phocdau-short', 'hat-khanxep', 'hat-khandong', 'hat-osa', 'hat-binhdinh'];
  if (type === 'governor') return ['hat-khandong', 'hat-khanxep', 'hat-khandong-jewel', 'hat-osa', 'hat-non'];
  return ['hat-khandong', 'hat-non', 'hat-khanxep', 'hat-non-chop', 'hat-khanvuong'];
}

/**
 * A woman's headwear, which tracks region and occasion more than office.
 *
 * The khăn mỏ quạ is the northern delta's, the nón quai thao is what a woman wore to a
 * festival, and the khăn vành dây — the great coiled wrap — belongs to the Nguyễn court and
 * nowhere else.
 */
function womenHeadwear(era: HeroEra, rank: number): string[] {
  if (era === 'nguyen') {
    return rank >= 2
      ? ['hat-vanhday', 'hat-crown-nhatbinh', 'hat-crown-phoenix', 'hat-vanhday', 'hat-moqua']
      : ['hat-moqua', 'hat-moqua-tied', 'hat-khanxep', 'hat-non', 'hat-moqua-brown'];
  }
  if (era === 'le' || era === 'tayson') {
    return rank >= 2
      ? ['hat-coronet', 'hat-crown-phoenix', 'hat-coronet-jade', 'hat-non-quaithao', 'hat-moqua']
      : ['hat-moqua', 'hat-non-quaithao', 'hat-moqua-brown', 'hat-non-batam', ''];
  }
  return rank >= 2
    ? ['hat-coronet', 'hat-coronet-jade', 'hat-crown-seven', '', 'hat-band-gold']
    : ['', 'hat-band', 'hat-moqua-brown', 'hat-non', 'hat-band-cloth'];
}

/** Rank lengthens the dragonfly wings, as the 1499 court regulations did. */
export function rankWings(hat: string, rank: number): string {
  if (!hat.startsWith('hat-phocdau')) return hat;
  return rank >= 3 ? 'hat-phocdau-grand' : rank >= 2 ? 'hat-phocdau-long' : 'hat-phocdau-short';
}

/** Hair a man of this era may wear under (or instead of) a hat. */
export function manHairFor(era: HeroEra, age: 'young' | 'prime' | 'elder'): string[] {
  if (age === 'elder') return ['hair-receding', 'hair-high', 'hair-crown', 'hair-parted'];
  // Trần fashion cropped the hair short — Chinese envoys remarked on it, and it is the
  // cheapest way to make a Trần portrait unmistakable beside a Lê one.
  if (era === 'tran') return ['hair-cropped', 'hair-cropped', 'hair-high', 'hair-crown'];
  return ['hair-crown', 'hair-parted', 'hair-thick', 'hair-peak', 'hair-swept', 'hair-low'];
}

/** A man's knot, worn under a wound turban or on its own. */
export function manKnotFor(era: HeroEra): string[] {
  // The nape knot is a soldier's and the crown knot a scholar's, so it belongs to the two eras
  // that had more of the first than the second.
  if (era === 'dinh') return ['topknot-tall', 'knot-nape', 'knot-nape', 'topknot-wrapped', 'topknot'];
  if (era === 'ly') return ['topknot', 'topknot-small', 'knot-nape', 'topknot-wrapped', 'topknot-side'];
  return ['topknot', 'topknot-small', 'topknot-wrapped', 'topknot-side'];
}

/** A woman's hair. Under a covering hat only the crown shows, so the caller narrows this. */
export function womanHairFor(era: HeroEra, covered: boolean): string[] {
  if (covered) return ['hair-crown', 'hair-low', 'hair-parted', 'hair-thick'];
  if (era === 'nguyen') return ['hair-long', 'hair-long-full', 'hair-braid', 'hair-tail', 'hair-wavy'];
  return ['hair-long', 'hair-long-short', 'hair-braid', 'hair-long-full', 'hair-tail'];
}

/**
 * A woman's knot. The coil and the wrapped knot are the delta forms; twin buns read young.
 *
 * Era gates the tall forward knot, which is the older courts' and not the delta's — the same
 * rule the hats are under, for the same reason. Before this the four hundred years between
 * Hoa Lư and Thăng Long had one hairstyle between them.
 */
export function womanKnotFor(era: HeroEra, age: 'young' | 'prime' | 'elder'): string[] {
  const early = era === 'dinh' || era === 'ly';
  if (age === 'young') return early ? ['bun-tall-fore', 'bun-high', 'bun-double', 'bun-coil'] : ['bun-high', 'bun-double', 'bun-low', 'bun-coil'];
  if (age === 'elder') return early ? ['bun-tall-fore', 'bun-low', 'bun-wrapped', 'bun-coil'] : ['bun-low', 'bun-wrapped', 'bun-wide', 'bun-coil'];
  if (early) return ['bun-tall-fore', 'bun-tall-fore', 'bun-high', 'bun-coil', 'bun-wrapped'];
  return ['bun-high', 'bun-low', 'bun-coil', 'bun-wrapped', 'bun-wide'];
}

/** What may be pinned into it. An empty entry means nothing at all, which is most people. */
export function hairOrnamentFor(rank: number): string[] {
  if (rank >= 3) return ['hairpin-jade', 'hairpin-long', 'hair-comb', 'hair-flower', 'hairpin-plain'];
  if (rank >= 1) return ['hairpin', 'hairpin-jade', 'hairpin-plain', 'hair-ribbon', '', 'hair-cord'];
  return ['', '', 'hairpin', 'hairpin-plain', 'hair-cord', 'hair-ribbon'];
}

/** The robe, its collar, and whatever fastens it — one coherent set per era and sex. */
export function garmentsFor(
  era: HeroEra,
  woman: boolean,
  monastic: boolean,
  type: Hero['type'],
  rank: number,
  pick: Pick,
): HeroLookPart[] {
  if (monastic) {
    return [
      { key: 'robe-sloped', tint: 'robe' },
      { key: pick(['kesa', 'kesa', 'kesa-red', 'kesa-grey']), tint: 'none' },
      ...(pick([true, false, false]) ? [{ key: 'kesa-patches', tint: 'none' } as HeroLookPart] : []),
    ];
  }
  if (woman) return womenGarments(era, rank, pick);

  const shape = type === 'general'
    ? pick(era === 'dinh'
      // Brigandine is a studded coat and lamellar a laced one; neither is tenth-century. The
      // shell lame and plain hardened leather are, so a Đinh harness draws from its own list.
      ? ['robe-armour-fanscale', 'robe-armour-fanscale', 'robe-armour-leather', 'robe-armour', 'robe-armour-scale']
      : ['robe-armour', 'robe-armour-lamellar', 'robe-armour-scale', 'robe-armour-brigandine', 'robe-armour-leather'])
    : pick(['robe-body', 'robe-body', 'robe-slim', 'robe-sloped', 'robe-broad']);
  const body: HeroLookPart[] = [
    { key: shape, tint: 'robe' },
    { key: pick(['robe-sheen', 'robe-sheen-soft']), tint: 'robeLight' },
  ];
  // A field harness gets its flared pauldrons, gilded when the man commands armies rather
  // than companies.
  if (type === 'general' && rank >= 1 && pick([true, true, false])) {
    body.push({ key: 'guard-shoulder', tint: 'robeDark' });
    if (rank >= 2) body.push({ key: 'guard-shoulder-gilt', tint: 'none' });
  }

  if (era === 'nguyen') {
    // Áo ngũ thân: a standing collar closing to the right, five buttons for the Five Constants.
    return [
      ...body,
      { key: 'collar-nguthan-body', tint: 'robe' },
      { key: pick(['collar-nguthan', 'collar-nguthan-tall']), tint: 'robeLight' },
      { key: pick(['buttons-five', 'buttons-jade', 'buttons-knot']), tint: 'none' },
      ...beltFor(rank, era, pick),
    ];
  }
  if (era === 'dinh') {
    // A court that has not yet regulated a cap has to carry rank on the body, which is why
    // this era gets its distinctions from the garment rather than from the head. Three marks,
    // in ascending order of office: the rope belt on a man with none, the brocade band down
    // the lapel on a man with some, the beast-mask shoulder on a man who commands armies.
    if ((type === 'minister' || type === 'governor') && rank >= 1) {
      // Áo đối khâm — two parallel bands hanging open, with the placket of ô vuông between
      // them. The round-collar áo viên lĩnh and its bổ tử are both Lê inventions and stay out.
      return [
        ...body,
        { key: 'collar-doikham', tint: 'robeDark' },
        { key: 'collar-doikham-over', tint: 'robeLight' },
        { key: 'collar-placket-square', tint: 'none' },
        { key: pick(['sash-cord', 'sash-silk', 'sash-ochre']), tint: 'none' },
      ];
    }
    // The two-flap wrap the Đông Sơn drums show, closed with a sash.
    const dinh: HeroLookPart[] = [
      ...body,
      { key: 'collar-twoflap', tint: 'robeDark' },
      { key: 'collar-twoflap-over', tint: 'robeLight' },
    ];
    if (type === 'general' && rank >= 2) dinh.push({ key: 'guard-beastmask', tint: 'none' });
    if (rank >= 1 && pick([true, true, false])) {
      dinh.push({ key: pick(['collar-band-brocade', 'collar-band-brocade', 'collar-band-oxblood']), tint: 'none' });
    }
    dinh.push({ key: pick(['sash-ochre', 'sash-cord', 'sash-silk']), tint: 'none' });
    if (rank === 0) dinh.push({ key: 'belt-rope-coil', tint: 'none' });
    return dinh;
  }

  // Lý · Trần · Lê · Tây Sơn. A court officer of standing wears the round-collar áo viên lĩnh
  // — which is what leaves the chest clear for the bổ tử — and everyone else the crossed lapel.
  const courtly = (type === 'minister' || type === 'governor') && rank >= 1 && era !== 'tayson';
  if (courtly && pick([true, true, false])) {
    return [
      ...body,
      { key: 'collar-vienlinh', tint: 'robeDark' },
      { key: 'collar-vienlinh-trim', tint: 'none' },
      ...(rank >= 1 ? [{ key: badgeFor(type, rank, pick), tint: 'none' } as HeroLookPart] : []),
      ...beltFor(rank, era, pick),
    ];
  }
  const giaoLinh: HeroLookPart[] = pick([true, true, true, false])
    ? [...body, { key: 'collar-giaolinh', tint: 'robeDark' }, { key: 'collar-giaolinh-over', tint: 'robeLight' }]
    : [...body, { key: 'collar-giaolinh-wide', tint: 'robeDark' }, { key: 'collar-giaolinh-wide-over', tint: 'robeLight' }];
  if (rank >= 2) giaoLinh.push({ key: 'collar-giaolinh-trim', tint: 'none' });
  if (era === 'tayson') giaoLinh.push({ key: pick(['sash-baldric', 'sash-baldric-red', 'sash-cord']), tint: 'none' });
  else giaoLinh.push(...beltFor(rank, era, pick));
  return giaoLinh;
}

/**
 * A woman's dress. The áo yếm is the constant underneath; what goes over it is what changes —
 * the four-panel áo tứ thân in the Lê delta, the áo nhật bình at the Nguyễn court.
 */
function womenGarments(era: HeroEra, rank: number, pick: Pick): HeroLookPart[] {
  const body: HeroLookPart[] = [
    { key: pick(['robe-body', 'robe-slim', 'robe-sloped']), tint: 'robe' },
    { key: pick(['robe-sheen', 'robe-sheen-soft']), tint: 'robeLight' },
  ];
  if (era === 'nguyen' && rank >= 1) {
    return [
      ...body,
      { key: 'collar-nhatbinh', tint: 'robeDark' },
      { key: 'collar-nhatbinh-trim', tint: 'none' },
      ...(rank >= 2 ? [{ key: 'collar-nhatbinh-phoenix', tint: 'none' } as HeroLookPart] : []),
    ];
  }
  if (era === 'nguyen') {
    return [
      ...body,
      { key: 'collar-nguthan-body', tint: 'robe' },
      { key: 'collar-nguthan', tint: 'robeLight' },
      { key: pick(['buttons-knot', 'buttons-jade']), tint: 'none' },
    ];
  }
  // Before the delta's tứ thân and the Nguyễn court's nhật bình, a woman of rank wore the same
  // crossed lapel a man did and the rank went into the band down it, not into the cut. Without
  // this the older centuries dressed every woman in the yếm wrap regardless of who she was.
  if ((era === 'dinh' || era === 'ly') && rank >= 2) {
    return [
      ...body,
      { key: 'collar-giaolinh', tint: 'robeDark' },
      { key: 'collar-giaolinh-over', tint: 'robeLight' },
      { key: pick(['collar-band-oxblood', 'collar-band-brocade']), tint: 'none' },
      { key: pick(['sash-silk', 'sash-waist']), tint: 'none' },
    ];
  }
  const yem = pick(['yem', 'yem', 'yem-cream', 'yem-indigo', 'yem-jade']);
  if ((era === 'le' || era === 'tayson') && pick([true, true, false])) {
    // Áo tứ thân: two front panels knotted at the waist, the yếm showing between them.
    return [
      ...body,
      { key: 'collar-tuthan', tint: 'robeDark' },
      { key: 'collar-tuthan-over', tint: 'robeLight' },
      { key: yem, tint: 'none' },
      { key: 'collar-tuthan-knot', tint: 'none' },
      { key: pick(['sash-waist', 'sash-waist-red', 'sash-silk']), tint: 'none' },
    ];
  }
  const dress: HeroLookPart[] = [
    ...body,
    { key: 'collar-yem-wrap', tint: 'robeLight' },
    { key: yem, tint: 'none' },
  ];
  if (era === 'le' || era === 'tayson') dress.push({ key: pick(['sash-waist', 'sash-waist-red']), tint: 'none' });
  else if (rank >= 1) dress.push({ key: pick(['sash-silk', 'sash-cord']), tint: 'none' });
  return dress;
}

/** Đai — the plaque belt. Only high office wore one, and jade outranked gold at some courts. */
function beltFor(rank: number, era: HeroEra, pick: Pick): HeroLookPart[] {
  if (rank < 2 || era === 'dinh') return [];
  return pick([true, false]) ? [{ key: pick(['belt-jade', 'belt-gold']), tint: 'none' }] : [];
}

/**
 * Bổ tử — the rank badge. Civil offices wore birds and military ones beasts, which is a real
 * distinction and the fastest way to read an office off a portrait.
 */
function badgeFor(type: Hero['type'], rank: number, pick: Pick): string {
  if (type === 'general') {
    return rank >= 3 ? 'badge-lion' : pick(['badge-tiger', 'badge-bear', 'badge-rhino']);
  }
  if (rank >= 3) return pick(['badge-crane', 'badge-dragon']);
  return pick(['badge-pheasant', 'badge-peacock', 'badge-crane']);
}

export function robeColour(type: Hero['type'], woman: boolean, monastic: boolean, era: HeroEra, rank: number): number {
  if (monastic) return ROBES.ochre;
  if (woman) return rank >= 3 ? ROBES.vermilion : rank >= 2 ? ROBES.azure : ROBES.nau;
  if (type === 'minister') return rank >= 2 ? ROBES.azure : ROBES.jade;
  if (type === 'general') return era === 'tayson' ? ROBES.vermilion : ROBES.cham;
  if (type === 'governor') return ROBES.nau;
  return rank >= 2 ? ROBES.jade : ROBES.nau;
}
