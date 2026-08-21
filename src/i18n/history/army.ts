import type { HistoryCatalog } from './index';

/**
 * The wardrobe, as a page you can turn rather than a plate you look at.
 *
 * Same two-paragraph rule as the dynasties: `body` is the record, `inGame` is the confession. The
 * headwear entries are the ones most likely to be over-claimed, so each says plainly how much of it
 * is documented and how much is the game drawing a legible silhouette at eight pixels.
 *
 * Đại Việt only. The northern powers and Chăm have wardrobes in the code, but this page is about
 * the army the player raises, and a page that also taught you to recognise the Ming would be a
 * different page.
 */

export const armyEn: HistoryCatalog = {
  'army.intro':
    'A soldier is drawn from six marks: what he wears on his head, what his body is cut like, what covers his chest, one sash, what he carries, and what is on his feet. Change one and the century changes. Pick a dynasty, a rank and a weapon, and the man above is drawn by the same code that draws him on the battlefield.',

  'army.label.dynasty': 'DYNASTY',
  'army.label.rank': 'RANK',
  'army.label.arm': 'ARM',
  'army.mark': 'The mark',

  'army.label.formation': 'FORMATION',
  'army.formation.note':
    'One mark is fifty-five men, and the blocks are the same host spent differently. Casualties are taken from the front of the formation: the screen is used up first, then the line, then the bows, and the horse is still standing at the end of most fights.',

  'army.doctrine.balanced.title': 'Balanced · four blocks, four jobs',
  'army.doctrine.balanced.body':
    'A loose screen of skirmishers out in front to take the first volley and fall back through the line; the shield wall as the main body; the bows behind it, shooting over; a small wing of horse on the flank waiting for something to open. Everything else is this same army spent differently.',
  'army.doctrine.spears.title': 'Spear wall · everything in the line',
  'army.doctrine.spears.body':
    'Nine files and four ranks deep, a token screen, almost no shot, and not one horse. The widest and deepest single block on the field, and it does exactly one thing — it does not move and it does not break. The shape of a host that has decided to be an obstacle.',
  'army.doctrine.archers.title': 'Archer host · the body is at the back',
  'army.doctrine.archers.body':
    'The line is a crust two ranks deep whose whole job is to keep anything off the bowmen behind it. Read the picture and the weakness is there without being written down: everything valuable is in the block that cannot defend itself.',
  'army.doctrine.shock.title': 'Shock · no screen at all',
  'army.doctrine.shock.body':
    'Shields going forward with a real wing of horse on the flank and almost nothing shooting. It gives up the exchange before contact entirely in order to win the exchange at contact — and the missing screen is the first thing you notice, because there is bare ground where every other doctrine has men.',
  'army.doctrine.horse.title': 'Cavalry wing · paid for out of the line',
  'army.doctrine.horse.body':
    'A pony and rider is about seventeen marks of drawing against a footman\'s eight, so a wing this size comes out of the block that has to hold the ground while it manoeuvres. The picture makes the trade legible: the wing is the biggest thing on the field and the line is two ranks thin.',

  // ── the seven Việt wardrobes ──
  'army.ly.title': 'Lý · 1010–1225',
  'army.ly.mark': 'A domed helm with a long crest swept back off it.',
  'army.ly.body':
    'Two centuries of a settled court at Thăng Long, and the first Vietnamese army raised on a system rather than on a lord\'s household. Ngụ binh ư nông — soldiers quartered in agriculture — turned farmers out in rotation and sent them home to the harvest, which is why a Lý host is mostly men in no armour at all with a few helmed officers among them. The armour that does appear is the hộ tâm kính, a single mirror plate over the heart, which is the commonest piece the northern record knows.',
  'army.ly.inGame':
    'The crest is drawn longer than any surviving illustration supports. At the size a soldier is drawn on the battlefield a dome alone is a dot, and the sweep back off it is what separates the Lý from the Trần at a glance — so it is exaggerated on purpose, and this is us saying so.',

  'army.tran.title': 'Trần · 1225–1400',
  'army.tran.mark': 'Cheek flaps below the brow, and a round disc on the chest.',
  'army.tran.body':
    'The dynasty that met the Mongols three times and was still there afterwards. Its armies were the most heavily equipped of any age in this game: layered lamellar on officers, a round mirror disc at the breast rather than the square plate, and helmets with flaps hanging past the jaw. The Trần also kept a standing professional core rather than relying wholly on rotation, which is the difference that shows in the drawing — more men in plate, fewer in a farmer\'s wrap.',
  'army.tran.inGame':
    'The round disc is in both the costume record and the texts, so it does the work of telling Trần from Lý without touching the helmet. Whether the flaps hung as low as they are drawn here is a judgement made for legibility, not a finding.',

  'army.le.title': 'Later Lê · 1427–1527',
  'army.le.mark': 'A brim under the dome — and the first firearms in the line.',
  'army.le.body':
    'Lê Lợi\'s war of independence ended in 1428 and the century that followed was the high administrative age: a codified law, a census, and an army organised in five regional commands. It is also when hand-guns stop being a curiosity. The Hồ had cast them a generation earlier — Hồ Nguyên Trừng was carried off to Ming China and set to making them there — and by the Lê a proportion of every host carried one.',
  'army.le.inGame':
    'Pick the skirmisher arm under the Lê or any later dynasty and the man carries a matchlock; under the Lý and Trần he carries a javelin. That switch happens inside the figure, keyed on the dynasty, so it can never be set wrong by the code that asks for a soldier.',

  'army.trinh.title': 'Trịnh lords · 1545–1787',
  'army.trinh.mark': 'A tall dark cap, and the only horsemen on the reference sheet.',
  'army.trinh.body':
    'For two hundred years the Lê emperors reigned in Thăng Long and the Trịnh lords ruled. The north kept the court, the bureaucracy and the larger population, and fought the Nguyễn in the south to a standstill across seven campaigns and a wall. Northern hosts are the ones drawn with cavalry: horses were bred and traded down from the highlands, and the country north of the Gianh river had ground a horse could be used on.',
  'army.trinh.inGame':
    'The Trịnh are not a rung on the player\'s ladder — no run climbs into them. They are what a *rival* Việt kingdom wears, so that a war between two Vietnamese realms is not two identical armies in two shades of the same brown.',

  'army.nguyenLord.title': 'Nguyễn lords · 1545–1778',
  'army.nguyenLord.mark': 'Bare-headed, hair in a bun. The hardest of the seven to read.',
  'army.nguyenLord.body':
    'The southern half of the same two-century split. The Nguyễn held from the Gianh river down, expanded into Chăm and Khmer land, opened ports to Portuguese and Dutch traders and bought guns with the proceeds. Their soldiers are drawn bare-headed with the hair knotted up, in a plain tunic, with a musket and a sword at the hip — which is exactly how the costume record shows them, and it is a working uniform rather than a court one.',
  'army.nguyenLord.inGame':
    'A bare head is a problem for a game that identifies a dynasty by its headwear, and we did not solve it by inventing a hat. Their tunic runs longer and the musket sits lower than anyone else\'s instead. When a wardrobe cannot win on the crown it has to win somewhere.',

  'army.tayson.title': 'Tây Sơn · 1778–1802',
  'army.tayson.mark': 'A soft wrapped turban with the knot at the side.',
  'army.tayson.body':
    'A peasant rising from a village in Bình Định that ended by taking the whole country and destroying a Qing invasion at Ngọc Hồi–Đống Đa in the first days of the lunar new year, 1789. Quang Trung\'s army marched north at a speed that is still argued about, and fought with elephants in the line. Its soldiers are drawn in a khăn đóng — cloth wound and knotted rather than a made hat — which is what men who were farmers a year earlier wore.',
  'army.tayson.inGame':
    'The elephants are not drawn. One is about forty marks of ink against a footman\'s eight, so it cannot be a figure in a rank; it would have to be a prop standing behind the block, and that is not built yet. The turban is.',

  'army.nguyen.title': 'Nguyễn dynasty · 1802–1945',
  'army.nguyen.mark': 'The nón dấu: a shallow wide cone with a spike at the crown.',
  'army.nguyen.body':
    'Gia Long unified the country in 1802 and moved the capital to Huế. The Nguyễn army is the best documented of any here — there are photographs from its last century — and the nón dấu is its most recognisable piece: lacquered, wide, shallow, with a metal spike at the top, worn over a long coat with plate beneath for the guard.',
  'army.nguyen.inGame':
    'This is the wardrobe the game reaches for when it has nothing else to go on, and the one the citadel on the map used to be locked into whatever age you were playing. Both now follow the dynasty your run was mustered in.',

  // ── the three ranks ──
  'army.tier.0.title': 'Levy · lính mộ',
  'army.tier.0.body':
    'No helmet, no plate, no boots. A levy is drawn bare-headed with the hair knotted, carrying a billhook off a farm. This is ngụ binh ư nông made visible: under the Lý and the Trần the realm turned farmers out in rotation and sent them home again for the harvest, and a levy is a man who will be back in his field before the year is out.',
  'army.tier.1.title': 'Trained · quân thường trực',
  'army.tier.1.body':
    'The dynasty\'s helmet, the mirror plate at the chest, and the realm\'s sash. A standing soldier, kept under arms and paid, and the tier most of any host is made of.',
  'army.tier.2.title': 'Royal guard · cấm quân',
  'army.tier.2.body':
    'Shoulder pieces above the plate, boots on the feet, and a rank mark inked at the shoulder. The palace troops — the best equipped men in the realm, and few. The rank mark is drawn as a band, never as a written character: a Hán glyph standing in for information is a rule this game keeps.',

  // ── the five arms ──
  'army.arm.spear.title': 'Billhook · giáo',
  'army.arm.spear.body':
    'Held upright and close in. Not a trained arm at all — it is what a levy is holding, and what a host carries when nothing has told the drawing what it is made of.',
  'army.arm.sword.title': 'Swordman · đao thủ',
  'army.arm.sword.body':
    'A đao in the right hand and a khiên on the left: a round shield of wood with a rattan-bound edge, lacquered black. In a formation these are the main body, and a block of them fills with pale discs at chest height — the densest of the five silhouettes, and the one that reads as a thing you would not walk into.',
  'army.arm.skirmish.title': 'Skirmisher · quân khinh',
  'army.arm.skirmish.body':
    'A javelin before the Later Lê and a matchlock after it, carried low and across the body. Skirmishers screen the line and fall back through it. A block of them reads as hatching rather than as a row of uprights, which at battlefield size is the whole identification.',
  'army.arm.bow.title': 'Archer · cung thủ',
  'army.arm.bow.body':
    'The bow held out from the ribs with the arrow across it, and a quiver behind the shoulder. Vietnamese armies were crossbow armies as far back as Cổ Loa, and the bow block stands behind the line shooting over it. It is the thinnest silhouette of the five, which is the correct read: it is the block that dies if anything reaches it.',
  'army.arm.mounted.title': 'Horseman · kỵ binh',
  'army.arm.mounted.body':
    'The mount is a southern pony — about 1.25 m at the withers, not a destrier — and drawn at its real size, which is why a horseman stands a head and shoulders above the line and no more. Cavalry is always a wing beside the block and never the block: a pony and rider costs about seventeen marks of ink against a footman\'s eight, and the cost forces the tactic that history had already chosen.',
};

export const armyVi: HistoryCatalog = {
  'army.intro':
    'Một người lính được vẽ bằng sáu nét: đội gì trên đầu, thân cắt ra sao, che gì trước ngực, một dải thắt lưng, cầm gì trong tay, và chân đi gì. Đổi một nét là đổi cả một thế kỷ. Hãy chọn một triều đại, một cấp bậc và một thứ binh khí — người lính ở trên được vẽ bằng đúng đoạn mã vẽ anh ta ngoài trận.',

  'army.label.dynasty': 'TRIỀU ĐẠI',
  'army.label.rank': 'CẤP BẬC',
  'army.label.arm': 'BINH CHỦNG',
  'army.mark': 'Dấu nhận biết',

  'army.label.formation': 'ĐỘI HÌNH',
  'army.formation.note':
    'Một nét quân là năm mươi lăm người, và bốn khối chỉ là cùng một đạo quân được chia khác đi. Thương vong lấy từ phía trước đội hình: khinh binh mất trước, rồi đến hàng đao thủ, rồi cung thủ — còn kỵ binh thì gần hết trận vẫn còn đứng đó.',

  'army.doctrine.balanced.title': 'Cân bằng · bốn khối, bốn việc',
  'army.doctrine.balanced.body':
    'Một lớp khinh binh dàn mỏng phía trước để hứng loạt đầu rồi rút qua hàng quân; hàng khiên làm thân quân; cung thủ đứng sau bắn vượt qua đầu; một cánh kỵ nhỏ chờ bên sườn xem có chỗ nào hở. Mọi lối bày quân khác đều là đạo quân này chia khác đi.',
  'army.doctrine.spears.title': 'Tường giáo · dồn hết vào hàng quân',
  'army.doctrine.spears.body':
    'Chín hàng dọc, sâu bốn hàng ngang, khinh binh lấy lệ, gần như không có quân bắn, và không một con ngựa. Đây là khối đơn rộng nhất và dày nhất trên mặt trận, và nó làm đúng một việc: không lùi và không vỡ. Đó là hình dáng của một đạo quân đã quyết định làm một vật cản.',
  'army.doctrine.archers.title': 'Quân cung · thân quân ở phía sau',
  'army.doctrine.archers.body':
    'Hàng quân chỉ còn là một lớp vỏ dày hai hàng, việc duy nhất của nó là giữ cho không thứ gì chạm được vào đám cung thủ phía sau. Nhìn hình là thấy ngay chỗ yếu mà không cần ai nói: thứ quý nhất nằm trong cái khối không tự giữ nổi mình.',
  'army.doctrine.shock.title': 'Xung kích · không có lớp che',
  'army.doctrine.shock.body':
    'Hàng khiên tiến lên, một cánh kỵ thật sự bên sườn, và gần như không có gì bắn. Nó bỏ hẳn phần ăn thua trước khi giáp lá cà để đổi lấy phần ăn thua lúc giáp lá cà — và chỗ trống nơi các lối bày quân khác đều có người là thứ đập vào mắt trước tiên.',
  'army.doctrine.horse.title': 'Cánh kỵ · trả giá bằng hàng quân',
  'army.doctrine.horse.body':
    'Một ngựa một người tốn chừng mười bảy nét mực, so với tám nét của một bộ binh, nên một cánh kỵ lớn thế này phải lấy ra từ chính cái khối có nhiệm vụ giữ đất trong lúc nó vòng đánh. Bức hình nói rõ cái giá ấy: cánh kỵ là thứ lớn nhất trên mặt trận, còn hàng quân chỉ còn mỏng hai hàng.',

  'army.ly.title': 'Lý · 1010–1225',
  'army.ly.mark': 'Mũ tròn có chỏm, phía sau vắt ra một chùm lông dài.',
  'army.ly.body':
    'Hai thế kỷ triều đình yên vị ở Thăng Long, và là quân đội Việt đầu tiên được dựng theo chế độ chứ không theo gia binh của một hào trưởng. Phép ngụ binh ư nông cho lính thay phiên về ruộng, nên một đạo quân nhà Lý phần lớn là người không giáp, lác đác vài viên tướng đội mũ. Thứ giáp có thật là hộ tâm kính — một tấm gương che tim, hiện vật được ghi chép phương Bắc nhắc đến nhiều nhất.',
  'army.ly.inGame':
    'Chùm lông được vẽ dài hơn mọi hình vẽ còn lại. Ở cỡ người lính ngoài trận, một cái mũ tròn chỉ còn là một chấm; chính nét vắt ra sau mới tách được Lý khỏi Trần trong một cái liếc. Đó là cường điệu có chủ ý, và đây là chỗ chúng tôi nói ra điều ấy.',

  'army.tran.title': 'Trần · 1225–1400',
  'army.tran.mark': 'Hai má hộ hai bên, và một đĩa tròn trước ngực.',
  'army.tran.body':
    'Triều đại ba lần đối đầu quân Mông – Nguyên và vẫn còn đó sau đó. Quân Trần được trang bị nặng nhất trong các thời kỳ có mặt ở đây: giáp lá xếp lớp cho tướng, một đĩa gương tròn thay tấm vuông trước ngực, mũ có má hộ buông quá quai hàm. Nhà Trần còn giữ một lực lượng thường trực chuyên nghiệp chứ không chỉ trông vào phiên chế, và khác biệt ấy hiện ra ngay trong hình vẽ.',
  'army.tran.inGame':
    'Đĩa tròn có trong cả tài liệu trang phục lẫn sử sách, nên nó gánh việc phân biệt Trần với Lý mà không phải động tới cái mũ. Còn má hộ có buông thấp đến thế hay không thì là một phán đoán vì dễ nhìn, không phải một kết luận.',

  'army.le.title': 'Hậu Lê · 1427–1527',
  'army.le.mark': 'Mũ tròn có thêm vành — và những khẩu súng đầu tiên trong hàng.',
  'army.le.body':
    'Cuộc kháng chiến của Lê Lợi kết thúc năm 1428, và thế kỷ sau đó là thời hành chính rực rỡ nhất: bộ luật thành văn, sổ đinh, quân chia làm năm đạo. Đây cũng là lúc súng cầm tay thôi còn là của lạ. Nhà Hồ đã đúc súng trước đó một đời — Hồ Nguyên Trừng bị bắt sang Minh rồi bị bắt làm súng ở đó — và đến thời Lê thì đạo quân nào cũng có một phần mang súng.',
  'army.le.inGame':
    'Chọn binh chủng khinh binh từ thời Lê trở đi thì người lính cầm súng hoả mai; thời Lý và Trần thì cầm lao. Việc đổi ấy nằm bên trong hàm vẽ người và khoá theo triều đại, nên chỗ gọi tới không bao giờ đặt sai được.',

  'army.trinh.title': 'Chúa Trịnh · 1545–1787',
  'army.trinh.mark': 'Mũ lông cao màu sẫm, và là bên duy nhất có kỵ binh trong tài liệu gốc.',
  'army.trinh.body':
    'Hai trăm năm vua Lê ngồi ngôi ở Thăng Long còn chúa Trịnh cầm quyền. Đàng Ngoài giữ triều đình, giữ bộ máy quan lại và phần dân đông hơn, đánh nhau với họ Nguyễn bảy lần mà không phân thắng bại. Quân Đàng Ngoài là bên được vẽ có ngựa: ngựa nuôi và mua từ miền núi xuống, và đất phía bắc sông Gianh là đất dùng được ngựa.',
  'army.trinh.inGame':
    'Trịnh không phải một nấc trên thang tiến của người chơi — không ván nào leo tới đó. Đó là thứ một vương quốc Việt *đối địch* mặc, để một cuộc chiến giữa hai nước Việt không phải là hai đạo quân giống hệt nhau trong hai sắc nâu.',

  'army.nguyenLord.title': 'Chúa Nguyễn · 1545–1778',
  'army.nguyenLord.mark': 'Đầu trần, tóc búi. Khó nhận ra nhất trong bảy.',
  'army.nguyenLord.body':
    'Nửa phía nam của cùng một cuộc phân tranh. Họ Nguyễn giữ từ sông Gianh trở vào, mở đất về phía Chăm và Khmer, mở cảng cho thương nhân Bồ Đào Nha và Hà Lan rồi lấy tiền ấy mua súng. Lính của họ được vẽ đầu trần tóc búi, áo vải trơn, mang súng và đeo đao bên hông — đúng như tài liệu trang phục ghi lại, và đó là quân phục để dùng chứ không phải để chầu.',
  'army.nguyenLord.inGame':
    'Một cái đầu trần là bài toán khó cho một trò chơi nhận triều đại qua cái mũ, và chúng tôi không giải nó bằng cách bịa ra một cái mũ. Thay vào đó áo của họ dài hơn và khẩu súng hạ thấp hơn mọi bên khác. Khi một bộ trang phục không thắng được ở cái mũ thì nó phải thắng ở chỗ khác.',

  'army.tayson.title': 'Tây Sơn · 1778–1802',
  'army.tayson.mark': 'Khăn đóng quấn mềm, nút buộc lệch một bên.',
  'army.tayson.body':
    'Một cuộc khởi nghĩa nông dân từ một làng ở Bình Định, kết thúc bằng việc lấy cả nước và phá tan quân Thanh ở Ngọc Hồi – Đống Đa ngay mấy ngày đầu năm Kỷ Dậu, 1789. Quân Quang Trung ra Bắc với tốc độ đến nay vẫn còn được bàn cãi, và ra trận có voi trong đội hình. Lính Tây Sơn được vẽ với khăn đóng — vải quấn rồi buộc chứ không phải mũ làm sẵn — đúng thứ những người mới năm ngoái còn là nông dân đội trên đầu.',
  'army.tayson.inGame':
    'Voi thì chưa vẽ. Một con voi tốn chừng bốn mươi nét mực so với tám nét của một người lính, nên nó không thể là một hình đứng trong hàng; nó phải là một vật đứng sau khối quân, và phần đó chưa dựng. Khăn đóng thì có.',

  'army.nguyen.title': 'Nhà Nguyễn · 1802–1945',
  'army.nguyen.mark': 'Nón dấu: nón nông, vành rộng, chóp có mũi nhọn.',
  'army.nguyen.body':
    'Gia Long thống nhất đất nước năm 1802 và dời kinh đô về Huế. Quân đội nhà Nguyễn là quân đội được ghi chép đầy đủ nhất ở đây — thế kỷ cuối của nó còn có cả ảnh chụp — và nón dấu là thứ dễ nhận ra nhất: quang dầu, rộng, nông, chóp gắn mũi kim loại, đội trên áo dài, bên trong có giáp nếu là cấm quân.',
  'army.nguyen.inGame':
    'Đây là bộ trang phục trò chơi lấy khi không còn căn cứ nào khác, và cũng là bộ mà toà thành trên bản đồ từng bị khoá cứng vào, chơi thời nào cũng vậy. Giờ cả hai đều theo đúng triều đại mà ván của ngươi được điểm binh.',

  'army.tier.0.title': 'Lính mộ',
  'army.tier.0.body':
    'Không mũ, không giáp, không giày. Lính mộ được vẽ đầu trần tóc búi, tay cầm một cây câu liêm lấy ở ruộng. Đây là phép ngụ binh ư nông hiện thành hình: thời Lý và Trần triều đình cho lính thay phiên về gặt, và một người lính mộ là người sẽ về lại ruộng của mình trước khi hết năm.',
  'army.tier.1.title': 'Quân thường trực',
  'army.tier.1.body':
    'Mũ của triều đại, hộ tâm kính trước ngực, và dải thắt lưng màu của nước. Người lính ăn lương, ở dưới cờ quanh năm — và là phần lớn của bất kỳ đạo quân nào.',
  'army.tier.2.title': 'Cấm quân',
  'army.tier.2.body':
    'Có giáp vai trên tấm hộ tâm, chân đi giày, và một dấu cấp bậc chấm ở vai. Quân túc vệ trong cung — trang bị tốt nhất nước, và rất ít. Dấu cấp bậc được vẽ thành một vệt, không bao giờ là một chữ: lấy một chữ Hán thay cho thông tin là điều trò chơi này không làm.',

  'army.arm.spear.title': 'Câu liêm · giáo',
  'army.arm.spear.body':
    'Dựng đứng và ôm sát người. Không phải một binh chủng được huấn luyện — đó là thứ lính mộ cầm, và là thứ một đạo quân mang khi chưa có gì cho biết nó được ghép từ những ai.',
  'army.arm.sword.title': 'Đao thủ',
  'army.arm.sword.body':
    'Đao ở tay phải, khiên ở tay trái: khiên gỗ viền mây, quang dầu đen. Trong đội hình, đây là thân quân, và một khối đao thủ thì dày đặc những đĩa nhạt ngang ngực — bóng dáng đặc nhất trong năm binh chủng, và là khối trông đã thấy không nên đâm đầu vào.',
  'army.arm.skirmish.title': 'Quân khinh',
  'army.arm.skirmish.body':
    'Cây lao trước thời Hậu Lê và khẩu súng hoả mai sau đó, cầm thấp và vắt ngang thân. Khinh binh che phía trước rồi rút qua hàng quân. Một khối khinh binh trông như một mảng gạch chéo chứ không như một hàng cọc dựng — ở cỡ ngoài trận, đó chính là dấu nhận biết.',
  'army.arm.bow.title': 'Cung thủ',
  'army.arm.bow.body':
    'Cung đưa ra khỏi sườn, mũi tên vắt ngang, ống tên sau vai. Quân Việt là quân dùng nỏ từ thời Cổ Loa, và khối cung thủ đứng sau hàng quân bắn vượt qua đầu. Đây là bóng dáng mỏng nhất trong năm — và đọc như thế là đúng: đó là khối sẽ chết nếu có thứ gì tới được chỗ nó.',
  'army.arm.mounted.title': 'Kỵ binh',
  'army.arm.mounted.body':
    'Ngựa là giống ngựa nhỏ phương Nam — cao chừng 1,25 m tại vai, không phải chiến mã châu Âu — và được vẽ đúng cỡ thật, nên người kỵ binh chỉ cao hơn hàng quân đúng một cái đầu và đôi vai. Kỵ binh luôn là một cánh bên cạnh khối quân chứ không bao giờ là chính khối ấy: một ngựa một người tốn chừng mười bảy nét mực so với tám nét của một bộ binh, và cái giá ấy ép ra đúng lối đánh mà lịch sử đã chọn sẵn.',
};
