import type { HistoryCatalog } from './index';

/**
 * The headings a tab is shut into, and the one line under each that says what is behind it.
 *
 * A heading with a count and nothing else makes a reader open all seven to find out which one they
 * wanted. The note is there so the shut page is itself readable — it is the difference between a
 * table of contents and a row of drawer handles.
 *
 * Deliberately short. These are read *while scanning*, not while reading, and a heading whose note
 * wraps to four lines has stopped being a heading.
 */

export const groupsEn: HistoryCatalog = {
  'groups.eras.origins.title': 'Legend, and the first state',
  'groups.eras.origins.note':
    'The Hùng kings as the annals tell them, and Âu Lạc — down to the fall of Cổ Loa.',
  'groups.eras.northern-rule.title': 'A thousand years under the north',
  'groups.eras.northern-rule.note':
    'Triệu Đà to Ngô Quyền: the longest stretch on this rail, and none of it self-rule. The risings belong inside it, not instead of it.',
  'groups.eras.restored.title': 'Independence, and Đại Việt',
  'groups.eras.restored.note':
    'Ngô, Đinh, Tiền Lê, Lý, Trần, Hồ — four and a half centuries the country ran itself, and the ages most of this game is set in.',
  'groups.eras.ming.title': 'Twenty years of Ming rule',
  'groups.eras.ming.note':
    'Short, and kept on its own: the Hồ reforms and the occupation that answered them are two ages, not one age with a complicated status.',
  'groups.eras.later.title': 'Lê, the lords, Tây Sơn, Nguyễn',
  'groups.eras.later.note':
    'Lê Lợi’s restoration, two and a half centuries of one country under two courts, and the last reunification.',
  'groups.eras.colonial.title': 'The French protectorate',
  'groups.eras.colonial.note':
    'Where this page stops. The dynasty lasted on paper for sixty more years; the mandate did not.',

  'groups.stories.throne.title': 'Founding, and the throne',
  'groups.stories.throne.note': 'How the country got made, and how it changed hands.',
  'groups.stories.campaign.title': 'The campaigns',
  'groups.stories.campaign.note':
    'The invasions, and the things that turned them back — a tide, a pass, a grain fleet, a forty-day march.',
  'groups.stories.nerve.title': 'The nerve it took',
  'groups.stories.nerve.note':
    'Moments when somebody refused: at the war council, in front of the throne, or with the offer already in hand.',
  'groups.stories.words.title': 'Words that did the work',
  'groups.stories.words.note':
    'Four pieces of writing that moved a capital, held a river, shamed an officer corps and ended a war.',
  'groups.stories.state.title': 'Running a country',
  'groups.stories.state.note':
    'Tax, dykes, salt, paper money, plague and pay. Most of what a dynasty did was arithmetic.',
  'groups.stories.legend.title': 'Legend',
  'groups.stories.legend.note':
    'What the annals do not carry and the country tells anyway — and, twice, what the spade later turned up.',
  'groups.stories.world.title': 'Not ours',
  'groups.stories.world.note':
    'Five from Korea, Japan, Rome, Byzantium and Champa, kept because the behaviour is universal where the names are not.',

  'groups.terms.land.title': 'The country, its capitals and its borders',
  'groups.terms.land.note':
    'The names the realm carried, the cities it was governed from, and the land underneath them.',
  'groups.terms.court.title': 'The court and its offices',
  'groups.terms.court.note':
    'Who ruled, what they were styled, and which titles the game hands to a general.',
  'groups.terms.letters.title': 'Letters and the examinations',
  'groups.terms.letters.note':
    'The script, the annals, the temple of literature, and the two written forms with entries of their own.',
  'groups.terms.life.title': 'Life and custom',
  'groups.terms.life.note':
    'The three that are not politics: the new year, the prints this game is drawn from, and the banner over a village at peace.',

  'groups.other.title': 'Not filed yet',
  'groups.other.note':
    'Added to the game more recently than the sections on this page were written.',
};

export const groupsVi: HistoryCatalog = {
  'groups.eras.origins.title': 'Buổi đầu dựng nước',
  'groups.eras.origins.note':
    'Các vua Hùng như chính sử chép, và nhà nước Âu Lạc — cho đến khi Cổ Loa thất thủ.',
  'groups.eras.northern-rule.title': 'Nghìn năm Bắc thuộc',
  'groups.eras.northern-rule.note':
    'Từ Triệu Đà đến Ngô Quyền: quãng dài nhất trên trục này, và không có năm nào tự chủ. Các cuộc khởi nghĩa nằm trong đó, chứ không thay được nó.',
  'groups.eras.restored.title': 'Tự chủ và Đại Việt',
  'groups.eras.restored.note':
    'Ngô, Đinh, Tiền Lê, Lý, Trần, Hồ — bốn thế kỷ rưỡi nước tự cầm lấy mình, và cũng là thời mà phần lớn trò chơi này lấy làm bối cảnh.',
  'groups.eras.ming.title': 'Hai mươi năm thuộc Minh',
  'groups.eras.ming.note':
    'Ngắn, nhưng để riêng: cải cách nhà Hồ và cuộc đô hộ đáp lại nó là hai thời, không phải một thời khó gọi tên.',
  'groups.eras.later.title': 'Lê · chúa · Tây Sơn · Nguyễn',
  'groups.eras.later.note':
    'Lê Lợi khôi phục, hai thế kỷ rưỡi một nước dưới hai triều, và lần thống nhất cuối cùng.',
  'groups.eras.colonial.title': 'Pháp thuộc',
  'groups.eras.colonial.note':
    'Chỗ trang này dừng lại. Triều đình còn trên giấy thêm sáu mươi năm; quyền tự quyết thì không.',

  'groups.stories.throne.title': 'Dựng nước và ngôi báu',
  'groups.stories.throne.note': 'Nước được lập ra thế nào, và ngôi vua chuyển tay ra sao.',
  'groups.stories.campaign.title': 'Trận mạc',
  'groups.stories.campaign.note':
    'Những lần giặc sang, và những thứ đã đẩy lui họ — một con nước, một cửa ải, một đoàn thuyền lương, một cuộc hành quân bốn mươi ngày.',
  'groups.stories.nerve.title': 'Khí tiết',
  'groups.stories.nerve.note':
    'Những lúc có người từ chối: giữa hội nghị, trước ngai vàng, hoặc khi lời chiêu hàng đã đưa tận tay.',
  'groups.stories.words.title': 'Lời tuyên',
  'groups.stories.words.note':
    'Bốn áng văn đã dời một kinh đô, giữ một khúc sông, làm cả hàng tướng hổ thẹn, và kết thúc một cuộc chiến.',
  'groups.stories.state.title': 'Việc nước',
  'groups.stories.state.note':
    'Thuế, đê, muối, tiền giấy, dịch bệnh và lương lính. Phần lớn việc của một triều đại là số học.',
  'groups.stories.legend.title': 'Truyền thuyết',
  'groups.stories.legend.note':
    'Chuyện chính sử không chép mà cả nước vẫn kể — và có hai chuyện về sau lưỡi cuốc đã đào lên được.',
  'groups.stories.world.title': 'Ngoài cõi',
  'groups.stories.world.note':
    'Năm tích của Triều Tiên, Nhật Bản, La Mã, Đông La Mã và Chiêm Thành, giữ lại vì lối hành xử thì ở đâu cũng vậy, dù cái tên thì không.',

  'groups.terms.land.title': 'Nước, kinh đô và bờ cõi',
  'groups.terms.land.note':
    'Những cái tên nước đã mang, những kinh đô đã cai trị từ đó, và phần đất đai bên dưới.',
  'groups.terms.court.title': 'Triều đình và chức tước',
  'groups.terms.court.note':
    'Ai cầm quyền, được xưng là gì, và những chức nào trò chơi trao cho một viên tướng.',
  'groups.terms.letters.title': 'Chữ nghĩa và khoa cử',
  'groups.terms.letters.note':
    'Chữ viết, quốc sử, Văn Miếu, và hai thể văn có mục riêng ở đây.',
  'groups.terms.life.title': 'Đời sống và phong tục',
  'groups.terms.life.note':
    'Ba mục không dính đến chính sự: cái Tết, dòng tranh mà trò chơi này lấy làm lối vẽ, và lá cờ treo trên một làng đang yên.',

  'groups.other.title': 'Chưa xếp mục',
  'groups.other.note':
    'Mới thêm vào trò chơi sau khi các mục của trang này được viết.',
};
