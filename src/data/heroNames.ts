import type { Hero, HeroEra, HeroType } from '../state/types';

/**
 * Name components for procedurally generated champions.
 *
 * Vietnamese names run **họ · tên đệm · tên** — family name, then a middle name, then the
 * given name — which is the reverse of the Western order and the reason a generator that
 * simply concatenates two lists produces something that reads wrong to a Vietnamese player.
 * The middle name is also the strongest gender signal in the language: `Văn` is
 * conventionally a man's and `Thị` a woman's, so the pools are split rather than shared.
 *
 * Titles are prefixed the way the authored roster already does it — Thái Sư Minh, Đô Đốc Bạch
 * Đằng, Quan Thuế Hội An — so a generated champion sits beside a written one without looking
 * like filler.
 */

/** Họ — family names, commonest first. */
const SURNAMES = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng',
  'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Đoàn', 'Lưu', 'Mai',
  'Trịnh', 'Cao', 'Chu', 'Tạ', 'Lâm', 'Quách', 'Hà', 'Tô', 'Thái', 'Kiều',
  'Đào', 'Vương', 'Tống', 'Từ', 'Khúc', 'Thân', 'Giang', 'Nghiêm', 'La', 'Ninh',
  'Doãn', 'Hứa', 'Đàm', 'Bạch', 'Trương',
];

/** Tên đệm — the middle name, and the clearest gender marker a Vietnamese name carries. */
const MIDDLE_MAN = [
  'Văn', 'Hữu', 'Đức', 'Quang', 'Minh', 'Công', 'Bá', 'Xuân', 'Thế', 'Trọng',
  'Duy', 'Đình', 'Chí', 'Tấn', 'Ngọc', 'Anh', 'Gia', 'Khắc', 'Nhật', 'Việt',
];
const MIDDLE_WOMAN = [
  'Thị', 'Ngọc', 'Thu', 'Kim', 'Mỹ', 'Diệu', 'Hồng', 'Bích', 'Lan', 'Phương',
  'Thanh', 'Tuyết', 'Hoài', 'Cẩm', 'Xuân', 'Ánh', 'Khánh', 'Như', 'Quỳnh', 'Thuý',
];

/** Tên — the given name, which is what a person is actually called. */
const GIVEN_MAN = [
  'Hùng', 'Dũng', 'Cường', 'Kiệt', 'Tuấn', 'Sơn', 'Long', 'Bảo', 'Khôi', 'Trung',
  'Thắng', 'Nghĩa', 'Tài', 'Đạt', 'Phúc', 'Lộc', 'An', 'Bình', 'Chính', 'Đại',
  'Quyết', 'Toàn', 'Vinh', 'Khánh', 'Hiển', 'Trực', 'Cẩn', 'Nhân', 'Tráng', 'Uy',
  'Kiên', 'Trí', 'Hoà', 'Lễ', 'Tín', 'Mẫn', 'Thuận', 'Quý', 'Hiệp', 'Bằng',
  'Chương', 'Định', 'Hải', 'Nam', 'Phong', 'Thiện', 'Tuyên', 'Vĩ', 'Xuyên', 'Đôn',
];
const GIVEN_WOMAN = [
  'Hoa', 'Lan', 'Mai', 'Hương', 'Linh', 'Nga', 'Trang', 'Thảo', 'Yến', 'Nhung',
  'Hạnh', 'Quyên', 'Tuyết', 'Vân', 'Xuân', 'Diễm', 'Ngân', 'Thanh', 'Trâm', 'Loan',
  'Nguyệt', 'Phượng', 'Hiền', 'Duyên', 'Nhàn', 'Tú', 'Chi', 'Quỳnh', 'Như', 'Ánh',
  'Bích', 'Cúc', 'Đào', 'Giang', 'Hà', 'Khuê', 'Lệ', 'My', 'Oanh', 'Sương',
  'Trinh', 'Uyên', 'Vy', 'Yên', 'Nhi', 'Thuỳ', 'Kiều', 'Diệp', 'Hằng', 'Tuyền',
];

/**
 * Titles by office and sex.
 *
 * The women's titles are not the men's with a particle bolted on: `Nữ Tướng` (lady general)
 * and `Bà Nghè` (a woman holding the doctoral degree) are the forms the language actually
 * uses, and `Công Chúa` is reserved for the highest rarity because a princess is not a common
 * draw.
 */
const TITLES: Record<HeroType, { man: string[]; woman: string[] }> = {
  general: {
    man: ['Tướng Quân', 'Đô Đốc', 'Thái Úy', 'Kỵ Tướng', 'Thống Lĩnh', 'Đô Uý', 'Đề Đốc', 'Chỉ Huy Sứ', 'Tiết Chế'],
    woman: ['Nữ Tướng', 'Nữ Đô Đốc', 'Nữ Kiệt', 'Nữ Thống Lĩnh', 'Nữ Đề Đốc', 'Nữ Chỉ Huy'],
  },
  governor: {
    man: ['Trấn Thủ', 'Lý Trưởng', 'Quan Đốc', 'Tri Phủ', 'Huyện Doãn', 'An Phủ Sứ', 'Tri Châu', 'Đốc Đồng'],
    woman: ['Bà Trấn', 'Bà Quản', 'Nữ Quan', 'Bà Chánh', 'Bà Tri Châu', 'Nữ Đốc'],
  },
  minister: {
    man: ['Thượng Thư', 'Thái Sư', 'Học Sĩ', 'Ngự Sử', 'Hàn Lâm', 'Tế Tửu', 'Thị Lang', 'Đại Phu'],
    woman: ['Nữ Học Sĩ', 'Bà Nghè', 'Nữ Ngự Sử', 'Nữ Quan', 'Bà Tế Tửu', 'Nữ Thị Lang'],
  },
  agent: {
    man: ['Sứ Giả', 'Mật Thám', 'Do Thám', 'Thám Mã', 'Chánh Sứ', 'Hành Nhân', 'Tuần Thám'],
    woman: ['Nữ Sứ', 'Nữ Điệp', 'Nữ Thám', 'Nữ Chánh Sứ', 'Nữ Hành Nhân', 'Nữ Tuần Thám'],
  },
};

/** Reserved for Legendary draws — a princess should feel like one. */
const RARE_TITLES: Partial<Record<HeroType, { man: string[]; woman: string[] }>> = {
  agent: { man: ['Hoàng Thân'], woman: ['Công Chúa'] },
  general: { man: ['Đại Nguyên Soái'], woman: ['Nữ Đại Tướng'] },
};

/** Places a champion can be *of*, which is how the authored roster earns its flavour. */
const PLACES = [
  'Lam Sơn', 'Bạch Đằng', 'Vân Đồn', 'Hội An', 'Chi Lăng', 'Đông Đô', 'Hoa Lư', 'Thăng Long',
  'Vạn Kiếp', 'Tây Kết', 'Hàm Tử', 'Như Nguyệt', 'Ngọc Hồi', 'Đống Đa', 'Biên Ải', 'Cửa Việt',
  'Đại La', 'Cổ Loa', 'Phong Châu', 'Mê Linh', 'Luy Lâu', 'Tức Mặc', 'Thiên Trường', 'Lũng Nhai',
  'Chương Dương', 'Rạch Gầm', 'Nhật Tảo', 'Tốt Động', 'Chúc Động', 'Bình Than', 'Đồ Bàn', 'Nghệ An',
];

export interface NamedHero {
  name: string;
  sex: Hero['sex'];
}

/** Builds one champion's name from the pools above. `next` returns 0..1. */
export function makeHeroName(
  type: HeroType,
  sex: 'man' | 'woman',
  rarity: Hero['rarity'],
  next: () => number,
): string {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length) % items.length];
  const legendary = rarity === 'Legendary';
  const titlePool = (legendary && RARE_TITLES[type]?.[sex]?.length)
    ? [...RARE_TITLES[type]![sex], ...TITLES[type][sex]]
    : TITLES[type][sex];
  const title = pick(titlePool);
  const surname = pick(SURNAMES);
  const middle = pick(sex === 'woman' ? MIDDLE_WOMAN : MIDDLE_MAN);
  const given = pick(sex === 'woman' ? GIVEN_WOMAN : GIVEN_MAN);

  // Five shapes, weighted toward the long forms.
  //
  // Weighting matters more than pool size here. A `<title> <given>` name has only a few
  // hundred possibilities however many given names exist, so at a third of all draws it
  // produced most of the duplicates in the roster by itself — measured, 5,000 champions
  // yielded only 3,585 distinct names. The long forms carry the variety; the short ones are
  // kept because a roster of nothing but four-word names reads as a phone book.
  const shape = next();
  if (shape < 0.42) return `${title} ${surname} ${middle} ${given}`;   // Đô Đốc Lưu Xuân An
  if (shape < 0.62) return `${surname} ${middle} ${given}`;            // Trần Thị Lan
  if (shape < 0.80) return `${title} ${surname} ${given}`;             // Thái Sư Ngô Kiệt
  // No surname before a place: "Đào Như Nguyệt" reads as a person named after a battle.
  // The idiom is the title *of* the place — Đô Đốc Bạch Đằng — which is how the authored
  // roster already does it.
  if (shape < 0.92) return `${title} ${pick(PLACES)}`;                 // Tướng Quân Chi Lăng
  return `${title} ${middle} ${given}`;                                // Ngự Sử Đức Toàn
}

/** Eras a generated champion may be dressed in, weighted toward the mode's own centuries. */
export const GENERATED_ERAS: readonly HeroEra[] = ['ly', 'tran', 'tran', 'le', 'le', 'dinh', 'tayson', 'nguyen'];


/**
 * Real people out of the record.
 *
 * The combined names above are built from authentic components, but a champion who is simply
 * *Lý Thường Kiệt* lands differently — and a Vietnamese player recognising a name is worth
 * more than any amount of procedural variety. These are offered only at the top rarities, so
 * meeting one is an event rather than a coin toss, and each carries its own office, sex and
 * century so the portrait dresses them correctly.
 *
 * Each keeps the office the person actually held: Chu Văn An was a teacher and rector, not a
 * general, and drawing him as one would be worse than not having him at all.
 */
export interface RealFigure {
  name: string;
  sex: 'man' | 'woman';
  type: HeroType;
  era: HeroEra;
  /** Only offered at this rarity or above. */
  tier: 'Epic' | 'Legendary';
  monastic?: boolean;
}

export const REAL_FIGURES: readonly RealFigure[] = [
  // ── Đinh · Tiền Lê ──
  { name: 'Đinh Bộ Lĩnh', sex: 'man', type: 'general', era: 'dinh', tier: 'Legendary' },
  { name: 'Lê Hoàn', sex: 'man', type: 'general', era: 'dinh', tier: 'Legendary' },
  { name: 'Dương Vân Nga', sex: 'woman', type: 'minister', era: 'dinh', tier: 'Legendary' },
  { name: 'Nguyễn Bặc', sex: 'man', type: 'general', era: 'dinh', tier: 'Epic' },
  { name: 'Đinh Điền', sex: 'man', type: 'general', era: 'dinh', tier: 'Epic' },
  { name: 'Thiền sư Khuông Việt', sex: 'man', type: 'minister', era: 'dinh', tier: 'Epic', monastic: true },

  // ── Lý ──
  { name: 'Lý Thường Kiệt', sex: 'man', type: 'general', era: 'ly', tier: 'Legendary' },
  { name: 'Nguyên phi Ỷ Lan', sex: 'woman', type: 'governor', era: 'ly', tier: 'Legendary' },
  { name: 'Lý Chiêu Hoàng', sex: 'woman', type: 'minister', era: 'ly', tier: 'Legendary' },
  { name: 'Thiền sư Vạn Hạnh', sex: 'man', type: 'minister', era: 'ly', tier: 'Legendary', monastic: true },
  { name: 'Tông Đản', sex: 'man', type: 'general', era: 'ly', tier: 'Epic' },
  { name: 'Lê Văn Thịnh', sex: 'man', type: 'minister', era: 'ly', tier: 'Epic' },
  { name: 'Lý Kế Nguyên', sex: 'man', type: 'general', era: 'ly', tier: 'Epic' },

  // ── Trần ──
  { name: 'Trần Hưng Đạo', sex: 'man', type: 'general', era: 'tran', tier: 'Legendary' },
  { name: 'Trần Quang Khải', sex: 'man', type: 'general', era: 'tran', tier: 'Legendary' },
  { name: 'Huyền Trân công chúa', sex: 'woman', type: 'agent', era: 'tran', tier: 'Legendary' },
  { name: 'An Tư công chúa', sex: 'woman', type: 'agent', era: 'tran', tier: 'Legendary' },
  { name: 'Phạm Ngũ Lão', sex: 'man', type: 'general', era: 'tran', tier: 'Epic' },
  { name: 'Trần Nhật Duật', sex: 'man', type: 'general', era: 'tran', tier: 'Epic' },
  { name: 'Trần Khánh Dư', sex: 'man', type: 'general', era: 'tran', tier: 'Epic' },
  { name: 'Trần Bình Trọng', sex: 'man', type: 'general', era: 'tran', tier: 'Epic' },
  { name: 'Yết Kiêu', sex: 'man', type: 'agent', era: 'tran', tier: 'Epic' },
  { name: 'Dã Tượng', sex: 'man', type: 'agent', era: 'tran', tier: 'Epic' },
  { name: 'Trương Hán Siêu', sex: 'man', type: 'minister', era: 'tran', tier: 'Epic' },
  { name: 'Chu Văn An', sex: 'man', type: 'minister', era: 'tran', tier: 'Legendary' },
  { name: 'Thiền sư Pháp Loa', sex: 'man', type: 'minister', era: 'tran', tier: 'Epic', monastic: true },
  { name: 'Thiền sư Huyền Quang', sex: 'man', type: 'minister', era: 'tran', tier: 'Epic', monastic: true },

  // ── Lê ──
  { name: 'Lê Lợi', sex: 'man', type: 'general', era: 'le', tier: 'Legendary' },
  { name: 'Nguyễn Trãi', sex: 'man', type: 'minister', era: 'le', tier: 'Legendary' },
  { name: 'Nguyễn Xí', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Đinh Liệt', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Nguyễn Chích', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Ngô Sĩ Liên', sex: 'man', type: 'minister', era: 'le', tier: 'Epic' },
  { name: 'Lương Thế Vinh', sex: 'man', type: 'minister', era: 'le', tier: 'Epic' },
  { name: 'Thân Nhân Trung', sex: 'man', type: 'minister', era: 'le', tier: 'Epic' },
  { name: 'Nguyễn Thị Duệ', sex: 'woman', type: 'minister', era: 'le', tier: 'Legendary' },
  { name: 'Nguyễn Bỉnh Khiêm', sex: 'man', type: 'minister', era: 'le', tier: 'Legendary' },

  // ── Tây Sơn ──
  { name: 'Bùi Thị Xuân', sex: 'woman', type: 'general', era: 'tayson', tier: 'Legendary' },
  { name: 'Trần Quang Diệu', sex: 'man', type: 'general', era: 'tayson', tier: 'Epic' },
  { name: 'Ngô Văn Sở', sex: 'man', type: 'general', era: 'tayson', tier: 'Epic' },
  { name: 'Võ Văn Dũng', sex: 'man', type: 'general', era: 'tayson', tier: 'Epic' },
  { name: 'Ngô Thì Nhậm', sex: 'man', type: 'minister', era: 'tayson', tier: 'Epic' },

  // ── Nguyễn ──
  { name: 'Lê Quý Đôn', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Legendary' },
  { name: 'Phan Huy Chú', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Epic' },
  { name: 'Đoàn Thị Điểm', sex: 'woman', type: 'minister', era: 'nguyen', tier: 'Epic' },
  { name: 'Hồ Xuân Hương', sex: 'woman', type: 'agent', era: 'nguyen', tier: 'Legendary' },
  { name: 'Nguyễn Công Trứ', sex: 'man', type: 'governor', era: 'nguyen', tier: 'Epic' },
];
