import type { HeroEra } from '../../state/types';

/**
 * The real record, as structure only.
 *
 * Every word the History page prints lives in `i18n/history/` or in the bios the roster already
 * carries. What is here is the scaffolding those words hang on: which centuries there are, who
 * reigned in them, when a person lived, and which real episode a Chronicle story came out of.
 *
 * The rule the page is written to, taken from the design doc that started the Chronicle: say what
 * happened, then say what the game made of it. A player should be able to tell the two apart.
 */

/**
 * Who actually held the country during an age.
 *
 * The single most important fact on the timeline, and the one a row of identical cards hid
 * completely: well over a thousand of these years were not self-rule at all.
 *
 * Two values, never three. There was a `mixed` for ages that began Vietnamese and ended occupied,
 * and it was a fudge — it filed the Hồ together with the twenty years of Ming rule that followed
 * them, and the Nguyễn together with the French protectorate. Those are not one age with a
 * complicated status; they are two ages, and the list below separates them. An age that cannot be
 * given one honest answer here is an age that has been drawn at the wrong granularity.
 */
export type EraRule = 'self' | 'foreign';

export interface HistoryEra {
  id: string;
  /** Negative years are BC. Displayed through `formatYear`, never printed raw. */
  from: number;
  to: number;
  /**
   * The wardrobe era this maps to, where one exists. Four of the eleven have no `HeroEra` — the
   * portrait system starts at Đinh, and saying so is more honest than inventing a bucket.
   */
  heroEra?: HeroEra;
  /** `KINGS` slugs, in reign order. The hero template for each is `real-<slug>`. */
  rulerSlugs: readonly string[];
  rule: EraRule;
}

export const HISTORY_ERAS: readonly HistoryEra[] = [
  { id: 'hong-bang', from: -2879, to: -258, rulerSlugs: [], rule: 'self' },
  { id: 'au-lac', from: -257, to: -179, rulerSlugs: [], rule: 'self' },
  // Triệu Đà's Nam Việt. Filed as foreign rule, which is a position and is said out loud on the
  // card: the Đại Việt sử ký toàn thư counted the Triệu as a legitimate dynasty of this country,
  // and modern scholarship counts 179 BC as a conquest. The page takes the second reading and
  // prints the first beside it.
  { id: 'nam-viet', from: -179, to: -111, rulerSlugs: [], rule: 'foreign' },
  { id: 'bac-thuoc', from: -111, to: 938, rulerSlugs: ['trung-vuong', 'ly-nam-de', 'mai-hac-de', 'phung-hung'], rule: 'foreign' },
  { id: 'ngo-dinh-le', from: 939, to: 1009, heroEra: 'dinh', rulerSlugs: ['ngo-quyen', 'dinh-bo-linh', 'le-dai-hanh'], rule: 'self' },
  {
    id: 'ly',
    from: 1009,
    to: 1225,
    heroEra: 'ly',
    rulerSlugs: ['ly-thai-to', 'ly-thai-tong', 'ly-thanh-tong', 'ly-nhan-tong', 'ly-chieu-hoang'],
    rule: 'self',
  },
  {
    id: 'tran',
    from: 1225,
    to: 1400,
    heroEra: 'tran',
    rulerSlugs: ['tran-thai-tong', 'tran-thanh-tong', 'tran-nhan-tong', 'tran-minh-tong'],
    rule: 'self',
  },
  { id: 'ho', from: 1400, to: 1407, rulerSlugs: [], rule: 'self' },
  { id: 'thuoc-minh', from: 1407, to: 1427, rulerSlugs: [], rule: 'foreign' },
  { id: 'le-so', from: 1428, to: 1527, heroEra: 'le', rulerSlugs: ['le-thai-to', 'le-thanh-tong'], rule: 'self' },
  { id: 'phan-tranh', from: 1527, to: 1777, heroEra: 'le', rulerSlugs: ['mac-dang-dung', 'trinh-kiem', 'nguyen-hoang'], rule: 'self' },
  { id: 'tay-son', from: 1778, to: 1802, heroEra: 'tayson', rulerSlugs: ['quang-trung'], rule: 'self' },
  { id: 'nguyen', from: 1802, to: 1883, heroEra: 'nguyen', rulerSlugs: ['gia-long', 'minh-mang'], rule: 'self' },
  { id: 'phap-thuoc', from: 1884, to: 1945, rulerSlugs: [], rule: 'foreign' },
];

/**
 * When each authored champion actually lived, keyed by hero template id.
 *
 * Numerals only, so one table serves both languages — the surrounding sentence is translated, the
 * dates are not. A `?` is the record's own answer and is printed as such; an id absent from this
 * table gets "dates uncertain" instead of a guess. Dã Tượng and Tông Đản are in the annals by name
 * and by deed and nowhere by year, and inventing one for them would be the exact failure this page
 * exists to avoid.
 */
export const FIGURE_DATES: Record<string, string> = {
  'real-trung-vuong': '?–43',
  'real-ly-nam-de': '503–548',
  'real-mai-hac-de': '?–722',
  'real-phung-hung': '?–791',
  'real-khuc-thua-du': '?–907',
  'real-ngo-quyen': '897–944',
  'real-dinh-bo-linh': '924–979',
  'real-le-dai-hanh': '941–1005',
  'real-van-hanh': '?–1018',
  'real-ly-thai-to': '974–1028',
  'real-ly-thai-tong': '1000–1054',
  'real-ly-thanh-tong': '1023–1072',
  'real-ly-thuong-kiet': '1019–1105',
  'real-ly-nhan-tong': '1066–1128',
  'real-y-lan': '?–1117',
  'real-ly-chieu-hoang': '1218–1278',
  'real-tran-thai-tong': '1218–1277',
  'real-tran-thu-do': '1194–1264',
  'real-tran-thanh-tong': '1240–1290',
  'real-tran-nhan-tong': '1258–1308',
  'real-tran-minh-tong': '1300–1357',
  'real-tran-hung-dao': '1228–1300',
  'real-tran-quang-khai': '1241–1294',
  'real-tran-nhat-duat': '1255–1330',
  'real-tran-khanh-du': '?–1340',
  'real-pham-ngu-lao': '1255–1320',
  'real-yet-kieu': '1242–1302',
  'real-huyen-tran': '1287–1340',
  'real-chu-van-an': '1292–1370',
  'real-le-loi': '1385–1433',
  'real-le-thai-to': '1385–1433',
  'real-nguyen-trai': '1380–1442',
  'real-nguyen-xi': '1397–1465',
  'real-ngo-si-lien': '1400–1497',
  'real-luong-the-vinh': '1441–1496',
  'real-le-thanh-tong': '1442–1497',
  'real-mac-dang-dung': '1483–1541',
  'real-nguyen-binh-khiem': '1491–1585',
  'real-trinh-kiem': '1503–1570',
  'real-nguyen-hoang': '1525–1613',
  'real-nguyen-thi-due': '1574–1654',
  'real-doan-thi-diem': '1705–1749',
  'real-le-quy-don': '1726–1784',
  'real-quang-trung': '1753–1792',
  'real-gia-long': '1762–1820',
  'real-ho-xuan-huong': '1772–1822',
  'real-nguyen-cong-tru': '1778–1858',
  'real-bui-thi-xuan': '?–1802',
  'real-minh-mang': '1791–1841',
};

/**
 * The episode each Chronicle story came out of, keyed by story template id.
 *
 * A parallel table rather than a field on `StoryTemplate`: template ids are an append-only
 * save-compat contract and the story engine has no business carrying editorial metadata. Numerals
 * and proper nouns only — the note that explains them is translated, this is not.
 *
 * A story id missing here still lists; it simply shows no date. Nine of these are inventions with
 * no single source (a plague, a flood, a road nobody watches) and are honestly left out.
 */
export const STORY_ANCHORS: Record<string, string> = {
  'reed-banner': '968 · Đinh Bộ Lĩnh',
  'goose-feathers': '~179 TCN · Mỵ Châu · Trọng Thủy',
  'river-stakes': '938 · 1288 · Bạch Đằng',
  'dien-hong': '1284 · Hội nghị Diên Hồng',
  orange: '1285 · Trần Quốc Toản',
  granaries: '1400 · Hồ Quý Ly',
  'sixty-five-citadels': '40–43 · Hai Bà Trưng',
  'ride-the-wind': '248 · Bà Triệu',
  substitution: '1419 · Lê Lai',
  'borrowed-sword': '1428 · Hồ Hoàn Kiếm',
  slandered: '1597 · Yi Sun-sin',
  trusted: '1582 · Honnō-ji',
  assembly: '1284 · Hội nghị Diên Hồng',
  'rice-riot': '532 · Nika',
  'five-days': '1789 · Quang Trung',
  'ghost-south': '1285 · Trần Bình Trọng',
  'without-slaughter': '1427 · Nguyễn Trãi',
  delayer: '217 TCN · Fabius Maximus',
  'dai-cao': '1428 · Bình Ngô đại cáo',
  'chieu-doi-do': '1010 · Chiếu dời đô',
  'nam-quoc': '1077 · Nam quốc sơn hà',
  'hich-tuong-si': '~1284 · Hịch tướng sĩ',
  'chi-lang': '1427 · Ải Chi Lăng',
  'than-toc': '1789 · Thần tốc',
  'tien-phat': '1075 · Tiên phát chế nhân',
  'hai-ba-trung': '40–43 · Hai Bà Trưng',
  'ho-guom': '1428 · Hồ Gươm',
  'no-than': '~208 TCN · Nỏ thần Cổ Loa',
  'yet-kieu': '1288 · Yết Kiêu',
  'van-don': '1288 · Vân Đồn',
  'paper-money': '1400 · Thông bảo hội sao',
  'luy-thay': '1631 · Lũy Thầy',
  'van-mieu': '1070–1075 · Văn Miếu',
  'thu-do': '1258 · Trần Thủ Độ',
  'binh-trong': '1285 · Trần Bình Trọng',
  'khuc-thua-du': '905 · Khúc Thừa Dụ',
  'che-bong-nga': '1371–1390 · Chế Bồng Nga',
};

/**
 * The words the game uses without translating them, in the order a player meets them.
 *
 * Prose for each is `terms.<id>.title` and `terms.<id>.body` in `i18n/history`.
 */
export const GLOSSARY_TERMS: readonly string[] = [
  'dai-viet',
  'thien-menh',
  'su-ky',
  'thang-long',
  'hoa-lu',
  'phu-xuan',
  'chieu',
  'quan-tran',
  'thai-uy',
  'do-doc',
  'kinh-luoc-su',
  'trang-nguyen',
  'van-mieu',
  'nom',
  'bac-thuoc',
  'chiem-thanh',
  'co-ngu-sac',
  'dong-ho',
  'tet',
  'de-vuong',
  'lang-xa',
  'de-dieu',
  'dai-cao',
  'hich',
];

/**
 * Where a champion is filed on the History page, when the dates alone would file them wrong.
 *
 * The page groups people by the era their death year falls in, which is right for forty-nine of
 * the fifty-one — a ruler dies in his own dynasty. Lê Quý Đôn is the exception the rule needs: he
 * served the Lê–Trịnh court his whole life and died in 1784, six years after the Tây Sơn rising
 * starts this list's clock, so the arithmetic would seat a Trịnh minister under a dynasty he never served.
 *
 * Wardrobe era (`Hero.era`) is not usable for this. It has six buckets against eleven ages, so it
 * puts Trưng Trắc — who died in 43 — under Ngô · Đinh · Tiền Lê, and files everyone from 1428 to
 * 1777 in one heap.
 */
export const FIGURE_ERA_OVERRIDE: Record<string, string> = {
  'real-le-quy-don': 'phan-tranh',
};

/** The year a figure is filed under: the last number in their dates. `undefined` when unknown. */
export function figureYear(heroId: string): number | undefined {
  const dates = FIGURE_DATES[heroId];
  if (!dates) {
    return undefined;
  }
  const match = dates.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : undefined;
}

/**
 * A named section of one tab: a heading you can shut, and the entries that live under it.
 *
 * The page was five tabs of flat list, and two of them ran to forty-eight and fifty-one rows. A
 * reader looking for the Bạch Đằng stakes had to scroll past the Nika riots to find them, and a
 * reader who wanted nothing in particular had no way to see what was on offer without reading all
 * of it. Grouping is what turns a list into a table of contents: shut, the tab is six or seven
 * lines saying what kinds of thing are in here; open, it is the same list it always was.
 *
 * `ids` is a reading order as well as a membership list, so a group can put its keystone entry
 * first rather than wherever the underlying catalogue happened to register it.
 */
export interface HistoryGroup {
  id: string;
  ids: readonly string[];
}

/**
 * The ages, gathered into periods — and gathered so that no period has to lie about who held the
 * country.
 *
 * Every group here is *rule-homogeneous* on purpose. A shut period draws one node on the timeline
 * rail in one colour, and the whole point of that colour is that it answers "was this us?" without
 * a caption. Group the Hồ with the twenty years of Ming rule that followed them and the node has
 * no honest colour to be — which is the same reason `EraRule` has two values and not three. Two of
 * these periods are one age long for exactly that reason, and a period of one is a cheap price for
 * a rail that never fudges.
 */
export const ERA_PERIODS: readonly HistoryGroup[] = [
  { id: 'origins', ids: ['hong-bang', 'au-lac'] },
  { id: 'northern-rule', ids: ['nam-viet', 'bac-thuoc'] },
  { id: 'restored', ids: ['ngo-dinh-le', 'ly', 'tran', 'ho'] },
  { id: 'ming', ids: ['thuoc-minh'] },
  { id: 'later', ids: ['le-so', 'phan-tranh', 'tay-son', 'nguyen'] },
  { id: 'colonial', ids: ['phap-thuoc'] },
];

/**
 * The Chronicle's episodes, sorted by what kind of thing happened.
 *
 * Not by date, and not by dynasty. Both were tried on paper and both scatter the entries a reader
 * actually wants side by side: Bạch Đằng happened twice three hundred and fifty years apart, and
 * the two tellings of Diên Hồng — one from the throne, one from the floor — would sit in the same
 * century and still not sit together. What these entries share is a *behaviour*, which is the same
 * axis the stories themselves were written on.
 *
 * `world` is the group that earns the scheme: five episodes that are Korean, Japanese, Roman,
 * Byzantine and Cham. They were always marked as not ours inside their own prose, where you had to
 * open one to find out. Now they are shut behind a heading that says it.
 */
export const STORY_GROUPS: readonly HistoryGroup[] = [
  { id: 'throne', ids: ['reed-banner', 'khuc-thua-du', 'no-heir', 'thirteenth'] },
  {
    id: 'campaign',
    ids: [
      'river-stakes', 'sixty-five-citadels', 'hai-ba-trung', 'ride-the-wind', 'tien-phat',
      'chi-lang', 'van-don', 'yet-kieu', 'five-days', 'than-toc', 'without-slaughter', 'che-bong-nga',
    ],
  },
  {
    id: 'nerve',
    ids: ['dien-hong', 'assembly', 'orange', 'thu-do', 'ghost-south', 'binh-trong', 'substitution', 'eat-together'],
  },
  { id: 'words', ids: ['nam-quoc', 'hich-tuong-si', 'dai-cao', 'chieu-doi-do'] },
  {
    id: 'state',
    ids: ['granaries', 'paper-money', 'counting-house', 'unpaid', 'the-dykes', 'salt-road', 'sickness', 'luy-thay', 'van-mieu'],
  },
  { id: 'legend', ids: ['goose-feathers', 'no-than', 'thanh-giong', 'mountain-water', 'borrowed-sword', 'ho-guom'] },
  { id: 'world', ids: ['slandered', 'trusted', 'delayer', 'rice-riot', 'cham-engineer'] },
];

/**
 * The glossary, in four drawers.
 *
 * Twenty-four terms in the order a player meets them is the right order for a first read and the
 * wrong one for a second: somebody who has just seen "Thái úy" on a hero card is looking for the
 * offices, not for the sixth word on a list. Filed by what kind of word it is instead.
 */
export const TERM_GROUPS: readonly HistoryGroup[] = [
  { id: 'land', ids: ['dai-viet', 'thang-long', 'hoa-lu', 'phu-xuan', 'quan-tran', 'lang-xa', 'de-dieu', 'bac-thuoc', 'chiem-thanh'] },
  { id: 'court', ids: ['thien-menh', 'de-vuong', 'chieu', 'thai-uy', 'do-doc', 'kinh-luoc-su'] },
  { id: 'letters', ids: ['su-ky', 'van-mieu', 'trang-nguyen', 'nom', 'dai-cao', 'hich'] },
  { id: 'life', ids: ['tet', 'dong-ho', 'co-ngu-sac'] },
];

/**
 * Whatever the groups above forgot, in catalogue order.
 *
 * A hand-written grouping goes stale the moment somebody registers a fifty-second story, and the
 * failure mode is silent: the entry simply stops appearing on a page whose entire job is being
 * complete about the record. So the page never renders the groups alone — it renders them and then
 * this, under a heading that says these have not been filed yet. `verify-history.mjs` asserts the
 * remainder is empty, so the honest fallback shows up as a failing check rather than as a heading
 * nobody meant to ship.
 */
export function ungroupedIds(groups: readonly HistoryGroup[], all: readonly string[]): string[] {
  const filed = new Set(groups.flatMap((group) => group.ids));
  return all.filter((id) => !filed.has(id));
}
