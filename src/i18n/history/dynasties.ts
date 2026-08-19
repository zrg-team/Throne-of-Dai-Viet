import type { HistoryCatalog } from './index';

/**
 * The eleven ages, and what the game took from each.
 *
 * Two paragraphs per era on purpose: `body` is the record, `inGame` is the confession. A player
 * should never have to guess which half is history and which half is us.
 */

export const dynastiesEn: HistoryCatalog = {
  'eras.hong-bang.title': 'Hồng Bàng · Văn Lang',
  'eras.hong-bang.body':
    'The founding age, and mostly legend rather than record. Eighteen generations of Hùng kings are said to have ruled Văn Lang from Phong Châu, a realm of bronze drums, wet rice and river villages. The drums are real — Đông Sơn bronzes are dug out of the delta by the hundred, worked with such skill that the age they came from was plainly not a simple one. The king list is not.',
  'eras.hong-bang.inGame':
    'Nothing in the game is set here. It is where the game gets its furniture: the drum, the reed banner, the village that is older than any dynasty that ever taxed it.',

  'eras.au-lac.title': 'Âu Lạc',
  'eras.au-lac.body':
    'Thục Phán took Văn Lang, called himself An Dương Vương, and built the spiral citadel at Cổ Loa. The story says the walls kept falling until a golden turtle gave him a claw for a crossbow trigger that fired a thousand bolts at once; that his daughter Mỵ Châu married the son of his enemy; and that the young man swapped the trigger for a forgery. Archaeology has turned up bronze trigger mechanisms and tens of thousands of arrowheads at the site. The turtle is the part the record adds.',
  'eras.au-lac.inGame':
    'The crossbow and the goose feathers are a Chronicle story — the gift that has been reading you back. Cổ Loa is on the map as a name in the name pool.',

  'eras.nam-viet.title': 'Nam Việt · the Triệu',
  'eras.nam-viet.body':
    'Triệu Đà, a Qin commander who had made himself king of a realm around Canton, took Âu Lạc in 179 BC and held it for sixty-eight years, until the Han took the whole thing from him. Whether that counts as rule by this country is the oldest argument in its historiography: the Đại Việt sử ký toàn thư opens its main annals with the Triệu and treats them as a dynasty of ours, and modern scholarship treats 179 BC as the conquest that began the thousand years. This page takes the second reading, which is why the line runs cold here — and prints the first so you can disagree with it.',
  'eras.nam-viet.inGame':
    'Nothing is set here. What the game inherits is the fall of Cổ Loa, not the argument about who ruled afterwards.',

  'eras.bac-thuoc.title': 'Bắc thuộc · the northern rule',
  'eras.bac-thuoc.body':
    'A thousand years of Han, Wu, Liang, Sui and Tang administration, punctuated by risings that mostly failed and are mostly remembered anyway. The Trưng sisters raised the delta in 40 and held sixty-five citadels for three years. Bà Triệu rode out at twenty-three in 248. Lý Bí declared a state called Vạn Xuân — ten thousand springs — in 544. Mai Thúc Loan and Phùng Hưng each took the protectorate seat and each was undone by the next army sent south. In 905 Khúc Thừa Dụ simply took the governorship and was confirmed in it, which worked where the wars had not.',
  'eras.bac-thuoc.inGame':
    'Four of the rulers a run can open under come from here, and none of them ruled a settled state. That is the point: the game starts you where they started, holding something that has not been agreed to yet.',

  'eras.ngo-dinh-le.title': 'Ngô · Đinh · Tiền Lê',
  'eras.ngo-dinh-le.body':
    'In 938 Ngô Quyền had iron-tipped stakes driven into the bed of the Bạch Đằng, let the Southern Han fleet ride in on the flood and met it coming back on the ebb. A thousand years of northern rule ended on one turn of the water. His death broke the country into twelve warlord domains; Đinh Bộ Lĩnh, a herdsman\’s son who had played at war with reed banners, put all twelve down and named the state Đại Cồ Việt with its capital in the limestone valley of Hoa Lư. He was assassinated in 979. The guard put Lê Hoàn on the throne and he beat the Song in the same year.',
  'eras.ngo-dinh-le.inGame':
    'The reed banner is the game\’s worked example of a hero who becomes what you make him, and the stakes in the river are a story with a tide in it. Hoa Lư is why the earliest wardrobe is a two-flap wrap and not a court robe.',

  'eras.ly.title': 'Lý dynasty',
  'eras.ly.body':
    'A temple foundling took the throne in 1009 and moved the capital out of the mountains to Đại La, because he had dreamt of a dragon rising there. He renamed it Thăng Long. What followed is the first long stretch of settled government the country had: the Hình thư legal code, a bell at the palace gate for anyone with a grievance, the Văn Miếu and the first examinations, dykes along the Red River, and in 1075 a pre-emptive strike into Song territory that burned the staging depots before they could be used. The poem read from a temple on the Như Nguyệt the following year is the country\’s first declaration of itself.',
  'eras.ly.inGame':
    'Almost every peacetime system in the game is Lý: the edicts, the examinations, the dykes, the idea that governing well for ten quiet minutes is what you spend in one loud one.',

  'eras.tran.title': 'Trần dynasty',
  'eras.tran.body':
    'Trần Thủ Độ engineered a marriage, an abdication and a dynasty inside a single year, and did the necessary killing himself. What the Trần are remembered for is what came next: three Mongol invasions in thirty years, and three defeats handed to the largest empire the world had yet assembled. They gave up Thăng Long twice rather than fight for it, starved the invaders of the grain fleet at Vân Đồn, and finished at Bạch Đằng in 1288 with the same stakes and the same tide Ngô Quyền had used three centuries before.',
  'eras.tran.inGame':
    'The Trần are the game\’s argument that a war is won behind the front. Diên Hồng, Vân Đồn, Yết Kiêu the diver, Trần Bình Trọng taken alive — every one of them is a Chronicle story, and none of them is a battle you fight.',

  'eras.ho.title': 'Hồ dynasty',
  'eras.ho.body':
    'Seven years. Hồ Quý Ly took the throne in 1400 and imposed genuinely advanced reforms with no popular consent: a national paper currency, caps on landholding, examinations in mathematics, a new capital of dressed stone at Tây Đô. Counterfeiting came first, then famine. When the Ming crossed in 1406 saying they had come to restore the Trần, almost nobody was willing to fight for him.',
  'eras.ho.inGame':
    'The paper money and the granaries are both Chronicle stories, and both are about attribution: a reform that is right and hated is still hated, and the game will not let you argue the point afterwards.',

  'eras.thuoc-minh.title': 'The Ming occupation',
  'eras.thuoc-minh.body':
    'Twenty years of direct Ming administration. They carried the books and the bronzes north, banned Nôm and local dress, and ran the country as a province called Giao Chỉ. The risings failed one after another until one from Lam Sơn did not — Lê Lợi swore an oath with eighteen men in 1418 and was still being hunted through the hills of Thanh Hoá a decade later.',
  'eras.thuoc-minh.inGame':
    'This age is why Lam Sơn is legible at all. The game gets its idea that a rebellion is logistics and letters long before it is a battle from a decade in which fighting was the thing that kept failing.',

  'eras.le-so.title': 'Lê sơ',
  'eras.le-so.body':
    'A landholder from Lam Sơn swore an oath with eighteen men and spent a decade being hunted through the hills of Thanh Hoá. Lê Lợi lost more battles than he won and won the last one, at Chi Lăng in 1427, where the relief army was destroyed in a pass. Nguyễn Trãi wrote the letters that opened city gates without a siege, then the Bình Ngô đại cáo. The Ming were given horses and boats and sent home. Under Lê Thánh Tông the Hồng Đức code gave women the right to hold and inherit property, and the country was mapped province by province.',
  'eras.le-so.inGame':
    'Lam Sơn is where the game gets its idea that a rebellion is logistics and letters before it is ever a battle. Lê Lai standing in for his lord is the story about a hero you choose to lose.',

  'eras.phan-tranh.title': 'Mạc · Trịnh–Nguyễn',
  'eras.phan-tranh.body':
    'Mạc Đăng Dung took the throne in 1527 and the country came apart along the seams for two hundred and fifty years. A restored Lê emperor reigned without ruling; the Trịnh governed the north in his name, the Nguyễn governed the south from Phú Xuân, and between them stood Đào Duy Từ\’s walls at Lũy Thầy. It is also the age of the country\’s widest reach south, of Hội An\’s harbour, and of a great deal of very good writing by people with no office at all.',
  'eras.phan-tranh.inGame':
    'Two courts holding the same mandate is where the game\’s rival kingdoms come from — and why a war here is fought against people who speak your language and quote your classics.',

  'eras.tay-son.title': 'Tây Sơn',
  'eras.tay-son.body':
    'Three brothers from a highland village brought both houses down. Nguyễn Huệ destroyed a Siamese fleet at Rạch Gầm–Xoài Mút, took Thăng Long, and then marched an army from Phú Xuân to the capital in forty days, arrived on the fifth night of Tết and had beaten a Qing army of two hundred thousand by the seventh. He was thirty-nine when he died, four years later, and what he built did not outlive him.',
  'eras.tay-son.inGame':
    'The lightning march is a charge you accept or decline, and it costs you what a real forced march costs. The Tây Sơn are also the game\’s reminder that speed is a strategy and not a stat.',

  'eras.nguyen.title': 'Nguyễn dynasty',
  'eras.nguyen.body':
    'Nguyễn Ánh took the whole country in 1802, called it Việt Nam, and built a capital and a citadel at Huế. Minh Mạng centralised the provinces, standardised the administration, and closed the country to the west at exactly the moment the west stopped taking no for an answer. The French took Saigon in 1859 and the southern provinces after it; the court signed away the rest in 1883.',
  'eras.nguyen.inGame':
    'The standing-collar court dress the late portraits wear is 1744, not 1802 — Nguyễn Phúc Khoát reformed the wardrobe first and the country second. The game dresses its heroes by the century they lived in, which is why the roster does not look like one costume for a thousand years.',

  'eras.phap-thuoc.title': 'French rule',
  'eras.phap-thuoc.body':
    'The treaties of 1883 and 1884 made Tonkin and Annam protectorates and Cochinchina an outright colony. The Nguyễn emperors kept the throne, the ceremonies and the seal, and lost the power to appoint, to tax and to refuse; the ones who tried — Hàm Nghi, Thành Thái, Duy Tân — were deposed and exiled in turn. The last of them abdicated in 1945.',
  'eras.phap-thuoc.inGame':
    'Outside the game entirely: every mode ends centuries before it. It is on the timeline because a timeline that stopped at 1802 would let a reader think the story finished on a victory.',
};

export const dynastiesVi: HistoryCatalog = {
  'eras.hong-bang.title': 'Hồng Bàng · Văn Lang',
  'eras.hong-bang.body':
    'Thời dựng nước, phần nhiều là truyền thuyết chứ chưa phải chính sử. Chép rằng mười tám đời vua Hùng trị nước Văn Lang từ Phong Châu — một cõi của trống đồng, lúa nước và làng ven sông. Trống đồng là thật: trống Đông Sơn đào lên hàng trăm chiếc khắp châu thổ, tinh xảo đến mức cái thời sinh ra chúng hiển nhiên không hề đơn sơ. Danh sách vua thì không.',
  'eras.hong-bang.inGame':
    'Không ván nào bắt đầu ở đây. Đây là nơi trò chơi lấy đồ đạc của mình: cái trống, ngọn cờ lau, và cái làng có trước mọi triều đại từng thu thuế nó.',

  'eras.au-lac.title': 'Âu Lạc',
  'eras.au-lac.body':
    'Thục Phán lấy Văn Lang, xưng An Dương Vương, đắp thành ốc ở Cổ Loa. Chuyện kể thành cứ xây lại đổ cho đến khi thần Kim Quy cho cái móng làm lẫy nỏ bắn một phát ngàn mũi; rằng con gái ông là Mỵ Châu lấy con trai kẻ thù; và rằng chàng rể đã tráo lẫy nỏ. Khảo cổ đã đào được lẫy nỏ bằng đồng và hàng vạn mũi tên ở di chỉ ấy. Con rùa là phần sử chép thêm.',
  'eras.au-lac.inGame':
    'Nỏ thần và áo lông ngỗng là một tích trong Sử Ký — món quà vẫn đang đọc ngược lại ngươi. Cổ Loa có mặt trên bản đồ trong kho tên đất.',

  'eras.nam-viet.title': 'Nam Việt · nhà Triệu',
  'eras.nam-viet.body':
    'Triệu Đà, một viên tướng nhà Tần tự lập làm vua một cõi quanh Quảng Châu, lấy Âu Lạc năm 179 TCN và giữ sáu mươi tám năm, cho đến khi nhà Hán lấy trọn của ông. Chuyện ấy có tính là nước ta tự trị hay không là mối tranh luận xưa nhất của sử học nước nhà: Đại Việt sử ký toàn thư mở phần bản kỷ bằng nhà Triệu và coi đó là một triều đại của ta, còn sử học hiện đại coi năm 179 TCN là cuộc xâm chiếm mở đầu một nghìn năm. Trang này theo cách đọc thứ hai — nên vạch kẻ lạnh đi từ đây — và in cách đọc thứ nhất ra để bạn có thể không đồng ý.',
  'eras.nam-viet.inGame':
    'Không ván nào bắt đầu ở đây. Cái trò chơi thừa hưởng là sự sụp đổ của Cổ Loa, không phải cuộc tranh luận về ai cai trị sau đó.',

  'eras.bac-thuoc.title': 'Bắc thuộc',
  'eras.bac-thuoc.body':
    'Một nghìn năm dưới Hán, Ngô, Lương, Tùy và Đường, xen giữa là những cuộc khởi nghĩa phần lớn thất bại và phần lớn vẫn được nhớ. Hai Bà Trưng dấy châu thổ năm 40, giữ sáu mươi lăm thành trong ba năm. Bà Triệu ra trận năm 248, tuổi hai mươi ba. Lý Bí dựng nước Vạn Xuân năm 544. Mai Thúc Loan rồi Phùng Hưng đều chiếm được phủ đô hộ, và đều bị đạo quân kế tiếp từ phương Bắc dẹp. Năm 905 Khúc Thừa Dụ chỉ đơn giản nhận lấy chức Tiết độ sứ rồi được công nhận — cách ấy thành công ở chỗ mà chiến tranh đã không.',
  'eras.bac-thuoc.inGame':
    'Bốn vị vua mà một ván có thể mở màn đến từ thời này, và không ai trong họ cai trị một nước đã yên. Đó chính là dụng ý: trò chơi đặt ngươi vào đúng chỗ họ đã đứng, cầm một thứ chưa ai chịu công nhận.',

  'eras.ngo-dinh-le.title': 'Ngô · Đinh · Tiền Lê',
  'eras.ngo-dinh-le.body':
    'Năm 938 Ngô Quyền cho đóng cọc bịt sắt xuống lòng Bạch Đằng, để thủy quân Nam Hán theo nước lớn tiến vào, rồi đón chúng lúc nước ròng. Một nghìn năm Bắc thuộc chấm dứt trong một con nước. Ông mất, nước vỡ thành mười hai sứ quân; Đinh Bộ Lĩnh, con nhà chăn trâu từng lấy cờ lau tập trận, dẹp cả mười hai, đặt quốc hiệu Đại Cồ Việt, đóng đô ở thung lũng đá vôi Hoa Lư. Năm 979 ông bị ám sát. Quân sĩ tôn Lê Hoàn lên ngôi, và ngay năm ấy ông phá Tống.',
  'eras.ngo-dinh-le.inGame':
    'Ngọn cờ lau là ví dụ mẫu của trò chơi về một người trở thành đúng cái mà ngươi làm nên, còn cọc dưới sông là một tích có con nước trong đó. Hoa Lư là lý do bộ y phục sớm nhất là áo giao lĩnh hai vạt, không phải triều phục.',

  'eras.ly.title': 'Nhà Lý',
  'eras.ly.body':
    'Một đứa trẻ nuôi ở cửa chùa lên ngôi năm 1009 và dời đô khỏi vùng núi về Đại La, vì đã mộng thấy rồng bay lên ở đó. Ông đặt tên là Thăng Long. Sau đó là quãng cai trị quy củ dài đầu tiên của nước này: bộ Hình thư, quả chuông treo trước cửa cung cho ai có oan được đánh, Văn Miếu và khoa thi đầu tiên, đê dọc sông Hồng, và năm 1075 một trận đánh phủ đầu sang đất Tống thiêu các kho lương trước khi chúng kịp dùng đến. Bài thơ đọc trong đền bên sông Như Nguyệt năm sau là lời tuyên xưng đầu tiên của nước này về chính mình.',
  'eras.ly.inGame':
    'Gần như mọi hệ thống thời bình trong game đều là nhà Lý: chiếu chỉ, khoa cử, đê điều, và cái ý rằng cai trị cho khéo mười phút yên ắng chính là vốn để tiêu trong một phút ồn ào.',

  'eras.tran.title': 'Nhà Trần',
  'eras.tran.body':
    'Trần Thủ Độ dàn xếp một cuộc hôn nhân, một cuộc nhường ngôi và cả một triều đại gọn trong một năm, và tự tay làm phần việc phải giết. Cái nhà Trần được nhớ là chuyện sau đó: ba lần Nguyên Mông xâm lăng trong ba mươi năm, và ba lần đế quốc lớn nhất mà loài người từng dựng phải chuốc lấy bại trận. Họ bỏ Thăng Long hai lần thay vì tử thủ, cắt đứt đoàn thuyền lương ở Vân Đồn, và kết thúc ở Bạch Đằng năm 1288 bằng đúng thứ cọc và đúng con nước Ngô Quyền đã dùng ba thế kỷ trước.',
  'eras.tran.inGame':
    'Nhà Trần là lập luận của trò chơi rằng một cuộc chiến thắng ở phía sau mặt trận. Diên Hồng, Vân Đồn, Yết Kiêu lặn nước, Trần Bình Trọng bị bắt sống — mỗi chuyện là một tích trong Sử Ký, và không chuyện nào là một trận ngươi cầm quân.',

  'eras.ho.title': 'Nhà Hồ',
  'eras.ho.body':
    'Bảy năm. Hồ Quý Ly lên ngôi năm 1400 và thi hành những cải cách thật sự đi trước thời đại mà không hỏi lòng dân: tiền giấy toàn quốc, hạn điền hạn nô, thi cả toán pháp, dựng kinh thành đá ở Tây Đô. Trước là nạn tiền giả, rồi đến đói. Khi quân Minh kéo sang năm 1406 nói rằng đến để phục dựng nhà Trần, gần như không còn ai chịu đánh giúp ông.',
  'eras.ho.inGame':
    'Tiền giấy và kho thóc đều là tích trong Sử Ký, và cả hai đều nói về sự quy công: một cải cách đúng mà bị ghét thì vẫn là bị ghét, và trò chơi sẽ không cho ngươi phân trần về sau.',

  'eras.thuoc-minh.title': 'Thuộc Minh',
  'eras.thuoc-minh.body':
    'Hai mươi năm nhà Minh cai trị trực tiếp. Họ chở sách vở và đồ đồng về Bắc, cấm chữ Nôm và y phục bản xứ, đặt nước ta thành quận Giao Chỉ. Các cuộc khởi nghĩa lần lượt thất bại, cho đến khi có một cuộc ở Lam Sơn thì không — Lê Lợi cùng mười tám người thề ước năm 1418, và mười năm sau vẫn còn bị lùng trong núi Thanh Hoá.',
  'eras.thuoc-minh.inGame':
    'Chính thời này làm cho Lam Sơn đọc được. Cái ý rằng một cuộc khởi nghĩa là lương thảo và thư từ trước khi là một trận đánh, trò chơi lấy từ một thập kỷ mà đánh nhau là thứ liên tục thất bại.',

  'eras.le-so.title': 'Lê sơ',
  'eras.le-so.body':
    'Một hào trưởng đất Lam Sơn cùng mười tám người thề ước, rồi mười năm bị lùng trong núi Thanh Hoá. Lê Lợi thua nhiều hơn thắng và thắng trận cuối cùng, ở Chi Lăng năm 1427, nơi đạo viện binh bị diệt gọn trong một cửa ải. Nguyễn Trãi viết những bức thư mở được cổng thành mà không cần vây, rồi viết Bình Ngô đại cáo. Quân Minh được cấp ngựa và thuyền để về. Đến đời Lê Thánh Tông, luật Hồng Đức cho người đàn bà quyền có và thừa kế điền sản, và cả nước được đo vẽ từng thừa tuyên.',
  'eras.le-so.inGame':
    'Lam Sơn là nơi trò chơi lấy cái ý rằng một cuộc khởi nghĩa là lương thảo và thư từ trước khi là một trận đánh. Lê Lai liều mình thay chúa là tích về một người hùng mà ngươi chọn để mất.',

  'eras.phan-tranh.title': 'Mạc · Trịnh – Nguyễn',
  'eras.phan-tranh.body':
    'Mạc Đăng Dung cướp ngôi năm 1527 và nước bung ra theo đường chỉ suốt hai trăm năm mươi năm. Vua Lê được dựng lại thì ngồi mà không trị; chúa Trịnh cầm Đàng Ngoài nhân danh vua, chúa Nguyễn cầm Đàng Trong từ Phú Xuân, ở giữa là Lũy Thầy của Đào Duy Từ. Đây cũng là thời nước Nam vươn xa nhất về nam, thời cảng Hội An, và thời có rất nhiều áng văn hay do những người không giữ chức gì viết ra.',
  'eras.phan-tranh.inGame':
    'Hai triều cùng giữ một mệnh trời là gốc của các nước đối địch trong game — và là lý do một cuộc chiến ở đây đánh với những người nói cùng tiếng nói và dẫn cùng sách thánh hiền.',

  'eras.tay-son.title': 'Tây Sơn',
  'eras.tay-son.body':
    'Ba anh em từ một ấp vùng cao hạ cả hai họ chúa. Nguyễn Huệ diệt thủy quân Xiêm ở Rạch Gầm – Xoài Mút, lấy Thăng Long, rồi hành quân từ Phú Xuân ra kinh trong bốn mươi ngày, đến vào đêm mồng năm Tết và đến mồng bảy đã phá xong hai mươi vạn quân Thanh. Ông mất bốn năm sau, ba mươi chín tuổi, và cơ nghiệp ông dựng không sống lâu hơn ông.',
  'eras.tay-son.inGame':
    'Cuộc hành quân thần tốc là một lời thề ngươi nhận hoặc từ chối, và nó lấy của ngươi đúng cái giá mà một cuộc cưỡng hành quân thật phải trả. Tây Sơn cũng là lời nhắc rằng tốc độ là một phương lược, không phải một chỉ số.',

  'eras.nguyen.title': 'Nhà Nguyễn',
  'eras.nguyen.body':
    'Nguyễn Ánh thu cả nước năm 1802, đặt quốc hiệu Việt Nam, dựng kinh thành ở Huế. Minh Mạng nhất thống các trấn thành tỉnh, chuẩn hoá quan chế, và đóng cửa với phương Tây đúng vào lúc phương Tây thôi chấp nhận câu từ chối. Pháp lấy Gia Định năm 1859 rồi lấy nốt Nam Kỳ; đến năm 1883 triều đình ký nhượng phần còn lại.',
  'eras.nguyen.inGame':
    'Áo cổ đứng trong các chân dung muộn là mốc 1744 chứ không phải 1802 — Nguyễn Phúc Khoát cải trang phục trước, cải đất nước sau. Trò chơi mặc cho nhân vật theo đúng thế kỷ họ sống, nên cả dàn tướng không trông như mặc một bộ suốt nghìn năm.',

  'eras.phap-thuoc.title': 'Pháp thuộc',
  'eras.phap-thuoc.body':
    'Hoà ước 1883 và 1884 đặt Bắc Kỳ và Trung Kỳ thành xứ bảo hộ, Nam Kỳ thành thuộc địa. Vua Nguyễn vẫn giữ ngai vàng, nghi lễ và ấn tín, nhưng mất quyền bổ nhiệm, quyền thu thuế và quyền nói không; những ông vua muốn giành lại — Hàm Nghi, Thành Thái, Duy Tân — đều lần lượt bị phế và đày. Vị cuối cùng thoái vị năm 1945.',
  'eras.phap-thuoc.inGame':
    'Hoàn toàn nằm ngoài trò chơi: mọi chế độ chơi đều kết thúc trước đó hàng thế kỷ. Nó có mặt trên dòng thời gian vì một dòng thời gian dừng ở năm 1802 sẽ khiến người đọc tưởng câu chuyện kết thúc bằng một chiến thắng.',
};
