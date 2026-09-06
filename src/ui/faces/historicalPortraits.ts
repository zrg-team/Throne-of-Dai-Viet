import { REAL_FIGURES } from '../../data/heroNames';
import type { Hero, HeroEra } from '../../state/types';
import type { HeroLook, HeroLookPart } from './heroLook';
import { ROBES, shade } from './palette';

/** Art direction, not a claim of authenticated facial likeness or exact court uniform.
 * Evidence and the complete per-name review are in docs/research/special-hero-portraits.md.
 * Never derive a documented person's costume, age or insignia from game rarity. */
export interface HistoricalPortrait {
  identity: string;
  era: HeroEra;
  sex: 'man' | 'woman';
  age: HeroLook['age'];
  monastic: boolean;
  hat: string;
  garment: string;
  hair: string[];
  beard: string;
  robe: number;
  evidence: 'period-interpretation' | 'early-commemorative' | 'photograph-informed' | 'published-portrait-informed';
  note: string;
}

const ALIASES: Record<string, string> = {
  'Lê Đại Hành': 'Lê Hoàn', 'Lý Thái Tổ': 'Lý Công Uẩn', 'Lê Thái Tổ': 'Lê Lợi',
  'Quang Trung': 'Nguyễn Huệ', 'Thích Không Lộ': 'Thiền sư Không Lộ',
  'Thích Thường Chiếu': 'Thiền sư Thường Chiếu',
};
const EXTRA: Array<{ name: string; sex: 'man' | 'woman'; era: HeroEra; type: Hero['type']; monastic?: boolean }> = [
  { name: 'Trưng Nữ Vương', sex: 'woman', era: 'dinh', type: 'general' },
  ...['Lý Nam Đế', 'Mai Hắc Đế', 'Bố Cái Đại Vương'].map(name => ({ name, sex: 'man' as const, era: 'dinh' as const, type: 'general' as const })),
  ...['Lý Thái Tông', 'Lý Thánh Tông', 'Lý Nhân Tông'].map(name => ({ name, sex: 'man' as const, era: 'ly' as const, type: 'minister' as const })),
  ...['Trần Thái Tông', 'Trần Thánh Tông', 'Trần Minh Tông'].map(name => ({ name, sex: 'man' as const, era: 'tran' as const, type: 'minister' as const })),
  ...['Gia Long', 'Minh Mạng'].map(name => ({ name, sex: 'man' as const, era: 'nguyen' as const, type: 'minister' as const })),
  { name: 'Thiền sư Thường Chiếu', sex: 'man', era: 'ly', type: 'minister', monastic: true },
];
const CATALOGUE = new Map([...REAL_FIGURES, ...EXTRA].map(f => [f.name, f]));
const EARLY = new Set(['Trưng Nữ Vương', 'Lý Nam Đế', 'Mai Hắc Đế', 'Bố Cái Đại Vương']);
const ELDERS = new Set(['Chu Văn An', 'Nguyễn Bỉnh Khiêm', 'Nguyễn Thiếp', 'Nguyễn Đình Chiểu', 'Nguyễn Tri Phương', 'Phan Thanh Giản']);
const ROYAL = new Set(['Trưng Nữ Vương', 'Lý Nam Đế', 'Mai Hắc Đế', 'Bố Cái Đại Vương', 'Ngô Quyền', 'Đinh Bộ Lĩnh', 'Lê Hoàn',
  'Lý Công Uẩn', 'Lý Thái Tông', 'Lý Thánh Tông', 'Lý Nhân Tông', 'Lý Chiêu Hoàng', 'Trần Thái Tông', 'Trần Thánh Tông',
  'Trần Nhân Tông', 'Trần Minh Tông', 'Lê Lợi', 'Lê Thánh Tông', 'Mạc Đăng Dung', 'Nguyễn Huệ', 'Gia Long', 'Minh Mạng']);

// These are individual presentation decisions. A missing field retains the restrained
// period/role assembly below, rather than re-entering an unrestricted wardrobe lottery.
const INDIVIDUAL: Record<string, Partial<HistoricalPortrait>> = {
  'Yết Kiêu': { hat: 'hat-band-cloth', garment: 'collar-giaolinh', robe: 0x4b6665, note: 'Plain campaign-attendant interpretation; no court cap assigned from the game agent role.' },
  'Dã Tượng': { hat: 'hat-band-cloth', garment: 'collar-giaolinh', robe: 0x795c43, note: 'Plain campaign-attendant interpretation; no court cap assigned from the game agent role.' },
  'Ngô Quyền': { hat: 'hat-binhdinh', garment: 'robe-armour-leather', robe: 0x795336, note: 'Tenth-century campaign interpretation; simplified armour, not an authenticated surviving uniform.' },
  'Lê Lợi': { hat: 'hat-helm', garment: 'robe-armour-lamellar', robe: 0x786041, note: 'Lam Sơn campaign interpretation shared with the title Lê Thái Tổ; not a coronation costume.' },
  'Lê Quý Đôn': { era: 'le', hat: 'hat-phocdau-short', garment: 'collar-vienlinh', beard: 'beard-goatee', note: 'Lê–Trịnh scholar (1726–1784), not a Nguyễn official.' },
  'Đoàn Thị Điểm': { era: 'le', hat: '', garment: 'collar-giaolinh', hair: ['hair-woman-center', 'bun-nape-right'], robe: 0x567067, note: 'Lê Trung Hưng writer (1705–1748); no Nguyễn Nhật Bình or vành dây.' },
  'Thiền sư Thường Chiếu': { era: 'ly', note: 'Died in 1203: Lý-period teacher, not a Trần-era monk.' },
  'Lý Thường Kiệt': { age: 'prime', hat: 'hat-phocdau-short', garment: 'collar-vienlinh', beard: '', robe: ROBES.azure, note: 'Adult statesman/commander; clean-shaven interpretation informed by the biographical eunuch record.' },
  'Lê Văn Duyệt': { age: 'prime', hat: 'hat-khandong', beard: '', robe: 0x566b5d, note: 'Adult Gia Định governor; no randomized beard, jewellery or medieval armour.' },
  'Trần Quốc Toản': { age: 'young', hat: 'hat-helm-leather', garment: 'robe-armour-leather', beard: '', robe: 0x986344, note: 'Youthful campaign portrait; no elder face, grey hair, beard or age marks.' },
  'Lê Ngọc Hân': { age: 'young', hat: '', garment: 'collar-giaolinh-wide', hair: ['hair-woman-center', 'bun-nape-left'], robe: 0xa45b49, note: 'Young adult Tây Sơn queen; died in 1799 aged 29. Not Nguyễn ceremonial dress.' },
  'Lý Chiêu Hoàng': { age: 'prime', hat: '', garment: 'collar-giaolinh-wide', hair: ['hair-woman-center', 'bun-nape-right'], robe: 0x9f4d3f, note: 'Adult post-reign portrait. This is not a depiction of her childhood accession.' },
  'An Tư công chúa': { hat: '', garment: 'collar-giaolinh-wide', hair: ['hair-woman-center', 'bun-nape-left'], robe: 0xa85240 },
  'Huyền Trân công chúa': { hat: '', garment: 'collar-giaolinh', hair: ['hair-woman-center', 'bun-nape-right'], robe: 0x63765d, note: 'Đại Việt court phase; no invented Chăm jewellery or assertion of a marriage costume.' },
  'Nguyên phi Ỷ Lan': { hat: '', garment: 'collar-vienlinh', hair: ['hair-woman-center', 'bun-coil'], robe: 0x9e5340 },
  'Dương Vân Nga': { hat: '', garment: 'collar-giaolinh-wide', hair: ['hair-woman-center', 'bun-coil'], robe: 0x9f5744 },
  'Linh Từ quốc mẫu': { hat: '', garment: 'collar-giaolinh-wide', hair: ['hair-woman-center', 'bun-nape-right'], robe: 0x947040 },
  'Bùi Thị Xuân': { age: 'prime', hat: 'hat-band-cloth', garment: 'robe-armour-leather', hair: ['hair-woman-center', 'bun-nape-right'], robe: 0x9c6848, note: 'Campaign interpretation for the woman commander; no random elder civilian dress or claimed red-headband uniform.' },
  'Trần Hưng Đạo': { age: 'prime', hat: 'hat-dinhtu', garment: 'collar-vienlinh', beard: 'beard-long', robe: 0x986740, note: 'Trần command/court interpretation; no purported authenticated lifetime likeness.' },
  'Trần Thủ Độ': { hat: 'hat-dinhtu', garment: 'collar-vienlinh', beard: 'beard-goatee', robe: 0x465d66 },
  'Nguyễn Trãi': { hat: 'hat-phocdau-short', garment: 'collar-vienlinh', beard: 'beard-goatee-long', robe: 0x47685f },
  'Nguyễn Thị Duệ': { hat: '', garment: 'collar-vienlinh', hair: ['hair-woman-center', 'bun-nape-right'], robe: 0x567180, note: 'Adult woman scholar; no game-rarity court badge or fabricated examination disguise.' },
  'Nguyễn Huệ': { age: 'prime', hat: 'hat-khanvan', garment: 'collar-giaolinh-wide', beard: '', robe: 0xa1543d, note: 'Adult campaign interpretation shared with Quang Trung; disputed Qing-court portrait not used as a Vietnamese costume template.' },
  'Nguyễn Hoàng': { age: 'prime', hat: 'hat-khanvan', garment: 'collar-vienlinh', beard: 'beard-goatee', robe: 0x65715a, note: 'Pre-1744 southern-lord phase, not nineteenth-century Nguyễn dress.' },
  'Hoàng Hoa Thám': { age: 'prime', hat: 'hat-khanvan-low', garment: 'collar-nguthan', beard: 'beard-full', robe: 0x3c4749, evidence: 'photograph-informed', note: 'Museum photograph inspected: close dark head covering, substantial beard, long plain robe. Pigment colour is artistic; photo is monochrome.' },
  'Nguyễn Đình Chiểu': { age: 'elder', hat: 'hat-khanvan', garment: 'collar-nguthan', beard: 'beard-long', robe: 0x655441, note: 'Later-life teacher/poet, not a badged court official. His recorded blindness does not justify inventing a particular eye pathology.' },
  'Nguyễn Trường Tộ': { hat: 'hat-khanvan-low', garment: 'collar-nguthan', beard: '', robe: 0x52697b, note: 'Lay reformer; plain robe without official rank badge or Buddhist regalia.' },
  'Nguyễn Thiện Thuật': { age: 'elder', hat: 'hat-khanvan-low', garment: 'collar-nguthan', beard: 'beard-goatee', robe: 0x414d49, evidence: 'published-portrait-informed', note: 'Museum-published portrait inspected: later-life face, small pointed beard and dark high-neck robe. The reproduction is undated; the game wrap is a Vietnamese period interpretation, not an authenticated exile cap.' },
  'Phan Đình Phùng': { age: 'prime', hat: 'hat-khanvan-low', garment: 'collar-nguthan', beard: 'beard-goatee', robe: 0x48545b, evidence: 'published-portrait-informed', note: 'Inspected the portrait attributed to a 1935 Ngô Tất Tố publication: dark head covering, high collar, small facial-hair shapes. Posthumous reproduction, not proof of lifetime likeness.' },
  'Hồ Xuân Hương': { hat: 'hat-moqua', garment: 'collar-tuthan', robe: 0x597361, note: 'Late northern literary interpretation; no imperial Nhật Bình and no random ornamental court badge.' },
  'Bà Huyện Thanh Quan': { hat: 'hat-moqua-brown', garment: 'collar-tuthan', robe: 0x617988 },
  'Gia Long': { hat: 'hat-khandong', garment: 'collar-nguthan', beard: '', robe: 0x98743b, note: 'Informal Nguyễn royal portrait, not a reconstructed đại triều ensemble.' },
  'Minh Mạng': { hat: 'hat-khandong', garment: 'collar-nguthan-tall', beard: 'beard-moustache-thin', robe: 0xaa803f, note: 'Informal Nguyễn royal portrait; no generic bird badge presented as imperial insignia.' },
};

export function historicalPortraitFor(hero: Hero): HistoricalPortrait | undefined {
  if (hero.id === 'king') return undefined; // The player's self-authored identity always wins.
  const identity = ALIASES[hero.name] ?? hero.name;
  const figure = CATALOGUE.get(identity);
  if (!figure) return undefined;
  // Trần Nhân Tông can be represented in two documented life phases. The authored
  // sovereign entry is not monastic; an explicitly monastic entry retains its vows.
  const monastic = identity === 'Trần Nhân Tông' ? hero.monastic === true : figure.monastic === true;
  const era = INDIVIDUAL[identity]?.era ?? figure.era;
  const woman = figure.sex === 'woman', military = figure.type === 'general';
  let hat = '', garment = 'collar-giaolinh', hair = woman ? ['hair-woman-center', 'bun-nape-right'] : ['hair-crown'];
  if (monastic) { garment = 'kesa'; hair = []; }
  else if (EARLY.has(identity)) { hat = woman ? 'hat-band-cloth' : ''; if (!woman) hair.push('topknot-small'); }
  else if (era === 'dinh') { hat = woman ? '' : military ? 'hat-binhdinh' : 'hat-khanvuong'; garment = military ? 'robe-armour-leather' : 'collar-giaolinh'; }
  else if (era === 'ly' || era === 'tran') {
    hat = woman ? '' : military ? 'hat-helm-leather' : era === 'ly' ? 'hat-phocdau-short' : 'hat-dinhtu';
    garment = military ? 'robe-armour-lamellar' : woman ? 'collar-giaolinh' : 'collar-vienlinh';
  } else if (era === 'le') {
    hat = woman ? '' : military ? 'hat-helm' : figure.type === 'agent' ? 'hat-khanvan' : 'hat-phocdau-short';
    garment = military ? 'robe-armour-lamellar' : 'collar-vienlinh';
  } else if (era === 'tayson') { hat = woman ? '' : 'hat-khanvan'; garment = military ? 'collar-giaolinh' : 'collar-vienlinh'; }
  else { hat = woman ? 'hat-moqua' : 'hat-khandong'; garment = woman ? 'collar-tuthan' : 'collar-nguthan'; }
  const age = monastic || ELDERS.has(identity) ? 'elder' : 'prime';
  // Pigments are compositional art choices, never an inferred historical rank.
  const pigments = military ? [0x8d684c, 0x785d42, 0x806249, 0x946e45]
    : woman ? [0x8d5849, 0x61765e, 0x596f7a, 0x99744c] : [0x4e6b7b, 0x587163, 0x875c46, 0x85704c];
  const pigmentIndex = [...identity].reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) >>> 0, 0) % pigments.length;
  const profile: HistoricalPortrait = {
    identity, era, sex: figure.sex, age, monastic, hat, garment, hair,
    beard: woman || monastic ? '' : age === 'elder' ? 'beard-wispy' : '',
    robe: monastic ? ROBES.ochre : pigments[pigmentIndex],
    evidence: EARLY.has(identity) ? 'early-commemorative' : 'period-interpretation',
    note: EARLY.has(identity) ? 'Pre-Đinh commemorative interpretation: the software era fallback is not a costume date. Exact early clothing is not established.'
      : 'Restrained period/role interpretation using the reviewed Vietnamese wardrobe references; exact individual clothing and likeness are not authenticated.',
    ...INDIVIDUAL[identity],
  };
  if (ROYAL.has(identity) && !monastic && !INDIVIDUAL[identity] && !EARLY.has(identity)) {
    profile.garment = 'collar-vienlinh'; profile.robe = 0x9a6742;
    profile.hat = era === 'ly' ? 'hat-phocdau-short' : era === 'tran' ? 'hat-dinhtu' : profile.hat;
  }
  if (monastic) { profile.hat = ''; profile.garment = 'kesa'; profile.hair = []; profile.beard = ''; }
  return profile;
}

/** Replace only presentation. The original hero, stats, abilities and saved look survive. */
export function applyHistoricalPortrait(look: HeroLook, profile: HistoricalPortrait): HeroLook {
  const parts = look.parts.filter(p => !/^(robe-|collar-|kesa|yem|guard-|buttons-|hat-|hair|topknot|bun-|knot-|beard-|sash-|belt-|badge-|earring-|scalp-|mark-|ears)/.test(p.key)).map(p => ({ ...p }));
  const add = (key: string, tint: HeroLookPart['tint']) => { if (key) parts.push({ key, tint }); };
  add('ears', 'skinShadow');
  add(profile.garment, profile.monastic ? 'none' : 'robe');
  for (const key of profile.hair) add(key, 'hair');
  add(profile.hat, 'none'); add(profile.beard, 'hair');
  if (profile.age === 'elder') add('mark-age', 'skinShadow');
  const robe = profile.robe;
  return { ...look, parts, era: profile.era, age: profile.age, sex: profile.sex, monastic: profile.monastic,
    palette: { ...look.palette, robe, robeDark: shade(robe, -34), robeLight: shade(robe, 30) } };
}
