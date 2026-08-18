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
  'Doãn', 'Hứa', 'Đàm', 'Bạch', 'Trương', 'Mạc', 'Lương', 'Chử', 'Đồng', 'Sử',
  'Trác', 'Bành', 'Thạch', 'Ưng', 'Tôn Thất', 'Nguyễn Phúc', 'Hồng', 'Lại', 'Cù', 'Triệu',
  'Uông', 'Khương', 'Nhữ', 'Phùng', 'Tăng', 'Đậu', 'Ông', 'Cấn', 'Sầm', 'Diệp',
];

/** Tên đệm — the middle name, and the clearest gender marker a Vietnamese name carries. */
const MIDDLE_MAN = [
  'Văn', 'Hữu', 'Đức', 'Quang', 'Minh', 'Công', 'Bá', 'Xuân', 'Thế', 'Trọng',
  'Duy', 'Đình', 'Chí', 'Tấn', 'Ngọc', 'Anh', 'Gia', 'Khắc', 'Nhật', 'Việt',
  'Đăng', 'Trung', 'Quốc', 'Sĩ', 'Tiến', 'Doãn', 'Cảnh', 'Thanh', 'Đại', 'Huy',
  'Nhân', 'Phúc', 'Hoài', 'Bảo', 'Trí', 'Vĩnh', 'Tường', 'Danh', 'Lương', 'Thượng',
];
const MIDDLE_WOMAN = [
  'Thị', 'Ngọc', 'Thu', 'Kim', 'Mỹ', 'Diệu', 'Hồng', 'Bích', 'Lan', 'Phương',
  'Thanh', 'Tuyết', 'Hoài', 'Cẩm', 'Xuân', 'Ánh', 'Khánh', 'Như', 'Quỳnh', 'Thuý',
  'Minh', 'Thuỳ', 'Hải', 'Nhật', 'Lệ', 'Đan', 'Trúc', 'Yên', 'Hà', 'Vân',
  'Tú', 'Gia', 'An', 'Bảo', 'Chi', 'Hạ', 'Khuê', 'Lâm', 'Mai', 'Trà',
];

/** Tên — the given name, which is what a person is actually called. */
const GIVEN_MAN = [
  'Hùng', 'Dũng', 'Cường', 'Kiệt', 'Tuấn', 'Sơn', 'Long', 'Bảo', 'Khôi', 'Trung',
  'Thắng', 'Nghĩa', 'Tài', 'Đạt', 'Phúc', 'Lộc', 'An', 'Bình', 'Chính', 'Đại',
  'Quyết', 'Toàn', 'Vinh', 'Khánh', 'Hiển', 'Trực', 'Cẩn', 'Nhân', 'Tráng', 'Uy',
  'Kiên', 'Trí', 'Hoà', 'Lễ', 'Tín', 'Mẫn', 'Thuận', 'Quý', 'Hiệp', 'Bằng',
  'Chương', 'Định', 'Hải', 'Nam', 'Phong', 'Thiện', 'Tuyên', 'Vĩ', 'Xuyên', 'Đôn',
  'Cảnh', 'Diễn', 'Duệ', 'Đảm', 'Giáp', 'Hạo', 'Hoằng', 'Huyên', 'Khiêm', 'Khoát',
  'Lãm', 'Liêm', 'Luân', 'Mậu', 'Nghiêm', 'Ngôn', 'Nhuận', 'Phác', 'Phiên', 'Quán',
  'Quýnh', 'Sách', 'Sĩ', 'Tá', 'Tế', 'Thái', 'Thâm', 'Thuyết', 'Tiềm', 'Tòng',
  'Trạch', 'Trản', 'Trứ', 'Tuân', 'Tuấn Kiệt', 'Tường', 'Ước', 'Vận', 'Viện', 'Vỹ',
  'Xán', 'Yển', 'Ất', 'Bích', 'Cẩm', 'Chấn', 'Đôn Hậu', 'Hoán', 'Kỳ', 'Lữ',
];
const GIVEN_WOMAN = [
  'Hoa', 'Lan', 'Mai', 'Hương', 'Linh', 'Nga', 'Trang', 'Thảo', 'Yến', 'Nhung',
  'Hạnh', 'Quyên', 'Tuyết', 'Vân', 'Xuân', 'Diễm', 'Ngân', 'Thanh', 'Trâm', 'Loan',
  'Nguyệt', 'Phượng', 'Hiền', 'Duyên', 'Nhàn', 'Tú', 'Chi', 'Quỳnh', 'Như', 'Ánh',
  'Bích', 'Cúc', 'Đào', 'Giang', 'Hà', 'Khuê', 'Lệ', 'My', 'Oanh', 'Sương',
  'Trinh', 'Uyên', 'Vy', 'Yên', 'Nhi', 'Thuỳ', 'Kiều', 'Diệp', 'Hằng', 'Tuyền',
  'Ái', 'Bảo Châu', 'Cầm', 'Châu', 'Dao', 'Diên', 'Dung', 'Đoan', 'Giao', 'Hảo',
  'Huệ', 'Hường', 'Khanh', 'Lam', 'Liên', 'Liễu', 'Lụa', 'Lý', 'Mận', 'Miên',
  'Ngà', 'Ngát', 'Nhã', 'Nhài', 'Nhạn', 'Phúc', 'Quế', 'Sen', 'Tâm', 'Thắm',
  'Thoa', 'Thuần', 'Tiên', 'Trà', 'Trúc', 'Tường Vi', 'Vinh', 'Xuyến', 'Ý', 'Ẩn',
  'Bạch Yến', 'Cát', 'Doanh', 'Đài', 'Hoàn', 'Lệ Chi', 'Minh Châu', 'Nhu', 'Thi', 'Tuệ',
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
    man: [
      'Tướng Quân', 'Đô Đốc', 'Thái Úy', 'Kỵ Tướng', 'Thống Lĩnh', 'Đô Uý', 'Đề Đốc', 'Chỉ Huy Sứ', 'Tiết Chế',
      'Đô Thống', 'Phó Tướng', 'Tiên Phong', 'Hổ Uy Tướng', 'Trấn Bắc Tướng', 'Bình Nam Tướng', 'Đại Đô Đốc',
      'Vệ Uý', 'Thiên Hộ', 'Bách Hộ', 'Đốc Trấn', 'Cai Cơ', 'Chưởng Cơ', 'Lãnh Binh', 'Suất Đội',
      'Đô Chỉ Huy', 'Thủy Sư Đề Đốc', 'Tổng Binh', 'Phòng Ngự Sứ', 'Kinh Lược Sứ', 'Tán Lý Quân Vụ',
    ],
    woman: [
      'Nữ Tướng', 'Nữ Đô Đốc', 'Nữ Kiệt', 'Nữ Thống Lĩnh', 'Nữ Đề Đốc', 'Nữ Chỉ Huy',
      'Nữ Tiên Phong', 'Nữ Lãnh Binh', 'Nữ Đô Thống', 'Nữ Vệ Uý', 'Nữ Tổng Binh', 'Bà Tướng',
      'Nữ Trấn Bắc', 'Nữ Cai Cơ', 'Nữ Suất Đội', 'Nữ Thủy Sư', 'Nữ Phó Tướng', 'Nữ Hổ Uy',
    ],
  },
  governor: {
    man: [
      'Trấn Thủ', 'Lý Trưởng', 'Quan Đốc', 'Tri Phủ', 'Huyện Doãn', 'An Phủ Sứ', 'Tri Châu', 'Đốc Đồng',
      'Tuyên Phủ Sứ', 'Đề Hình', 'Đốc Học', 'Chánh Tổng', 'Cai Bạ', 'Ký Lục', 'Tri Huyện', 'Đề Lĩnh',
      'Quan Đê Điều', 'Đốc Thị', 'Kinh Lược', 'Bố Chánh', 'Án Sát', 'Tuần Phủ', 'Tổng Đốc', 'Phủ Doãn',
      'Quan Đồn Điền', 'Đốc Vận', 'Chưởng Bạ', 'Xã Quan', 'Hương Trưởng', 'Quản Giáp',
    ],
    woman: [
      'Bà Trấn', 'Bà Quản', 'Nữ Quan', 'Bà Chánh', 'Bà Tri Châu', 'Nữ Đốc',
      'Bà Chánh Tổng', 'Bà Đề Lĩnh', 'Nữ Tri Huyện', 'Bà Hương Trưởng', 'Nữ Bố Chánh', 'Bà Cai Bạ',
      'Nữ Tuần Phủ', 'Bà Đốc Học', 'Nữ An Phủ', 'Bà Quản Giáp', 'Nữ Đốc Thị', 'Bà Xã Quan',
    ],
  },
  minister: {
    man: [
      'Thượng Thư', 'Thái Sư', 'Học Sĩ', 'Ngự Sử', 'Hàn Lâm', 'Tế Tửu', 'Thị Lang', 'Đại Phu',
      'Thái Phó', 'Thái Bảo', 'Thiếu Sư', 'Tư Đồ', 'Tư Không', 'Bộc Xạ', 'Trung Thư Lệnh',
      'Đại Học Sĩ', 'Đông Các', 'Tư Nghiệp', 'Giám Sát Ngự Sử', 'Đô Ngự Sử', 'Lang Trung',
      'Viên Ngoại Lang', 'Hiệu Thư', 'Thái Y', 'Tư Thiên Giám', 'Quốc Tử Giám Tế Tửu',
      'Hành Khiển', 'Nhập Nội', 'Bình Chương', 'Tham Tri',
    ],
    woman: [
      'Nữ Học Sĩ', 'Bà Nghè', 'Nữ Ngự Sử', 'Nữ Quan', 'Bà Tế Tửu', 'Nữ Thị Lang',
      'Lễ Nghi Học Sĩ', 'Nữ Thái Y', 'Bà Hàn Lâm', 'Nữ Đại Học Sĩ', 'Bà Tư Nghiệp', 'Nữ Lang Trung',
      'Nữ Hiệu Thư', 'Bà Giám Sát', 'Nữ Tham Tri', 'Bà Đông Các', 'Nữ Bộc Xạ', 'Cung Trung Giáo Tập',
    ],
  },
  agent: {
    man: [
      'Sứ Giả', 'Mật Thám', 'Do Thám', 'Thám Mã', 'Chánh Sứ', 'Hành Nhân', 'Tuần Thám',
      'Phó Sứ', 'Thông Sự', 'Tiếp Sứ', 'Tế Tác', 'Trinh Sát', 'Dịch Trạm', 'Liên Lạc',
      'Bang Tá', 'Thám Tử', 'Nội Ứng', 'Người Đưa Tin', 'Lữ Khách', 'Khách Thương',
      'Sứ Bộ', 'Giám Hộ Sứ', 'Tuyên Uý', 'Hầu Mệnh', 'Phi Kỵ',
    ],
    woman: [
      'Nữ Sứ', 'Nữ Điệp', 'Nữ Thám', 'Nữ Chánh Sứ', 'Nữ Hành Nhân', 'Nữ Tuần Thám',
      'Nữ Thông Sự', 'Bà Khách Thương', 'Nữ Tế Tác', 'Nữ Nội Ứng', 'Bà Lữ Khách', 'Nữ Trinh Sát',
      'Nữ Phó Sứ', 'Nữ Bang Tá', 'Cô Hàng Xén', 'Nữ Liên Lạc', 'Nữ Sứ Bộ', 'Nữ Tuyên Uý',
    ],
  },
};

/** Reserved for Legendary draws — a princess should feel like one. */
const RARE_TITLES: Partial<Record<HeroType, { man: string[]; woman: string[] }>> = {
  agent: { man: ['Hoàng Thân', 'Vương Tử'], woman: ['Công Chúa', 'Quận Chúa'] },
  general: { man: ['Đại Nguyên Soái', 'Quốc Công Tiết Chế'], woman: ['Nữ Đại Tướng', 'Đại Nữ Soái'] },
  minister: { man: ['Quốc Sư', 'Tể Tướng'], woman: ['Quốc Mẫu', 'Thái Phi'] },
  governor: { man: ['Quốc Công', 'Trấn Quốc Công'], woman: ['Quận Phu Nhân', 'Bà Chúa'] },
};

/** Places a champion can be *of*, which is how the authored roster earns its flavour. */
const PLACES = [
  'Lam Sơn', 'Bạch Đằng', 'Vân Đồn', 'Hội An', 'Chi Lăng', 'Đông Đô', 'Hoa Lư', 'Thăng Long',
  'Vạn Kiếp', 'Tây Kết', 'Hàm Tử', 'Như Nguyệt', 'Ngọc Hồi', 'Đống Đa', 'Biên Ải', 'Cửa Việt',
  'Đại La', 'Cổ Loa', 'Phong Châu', 'Mê Linh', 'Luy Lâu', 'Tức Mặc', 'Thiên Trường', 'Lũng Nhai',
  'Chương Dương', 'Rạch Gầm', 'Nhật Tảo', 'Tốt Động', 'Chúc Động', 'Bình Than', 'Đồ Bàn', 'Nghệ An',
  'Phố Hiến', 'Phú Xuân', 'Gia Định', 'Đông Kinh', 'Yên Tử', 'Côn Sơn', 'Kiếp Bạc', 'Đồ Sơn',
  'Lạng Sơn', 'Cao Bằng', 'Thanh Hoá', 'Sơn Tây', 'Kinh Bắc', 'Hải Dương', 'Nam Sách', 'An Bang',
  'Tuyên Quang', 'Hưng Hoá', 'Quy Nhơn', 'Thuận Hoá', 'Quảng Nam', 'Bố Chính', 'Nhật Lệ', 'Luỹ Thầy',
  'Trường Yên', 'Tam Điệp', 'Ninh Bình', 'Thiên Đức', 'Vạn Xuân', 'Đằng Châu', 'Bố Cái', 'Đường Lâm',
  'Sông Lô', 'Sông Thương', 'Sông Cầu', 'Sông Mã', 'Sông Gianh', 'Cửa Đại', 'Cửa Cấm', 'Cửa Lò',
  'Ải Nam Quan', 'Ải Chi Lăng', 'Đèo Ngang', 'Đèo Hải Vân', 'Núi Tản', 'Núi Chí Linh', 'Núi Dục Thuý',
  'Bình Định', 'Phú Yên', 'Diên Khánh', 'Hà Tiên', 'Mỹ Tho', 'Trấn Biên', 'Phiên An', 'Long Hồ',
  'Vĩnh Tế', 'Thất Sơn', 'Bảy Núi', 'Tây Đô', 'An Tôn', 'Xương Giang', 'Cần Trạm', 'Phố Cát',
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
  // ── Independence · Đinh · Tiền Lê ──
  { name: 'Ngô Quyền', sex: 'man', type: 'general', era: 'dinh', tier: 'Legendary' },
  { name: 'Đinh Bộ Lĩnh', sex: 'man', type: 'general', era: 'dinh', tier: 'Legendary' },
  { name: 'Lê Hoàn', sex: 'man', type: 'general', era: 'dinh', tier: 'Legendary' },
  { name: 'Dương Vân Nga', sex: 'woman', type: 'minister', era: 'dinh', tier: 'Legendary' },
  { name: 'Khúc Thừa Dụ', sex: 'man', type: 'governor', era: 'dinh', tier: 'Legendary' },
  { name: 'Dương Đình Nghệ', sex: 'man', type: 'general', era: 'dinh', tier: 'Epic' },
  { name: 'Nguyễn Bặc', sex: 'man', type: 'general', era: 'dinh', tier: 'Epic' },
  { name: 'Đinh Điền', sex: 'man', type: 'general', era: 'dinh', tier: 'Epic' },
  { name: 'Trịnh Tú', sex: 'man', type: 'general', era: 'dinh', tier: 'Epic' },
  { name: 'Lưu Cơ', sex: 'man', type: 'governor', era: 'dinh', tier: 'Epic' },
  { name: 'Phạm Cự Lạng', sex: 'man', type: 'general', era: 'dinh', tier: 'Epic' },
  { name: 'Đinh Liễn', sex: 'man', type: 'general', era: 'dinh', tier: 'Epic' },
  { name: 'Thiền sư Khuông Việt', sex: 'man', type: 'minister', era: 'dinh', tier: 'Epic', monastic: true },
  { name: 'Thiền sư Đỗ Pháp Thuận', sex: 'man', type: 'minister', era: 'dinh', tier: 'Epic', monastic: true },

  // ── Lý ──
  { name: 'Lý Thường Kiệt', sex: 'man', type: 'general', era: 'ly', tier: 'Legendary' },
  { name: 'Lý Công Uẩn', sex: 'man', type: 'general', era: 'ly', tier: 'Legendary' },
  { name: 'Nguyên phi Ỷ Lan', sex: 'woman', type: 'governor', era: 'ly', tier: 'Legendary' },
  { name: 'Lý Chiêu Hoàng', sex: 'woman', type: 'minister', era: 'ly', tier: 'Legendary' },
  { name: 'Thiền sư Vạn Hạnh', sex: 'man', type: 'minister', era: 'ly', tier: 'Legendary', monastic: true },
  { name: 'Lý Đạo Thành', sex: 'man', type: 'minister', era: 'ly', tier: 'Epic' },
  { name: 'Đào Cam Mộc', sex: 'man', type: 'general', era: 'ly', tier: 'Epic' },
  { name: 'Tông Đản', sex: 'man', type: 'general', era: 'ly', tier: 'Epic' },
  { name: 'Lê Văn Thịnh', sex: 'man', type: 'minister', era: 'ly', tier: 'Epic' },
  { name: 'Lý Kế Nguyên', sex: 'man', type: 'general', era: 'ly', tier: 'Epic' },
  { name: 'Lý Nhân Nghĩa', sex: 'man', type: 'minister', era: 'ly', tier: 'Epic' },
  { name: 'Mạc Hiển Tích', sex: 'man', type: 'minister', era: 'ly', tier: 'Epic' },
  { name: 'Thiền sư Không Lộ', sex: 'man', type: 'minister', era: 'ly', tier: 'Epic', monastic: true },
  { name: 'Thiền sư Từ Đạo Hạnh', sex: 'man', type: 'minister', era: 'ly', tier: 'Epic', monastic: true },
  { name: 'Ni sư Diệu Nhân', sex: 'woman', type: 'minister', era: 'ly', tier: 'Epic', monastic: true },

  // ── Trần · Hồ ──
  { name: 'Trần Hưng Đạo', sex: 'man', type: 'general', era: 'tran', tier: 'Legendary' },
  { name: 'Trần Quang Khải', sex: 'man', type: 'general', era: 'tran', tier: 'Legendary' },
  { name: 'Trần Thủ Độ', sex: 'man', type: 'minister', era: 'tran', tier: 'Legendary' },
  { name: 'Linh Từ quốc mẫu', sex: 'woman', type: 'minister', era: 'tran', tier: 'Legendary' },
  { name: 'Mạc Đĩnh Chi', sex: 'man', type: 'minister', era: 'tran', tier: 'Legendary' },
  { name: 'Trần Nhân Tông', sex: 'man', type: 'minister', era: 'tran', tier: 'Legendary', monastic: true },
  { name: 'Hồ Quý Ly', sex: 'man', type: 'minister', era: 'tran', tier: 'Legendary' },
  { name: 'Huyền Trân công chúa', sex: 'woman', type: 'agent', era: 'tran', tier: 'Legendary' },
  { name: 'An Tư công chúa', sex: 'woman', type: 'agent', era: 'tran', tier: 'Legendary' },
  { name: 'Chu Văn An', sex: 'man', type: 'minister', era: 'tran', tier: 'Legendary' },
  { name: 'Phạm Ngũ Lão', sex: 'man', type: 'general', era: 'tran', tier: 'Epic' },
  { name: 'Trần Nhật Duật', sex: 'man', type: 'general', era: 'tran', tier: 'Epic' },
  { name: 'Trần Khánh Dư', sex: 'man', type: 'general', era: 'tran', tier: 'Epic' },
  { name: 'Trần Bình Trọng', sex: 'man', type: 'general', era: 'tran', tier: 'Epic' },
  { name: 'Trần Quốc Toản', sex: 'man', type: 'general', era: 'tran', tier: 'Epic' },
  { name: 'Trần Khát Chân', sex: 'man', type: 'general', era: 'tran', tier: 'Epic' },
  { name: 'Hồ Nguyên Trừng', sex: 'man', type: 'general', era: 'tran', tier: 'Epic' },
  { name: 'Yết Kiêu', sex: 'man', type: 'agent', era: 'tran', tier: 'Epic' },
  { name: 'Dã Tượng', sex: 'man', type: 'agent', era: 'tran', tier: 'Epic' },
  { name: 'Đỗ Khắc Chung', sex: 'man', type: 'agent', era: 'tran', tier: 'Epic' },
  { name: 'Trương Hán Siêu', sex: 'man', type: 'minister', era: 'tran', tier: 'Epic' },
  { name: 'Lê Văn Hưu', sex: 'man', type: 'minister', era: 'tran', tier: 'Epic' },
  { name: 'Nguyễn Trung Ngạn', sex: 'man', type: 'minister', era: 'tran', tier: 'Epic' },
  { name: 'Phạm Sư Mạnh', sex: 'man', type: 'minister', era: 'tran', tier: 'Epic' },
  { name: 'Đoàn Nhữ Hài', sex: 'man', type: 'minister', era: 'tran', tier: 'Epic' },
  { name: 'Thiền sư Pháp Loa', sex: 'man', type: 'minister', era: 'tran', tier: 'Epic', monastic: true },
  { name: 'Thiền sư Huyền Quang', sex: 'man', type: 'minister', era: 'tran', tier: 'Epic', monastic: true },

  // ── Lê sơ · Mạc · Lê trung hưng ──
  { name: 'Lê Lợi', sex: 'man', type: 'general', era: 'le', tier: 'Legendary' },
  { name: 'Nguyễn Trãi', sex: 'man', type: 'minister', era: 'le', tier: 'Legendary' },
  { name: 'Lê Thánh Tông', sex: 'man', type: 'minister', era: 'le', tier: 'Legendary' },
  { name: 'Lê Lai', sex: 'man', type: 'general', era: 'le', tier: 'Legendary' },
  { name: 'Trần Nguyên Hãn', sex: 'man', type: 'general', era: 'le', tier: 'Legendary' },
  { name: 'Nguyễn Bỉnh Khiêm', sex: 'man', type: 'minister', era: 'le', tier: 'Legendary' },
  { name: 'Nguyễn Thị Duệ', sex: 'woman', type: 'minister', era: 'le', tier: 'Legendary' },
  { name: 'Mạc Đăng Dung', sex: 'man', type: 'general', era: 'le', tier: 'Legendary' },
  { name: 'Nguyễn Hoàng', sex: 'man', type: 'governor', era: 'le', tier: 'Legendary' },
  { name: 'Đào Duy Từ', sex: 'man', type: 'minister', era: 'le', tier: 'Legendary' },
  { name: 'Giang Văn Minh', sex: 'man', type: 'agent', era: 'le', tier: 'Legendary' },
  { name: 'Nguyễn Xí', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Đinh Liệt', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Nguyễn Chích', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Lưu Nhân Chú', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Phạm Văn Xảo', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Đặng Dung', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Nguyễn Cảnh Dị', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Nguyễn Hữu Cảnh', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Nguyễn Kim', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Trịnh Kiểm', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Trịnh Tùng', sex: 'man', type: 'general', era: 'le', tier: 'Epic' },
  { name: 'Ngô Sĩ Liên', sex: 'man', type: 'minister', era: 'le', tier: 'Epic' },
  { name: 'Lương Thế Vinh', sex: 'man', type: 'minister', era: 'le', tier: 'Epic' },
  { name: 'Thân Nhân Trung', sex: 'man', type: 'minister', era: 'le', tier: 'Epic' },
  { name: 'Vũ Hữu', sex: 'man', type: 'minister', era: 'le', tier: 'Epic' },
  { name: 'Lương Đắc Bằng', sex: 'man', type: 'minister', era: 'le', tier: 'Epic' },
  { name: 'Nguyễn Mộng Tuân', sex: 'man', type: 'minister', era: 'le', tier: 'Epic' },
  { name: 'Nguyễn Thị Lộ', sex: 'woman', type: 'minister', era: 'le', tier: 'Epic' },
  { name: 'Phùng Khắc Khoan', sex: 'man', type: 'agent', era: 'le', tier: 'Epic' },

  // ── Tây Sơn ──
  { name: 'Nguyễn Huệ', sex: 'man', type: 'general', era: 'tayson', tier: 'Legendary' },
  { name: 'Bùi Thị Xuân', sex: 'woman', type: 'general', era: 'tayson', tier: 'Legendary' },
  { name: 'Nguyễn Thiếp', sex: 'man', type: 'minister', era: 'tayson', tier: 'Legendary' },
  { name: 'Lê Ngọc Hân', sex: 'woman', type: 'minister', era: 'tayson', tier: 'Legendary' },
  { name: 'Nguyễn Nhạc', sex: 'man', type: 'general', era: 'tayson', tier: 'Epic' },
  { name: 'Nguyễn Lữ', sex: 'man', type: 'general', era: 'tayson', tier: 'Epic' },
  { name: 'Trần Quang Diệu', sex: 'man', type: 'general', era: 'tayson', tier: 'Epic' },
  { name: 'Ngô Văn Sở', sex: 'man', type: 'general', era: 'tayson', tier: 'Epic' },
  { name: 'Võ Văn Dũng', sex: 'man', type: 'general', era: 'tayson', tier: 'Epic' },
  { name: 'Nguyễn Văn Tuyết', sex: 'man', type: 'general', era: 'tayson', tier: 'Epic' },
  { name: 'Đặng Văn Long', sex: 'man', type: 'general', era: 'tayson', tier: 'Epic' },
  { name: 'Ngô Thì Nhậm', sex: 'man', type: 'minister', era: 'tayson', tier: 'Epic' },
  { name: 'Phan Huy Ích', sex: 'man', type: 'minister', era: 'tayson', tier: 'Epic' },
  { name: 'Trần Văn Kỷ', sex: 'man', type: 'minister', era: 'tayson', tier: 'Epic' },

  // ── Nguyễn ──
  { name: 'Lê Quý Đôn', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Legendary' },
  { name: 'Nguyễn Du', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Legendary' },
  { name: 'Nguyễn Tri Phương', sex: 'man', type: 'general', era: 'nguyen', tier: 'Legendary' },
  { name: 'Hoàng Diệu', sex: 'man', type: 'governor', era: 'nguyen', tier: 'Legendary' },
  { name: 'Lê Văn Duyệt', sex: 'man', type: 'governor', era: 'nguyen', tier: 'Legendary' },
  { name: 'Nguyễn Trường Tộ', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Legendary' },
  { name: 'Phan Đình Phùng', sex: 'man', type: 'general', era: 'nguyen', tier: 'Legendary' },
  { name: 'Hoàng Hoa Thám', sex: 'man', type: 'general', era: 'nguyen', tier: 'Legendary' },
  { name: 'Hồ Xuân Hương', sex: 'woman', type: 'agent', era: 'nguyen', tier: 'Legendary' },
  { name: 'Nguyễn Công Trứ', sex: 'man', type: 'governor', era: 'nguyen', tier: 'Epic' },
  { name: 'Thoại Ngọc Hầu', sex: 'man', type: 'governor', era: 'nguyen', tier: 'Epic' },
  { name: 'Trịnh Hoài Đức', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Epic' },
  { name: 'Nguyễn Văn Thành', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Epic' },
  { name: 'Phan Huy Chú', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Epic' },
  { name: 'Cao Bá Quát', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Epic' },
  { name: 'Nguyễn Đình Chiểu', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Epic' },
  { name: 'Đặng Huy Trứ', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Epic' },
  { name: 'Phan Thanh Giản', sex: 'man', type: 'minister', era: 'nguyen', tier: 'Epic' },
  { name: 'Đoàn Thị Điểm', sex: 'woman', type: 'minister', era: 'nguyen', tier: 'Epic' },
  { name: 'Bà Huyện Thanh Quan', sex: 'woman', type: 'minister', era: 'nguyen', tier: 'Epic' },
  { name: 'Trương Định', sex: 'man', type: 'general', era: 'nguyen', tier: 'Epic' },
  { name: 'Nguyễn Trung Trực', sex: 'man', type: 'general', era: 'nguyen', tier: 'Epic' },
  { name: 'Tôn Thất Thuyết', sex: 'man', type: 'general', era: 'nguyen', tier: 'Epic' },
  { name: 'Nguyễn Thiện Thuật', sex: 'man', type: 'general', era: 'nguyen', tier: 'Epic' },
  { name: 'Nguyễn Hữu Huân', sex: 'man', type: 'general', era: 'nguyen', tier: 'Epic' },
];
