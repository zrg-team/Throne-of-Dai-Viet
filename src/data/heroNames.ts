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
];

/** Tên đệm — the middle name, and the clearest gender marker a Vietnamese name carries. */
const MIDDLE_MAN = ['Văn', 'Hữu', 'Đức', 'Quang', 'Minh', 'Công', 'Bá', 'Xuân', 'Thế', 'Trọng', 'Duy', 'Đình', 'Chí', 'Tấn', 'Ngọc'];
const MIDDLE_WOMAN = ['Thị', 'Ngọc', 'Thu', 'Kim', 'Mỹ', 'Diệu', 'Hồng', 'Bích', 'Lan', 'Phương', 'Thanh', 'Tuyết', 'Hoài', 'Cẩm', 'Xuân'];

/** Tên — the given name, which is what a person is actually called. */
const GIVEN_MAN = [
  'Hùng', 'Dũng', 'Cường', 'Kiệt', 'Tuấn', 'Sơn', 'Long', 'Bảo', 'Khôi', 'Trung',
  'Thắng', 'Nghĩa', 'Tài', 'Đạt', 'Phúc', 'Lộc', 'An', 'Bình', 'Chính', 'Đại',
  'Quyết', 'Toàn', 'Vinh', 'Khánh', 'Hiển', 'Trực', 'Cẩn', 'Nhân', 'Tráng', 'Uy',
];
const GIVEN_WOMAN = [
  'Hoa', 'Lan', 'Mai', 'Hương', 'Linh', 'Nga', 'Trang', 'Thảo', 'Yến', 'Nhung',
  'Hạnh', 'Quyên', 'Tuyết', 'Vân', 'Xuân', 'Diễm', 'Ngân', 'Thanh', 'Trâm', 'Loan',
  'Nguyệt', 'Phượng', 'Hiền', 'Duyên', 'Nhàn', 'Tú', 'Chi', 'Quỳnh', 'Như', 'Ánh',
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
    man: ['Tướng Quân', 'Đô Đốc', 'Thái Úy', 'Kỵ Tướng', 'Thống Lĩnh', 'Đô Uý'],
    woman: ['Nữ Tướng', 'Nữ Đô Đốc', 'Nữ Kiệt', 'Nữ Thống Lĩnh'],
  },
  governor: {
    man: ['Trấn Thủ', 'Lý Trưởng', 'Quan Đốc', 'Tri Phủ', 'Huyện Doãn'],
    woman: ['Bà Trấn', 'Bà Quản', 'Nữ Quan', 'Bà Chánh'],
  },
  minister: {
    man: ['Thượng Thư', 'Thái Sư', 'Học Sĩ', 'Ngự Sử', 'Hàn Lâm'],
    woman: ['Nữ Học Sĩ', 'Bà Nghè', 'Nữ Ngự Sử', 'Nữ Quan'],
  },
  agent: {
    man: ['Sứ Giả', 'Mật Thám', 'Do Thám', 'Thám Mã'],
    woman: ['Nữ Sứ', 'Nữ Điệp', 'Bà Mối', 'Nữ Thám'],
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

  // Three shapes, so a roster does not read as one template repeated: the full personal name,
  // the title with a given name, and the title with a place.
  const shape = next();
  if (shape < 0.45) return `${title} ${surname} ${middle} ${given}`;
  if (shape < 0.78) return `${title} ${given}`;
  return `${title} ${pick(PLACES)}`;
}

/** Eras a generated champion may be dressed in, weighted toward the mode's own centuries. */
export const GENERATED_ERAS: readonly HeroEra[] = ['ly', 'tran', 'tran', 'le', 'le', 'dinh', 'tayson', 'nguyen'];
