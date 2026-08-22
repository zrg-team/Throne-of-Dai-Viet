import type { StoryCatalog } from './types';

/**
 * Quả Cam. Vietnamese is the source.
 *
 * The one story where the tag does real work inside a single arc: the orange and the six
 * characters are `chinh-su`, his death is `da-su` because the annals do not record it, and his
 * survival is `ngoai-truyen`. The endings say which is which; the card never does.
 */
export const orangeVi: StoryCatalog = {
  title: 'Quả Cam',
  want: 'được đứng trong hàng, dù chỉ ở cuối hàng',
  waiting: 'Cậu ta vẫn đứng ngoài, và vẫn chưa đi.',
  stake: 'Một nghìn gia nô của một nhà, và một đứa trẻ mười lăm tuổi.',

  'regard.dismissed': 'Cậu ta đã về. Cậu ta không xin lần thứ hai.',
  'regard.seated': 'Cậu ta ngồi ở cuối hàng và không nói gì cả.',
  'regard.risen': 'Cờ đã dựng. Không ai ra lệnh cho nó được nữa.',

  'hoi-nghi-o-ben-song.line': 'Vương hầu tụ họp ở bến Bình Than. Bến sông đầy thuyền.',
  'hoi-nghi-o-ben-song.scene': 'Thuyền đậu kín một khúc sông và người ta phải bắc ván đi từ thuyền này sang thuyền kia. Trong bờ, quân canh xét từng người một. Ai có tên trong sổ thì vào, ai không thì đứng ngoài, và ngoài ấy cũng đông chẳng kém trong.',
  'hoi-nghi-o-ben-song.chronicle': 'Hội nghị họp ở Bình Than.',

  'ai-duoc-goi-ai-khong.line': 'Có người ở ngoài cổng từ sáng, không chịu về.',
  'ai-duoc-goi-ai-khong.scene': 'Quân canh biết cậu ta là ai, biết cả nhà cậu ta, và vẫn không cho vào — vì trong sổ không có tên, và vì cậu ta mười lăm tuổi. Cậu ta không cãi. Cậu ta chỉ đứng đó, cầm quả cam vua ban lúc nãy, và nhìn vào phía trong.',
  'ai-duoc-goi-ai-khong.chronicle': 'Cậu ta đứng ngoài cổng.',

  'juice-on-his-wrist.title': 'Nước cam trên cổ tay',
  'juice-on-his-wrist.body': 'Cậu ta xin được đi đánh giặc. Cậu ta mười lăm tuổi, chưa có tên trong sổ quân, và họ nhà cậu ta thì có nghìn người. Quan giữ cửa thưa lại rằng cậu ta đã đứng đấy từ sáng. Khi cậu ta chắp tay thì nước cam chảy xuống cổ tay — quả cam vua ban đã nát trong lòng bàn tay từ lúc nào, và cậu ta không hề hay biết.',
  'juice-on-his-wrist.advice': 'Mười lăm tuổi, thưa bệ hạ. Cho vào hôm nay thì mai cả triều đình xin theo.',
  'juice-on-his-wrist.he-is-a-child': 'Cậu ta còn nhỏ quá',
  'juice-on-his-wrist.he-is-a-child.d': 'Cho về nhà. Việc này không phải của trẻ con.',
  'juice-on-his-wrist.admit-him': 'Cho cậu ta vào',
  'juice-on-his-wrist.admit-him.d': 'Đã đứng đấy từ sáng thì cho vào mà nghe.',
  'juice-on-his-wrist.chronicle': 'Ngươi đã trả lời cậu bé ở cổng Bình Than.',

  'sau-chu-tren-la-co.line': 'Cậu ta về nhà, và thêu sáu chữ lên một lá cờ.',
  'sau-chu-tren-la-co.scene': 'Phá cường địch, báo hoàng ân. Sáu chữ, thêu chỉ vàng, do chính mẹ cậu ta thêu — bà không hỏi để làm gì, vì bà đã biết. Gia nô trong nhà không ai được gọi, mà sáng hôm sau sân nhà đã chật.',
  'sau-chu-tren-la-co.chronicle': 'Sáu chữ trên lá cờ: Phá cường địch, báo hoàng ân.',

  'he-raises-his-banner.title': 'Cậu ta dựng cờ',
  'he-raises-his-banner.body': 'Một nghìn gia nô và thân thuộc, tự sắm khí giới, tự lo lương. Không ai gọi họ và không ai trả công họ. Đạo quân ấy có mặt trên bản đồ của ngươi từ hôm nay — và ngươi không điều được nó, không gọi nó về được, và không biết nó sẽ đi đâu.',
  'he-raises-his-banner.ok': 'Cứ để thế',
  'he-raises-his-banner.chronicle': 'Cậu ta dựng cờ riêng. Một nghìn người theo.',

  'cong-nhan-hay-khong.title': 'Công nhận hay không',
  'cong-nhan-hay-khong.body': 'Đạo quân ấy đang đi về phía bắc và không hỏi ai. Quan Binh bộ muốn biết chép nó vào sổ thế nào: cấp lương và phong chức cho cậu ta, thì nó là quân của triều đình; không cấp gì cả, thì nó là việc riêng của một nhà — và cả hai cách đều không ngăn nó lại được.',
  'cong-nhan-hay-khong.advice': 'Cấp lương thì ta chịu trách nhiệm về nó, thưa bệ hạ. Không cấp thì ta không.',
  'cong-nhan-hay-khong.phong-chuc': 'Phong chức và cấp lương',
  'cong-nhan-hay-khong.phong-chuc.d': 'Đã đánh giặc cho ta thì ăn cơm của ta.',
  'cong-nhan-hay-khong.de-tu-lo': 'Để họ tự lo',
  'cong-nhan-hay-khong.de-tu-lo.d': 'Họ đã tự lo được đến đây rồi.',
  'cong-nhan-hay-khong.chronicle': 'Ngươi đã quyết việc lá cờ riêng ấy.',

  'quan-cua-cau-ta-duoc-cap-luong.line': 'Quân của cậu ta có tên trong sổ, và có gạo.',
  'quan-cua-cau-ta-duoc-cap-luong.scene': 'Viên thư lại đi theo để ghi chép thì về thưa rằng họ nhận gạo nhưng không nhận lệnh, rất lễ phép, và rằng cậu ta gọi ông ta là thầy rồi vẫn làm theo ý mình. Sổ vẫn ghi. Lệnh vẫn không tới nơi.',
  'quan-cua-cau-ta-duoc-cap-luong.chronicle': 'Quân ấy được cấp lương, và vẫn không nghe lệnh.',

  'khong-ai-cap-gi-ca.line': 'Không ai cấp gì cả, và họ vẫn đi.',
  'khong-ai-cap-gi-ca.scene': 'Họ ăn cơm nhà mang theo, hết thì mua, hết tiền thì các làng dọc đường cho. Không làng nào từ chối. Về sau, hỏi vì sao cho, người ta nói rằng vì lá cờ có sáu chữ, và ai cũng đọc được sáu chữ ấy.',
  'khong-ai-cap-gi-ca.chronicle': 'Không ai cấp gì. Họ vẫn đi.',

  'cau-ta-danh-o-cho-khong-ai-bao.line': 'Cậu ta đánh ở chỗ không ai bảo cậu ta đánh.',
  'cau-ta-danh-o-cho-khong-ai-bao.scene': 'Tin về sau ba ngày: lá cờ sáu chữ đã ở Hàm Tử, trước cả cánh quân được lệnh tới đấy. Cậu ta không báo trước, không xin phép, và cũng không thua. Quan Thái úy đọc tin xong thì im một lúc lâu rồi bảo: cho người đi theo mà đỡ cho nó.',
  'cau-ta-danh-o-cho-khong-ai-bao.chronicle': 'Lá cờ sáu chữ tới Hàm Tử trước quân triều đình.',

  'ham-tu-quan.title': 'Hàm Tử quan',
  'ham-tu-quan.body': 'Trận đánh lớn ở Hàm Tử đã bày ra rồi, và lá cờ sáu chữ đang ở cánh phải. Cậu ta xin đi tiên phong. Quan Thái úy nói rằng cậu ta sẽ đi dù có cho phép hay không, chỉ là cho phép thì còn xếp được đội hình quanh cậu ta.',
  'ham-tu-quan.advice': 'Cho nó đi đầu thì trận này thắng đẹp hơn, thưa bệ hạ. Và có thể chỉ thắng một lần.',
  'ham-tu-quan.cho-cau-ta-di-dau': 'Cho cậu ta đi đầu',
  'ham-tu-quan.cho-cau-ta-di-dau.d': 'Đó là chỗ cậu ta xin.',
  'ham-tu-quan.goi-cau-ta-ve': 'Gọi cậu ta về hậu quân',
  'ham-tu-quan.goi-cau-ta-ve.d': 'Một mệnh lệnh, lần này bằng ấn của ta.',
  'ham-tu-quan.chronicle': 'Ngươi đã quyết chỗ đứng của cậu ta ở Hàm Tử.',

  'the-banner-falls.title': 'Lá cờ đổ',
  'the-banner-falls.body': 'Lá cờ sáu chữ vào trước và không ra. Người ta tìm được cậu ta ở chỗ xa nhất mà cánh quân ấy tới được, và mang về theo đường sông. Cậu ta mười sáu tuổi. Sử chép trận Hàm Tử, chép lá cờ, chép sáu chữ — chỗ này thì sử không chép, và cái ngươi vừa đọc là người đời sau kể lại.',
  'the-banner-falls.ok': 'Chép lấy sáu chữ ấy',
  'the-banner-falls.chronicle': 'Lá cờ sáu chữ vào trước và không ra.',

  'cau-ta-song.title': 'Cậu ta sống',
  'cau-ta-song.body': 'Cậu ta nhận lệnh về hậu quân, và giận suốt một tháng. Trận Hàm Tử thắng mà không có cậu ta ở hàng đầu. Sử không chép cậu ta chết ở đâu — nên cậu ta còn sống không phải là trái sử, chỉ là sử không nói tới nữa. Bây giờ cậu ta mười bảy, có tiếng khắp nước, và chưa có việc gì.',
  'cau-ta-song.ok': 'Vậy thì tính tiếp',
  'cau-ta-song.chronicle': 'Cậu ta còn sống, và sử thôi nhắc tới cậu ta.',

  'mot-nguoi-song-sot-thi-lam-gi.title': 'Một người còn sống thì làm gì',
  'mot-nguoi-song-sot-thi-lam-gi.body': 'Cậu ta mười bảy tuổi, có một nghìn người theo, và cả nước biết tên. Giao biên ải thì cậu ta có chỗ dùng và ở xa kinh thành. Cho về quê thì cậu ta yên, và cái tên ấy nguội dần đi. Quan Thái úy không giấu rằng ông ta thích cách thứ nhất, và cũng không giấu vì sao ông ta không dám nói to.',
  'mot-nguoi-song-sot-thi-lam-gi.advice': 'Một cái tên như thế mà để không thì người khác sẽ tìm ra việc cho nó, thưa bệ hạ.',
  'mot-nguoi-song-sot-thi-lam-gi.giao-bien-ai': 'Giao cho cậu ta một biên ải',
  'mot-nguoi-song-sot-thi-lam-gi.giao-bien-ai.d': 'Có chỗ dùng, và ở xa.',
  'mot-nguoi-song-sot-thi-lam-gi.cho-ve-que': 'Cho cậu ta về quê',
  'mot-nguoi-song-sot-thi-lam-gi.cho-ve-que.d': 'Đã đủ rồi. Để cậu ta lớn nốt.',
  'mot-nguoi-song-sot-thi-lam-gi.chronicle': 'Ngươi đã quyết chỗ của cậu ta sau trận.',

  'tran-bien-mot-doi.line': 'Cậu ta giữ biên ải ấy đến hết đời.',
  'tran-bien-mot-doi.scene': 'Không có trận nào lớn ở đấy nữa, mà cũng không cần — người bên kia biết ai đang giữ. Cậu ta không bao giờ về kinh quá mười ngày. Lá cờ sáu chữ vẫn treo, đã bạc màu, và mỗi năm mẹ cậu ta thêu lại một lần.',
  'tran-bien-mot-doi.chronicle': 'Cậu ta giữ biên ải, và không ai qua được.',

  've-que-trong-cam.line': 'Cậu ta về quê, và trồng cam.',
  've-que-trong-cam.scene': 'Vườn cam ấy về sau có tiếng, và người trong vùng vẫn gọi tên cậu ta khi nói tới nó. Cậu ta không nhận chức nào nữa. Ai hỏi chuyện Bình Than thì cậu ta kể, rất bình thản, và không lần nào kể tới đoạn quả cam nát trong tay.',
  've-que-trong-cam.chronicle': 'Cậu ta về quê. Vườn cam ấy còn tới bây giờ.',

  'tieng-noi-tre-nhat-trong-phong.line': 'Cậu ta ngồi ở cuối hàng, và cậu ta nói đúng.',
  'tieng-noi-tre-nhat-trong-phong.scene': 'Cậu ta không nói nhiều — hai lần trong cả buổi — và cả hai lần đều là điều chưa ai nói ra. Có vương hầu khó chịu ra mặt. Quan Thái úy thì ghi lại cả hai câu, không bình luận gì, và cái sổ ấy về sau có người đọc.',
  'tieng-noi-tre-nhat-trong-phong.chronicle': 'Cậu ta ngồi trong hội nghị, và nói đúng.',

  'lam-gi-voi-cau-ta.title': 'Làm gì với cậu ta',
  'lam-gi-voi-cau-ta.body': 'Đã cho vào rồi thì phải cho làm gì đó, mà cậu ta thì mười lăm tuổi. Giao một cánh quân, thì cả triều đình nhìn vào. Giữ bên cạnh làm tùy tùng, thì cậu ta học được việc — và cậu ta sẽ hiểu ra rằng đấy là cách nói không mà không phải nói ra.',
  'lam-gi-voi-cau-ta.advice': 'Giao quân cho một đứa trẻ thì lính của nó là người trả giá, thưa bệ hạ.',
  'lam-gi-voi-cau-ta.giao-mot-quan': 'Giao cho cậu ta một cánh quân',
  'lam-gi-voi-cau-ta.giao-mot-quan.d': 'Nghìn gia nô của nhà cậu ta cũng đã đủ một cánh.',
  'lam-gi-voi-cau-ta.giu-ben-canh': 'Giữ bên cạnh ta',
  'lam-gi-voi-cau-ta.giu-ben-canh.d': 'Nhìn trước, làm sau.',
  'lam-gi-voi-cau-ta.chronicle': 'Ngươi đã quyết việc của cậu ta trong hội nghị.',

  'cau-xin-tien-phong.title': 'Cậu ta xin đi tiên phong',
  'cau-xin-tien-phong.body': 'Cánh quân của cậu ta đã ra tới nơi và cậu ta xin đi đầu. Đấy là chỗ nguy nhất và cậu ta biết. Cậu ta lập luận rất gọn: quân của cậu ta là người nhà cậu ta, họ theo cậu ta chứ không theo cái chức, nên nếu cậu ta đứng sau thì họ cũng không tiến được.',
  'cau-xin-tien-phong.advice': 'Nó nói không sai. Đó là chỗ đáng lo, thưa bệ hạ.',
  'cau-xin-tien-phong.cho-di': 'Cho đi',
  'cau-xin-tien-phong.cho-di.d': 'Nó nói đúng, và nó biết nó đang xin gì.',
  'cau-xin-tien-phong.giu-lai': 'Giữ lại hàng sau',
  'cau-xin-tien-phong.giu-lai.d': 'Mười lăm tuổi thì chưa đi đầu được.',
  'cau-xin-tien-phong.chronicle': 'Ngươi đã quyết chỗ đứng của cậu ta.',

  'tuong-tre-lon-len.line': 'Cậu ta lớn lên thành tướng, và vẫn là người xin đi đầu.',
  'tuong-tre-lon-len.scene': 'Ba năm sau thì không ai nhắc tuổi cậu ta nữa. Cậu ta đánh cẩn thận hơn hồi mười lăm, mà vẫn ở hàng đầu, và lính cũ trong cánh quân ấy chưa ai bỏ đi. Lá cờ sáu chữ vẫn dùng — cậu ta bảo thay thì phí, chữ vẫn còn đọc được.',
  'tuong-tre-lon-len.chronicle': 'Cậu ta thành tướng, và vẫn đi đầu.',

  'mat-o-tien-phong-that.title': 'Mất ở tiên phong',
  'mat-o-tien-phong-that.body': 'Cậu ta đi đầu và trận ấy thắng. Cậu ta thì không về. Lính của cậu ta mang cậu ta về, đi bộ, suốt bốn ngày, và không ai trong bọn họ chịu lên xe. Triều đình truy phong rất hậu. Không có cái nào trong số ấy là thứ họ muốn.',
  'mat-o-tien-phong-that.ok': 'Truy phong theo lễ',
  'mat-o-tien-phong-that.chronicle': 'Cậu ta đi đầu, và không về.',

  'trieu-dinh-cuoi-cau-ta.line': 'Trong sảnh có người cười khi cậu ta đứng dậy.',
  'trieu-dinh-cuoi-cau-ta.scene': 'Không ai cười to. Nhưng cậu ta nghe thấy, và cậu ta ngồi xuống, và từ hôm ấy cậu ta không đứng dậy nữa. Cậu ta vẫn tới đủ mọi buổi, vẫn ghi chép, vẫn thưa khi được hỏi. Quan Thái úy có nói với ngươi một câu về việc này, rất khẽ, rồi thôi không nhắc lại.',
  'trieu-dinh-cuoi-cau-ta.chronicle': 'Cậu ta thôi đứng dậy trong sảnh.',

  'ao-tia-hay-la-co.title': 'Áo tía hay lá cờ',
  'ao-tia-hay-la-co.body': 'Cậu ta đã đứng sau lưng ngươi hai năm, và cậu ta biết việc. Cho cậu ta một ghế trong triều thì cậu ta ở lại, làm được, và cả nước sẽ quen với việc một người mười bảy tuổi mặc áo tía. Không cho thì cậu ta cũng không xin — cậu ta sẽ đợi, và có người đợi cả đời.',
  'ao-tia-hay-la-co.advice': 'Cho ghế thì mất một viên tướng. Không cho thì mất cả hai, thưa bệ hạ.',
  'ao-tia-hay-la-co.cho-cau-ta-mot-ghe': 'Cho cậu ta một ghế',
  'ao-tia-hay-la-co.cho-cau-ta-mot-ghe.d': 'Việc cậu ta làm được là việc này.',
  'ao-tia-hay-la-co.de-cau-ta-doi': 'Để cậu ta đợi',
  'ao-tia-hay-la-co.de-cau-ta-doi.d': 'Còn sớm. Còn nhiều mùa nữa.',
  'ao-tia-hay-la-co.chronicle': 'Ngươi đã quyết việc cái ghế của cậu ta.',

  'mac-ao-tia-that.line': 'Cậu ta mặc áo tía, và không bao giờ cầm quân nữa.',
  'mac-ao-tia-that.scene': 'Cậu ta làm việc giỏi, kỹ, và không ai chê được. Lá cờ sáu chữ thì cất trong rương. Có lần quan Thái úy hỏi sao không treo, cậu ta thưa rằng treo ở đây thì không đúng chỗ — rồi thôi, và hai người không nói thêm gì nữa.',
  'mac-ao-tia-that.chronicle': 'Cậu ta thành quan, và lá cờ cất đi.',

  'cau-ta-thoi-hoi.line': 'Cậu ta thôi hỏi. Cậu ta vẫn tới đủ mọi buổi.',
  'cau-ta-thoi-hoi.scene': 'Đến mùa thứ ba thì cậu ta ngồi ở cuối hàng như một người đã ở đấy từ lâu lắm. Cậu ta không giận ai. Gia nô nhà cậu ta lần lượt về quê, không ai bảo, và sân nhà rộng ra dần cho tới khi lại rộng như cũ.',
  'cau-ta-thoi-hoi.chronicle': 'Cậu ta thôi hỏi, và người nhà lần lượt về.',

  // What the story page calls each step of the spine.
  'node.binh-than': 'Hội nghị Bình Than',
  'node.qua-cam': 'Quả cam nát trong tay',
  'node.la-co': 'Lá cờ sáu chữ',
  'node.chinh-quy': 'Được cấp lương',
  'node.co-rieng': 'Tự lo lấy',
  'node.ham-tu': 'Hàm Tử quan',
  'node.nga-xuong': 'Lá cờ đổ',
  'node.song-sot': 'Cậu ta sống',
  'node.tran-bien': 'Trấn biên một đời',
  'node.ve-que': 'Về quê trồng cam',
  'node.vao-hoi': 'Được vào hội nghị',
  'node.giao-quan': 'Được giao một cánh quân',
  'node.tuong-tre': 'Tướng trẻ',
  'node.mat-o-tien-phong': 'Mất ở tiên phong',
  'node.giu-ben-canh': 'Giữ bên cạnh vua',
  'node.mac-ao-tia': 'Mặc áo tía',
  'node.bi-lang-quen': 'Bị quên dần',
};

export const orangeEn: StoryCatalog = {
  title: 'The Boy With the Orange',
  want: 'a place in the line, even at the end of it',
  waiting: 'He is still outside, and he still has not gone home.',
  stake: 'A thousand of one household’s people, and a fifteen-year-old.',

  'regard.dismissed': 'He went home. He did not ask twice.',
  'regard.seated': 'He sits at the end of the row and says nothing.',
  'regard.risen': 'The banner is up. Nobody gives it orders now.',

  'hoi-nghi-o-ben-song.line': 'The lords are gathering at the Bình Than landing. The river is full of boats.',
  'hoi-nghi-o-ben-song.scene': 'The boats are moored so thickly that people cross from one to the next on planks. On the bank the guards check every man against a list. Those with a name go in; those without stand outside, and outside is no less crowded than in.',
  'hoi-nghi-o-ben-song.chronicle': 'The council met at Bình Than.',

  'ai-duoc-goi-ai-khong.line': 'Someone has been at the gate since morning and will not go home.',
  'ai-duoc-goi-ai-khong.scene': 'The guards know who he is and know his household, and still will not let him in — because the list does not have him, and because he is fifteen. He does not argue. He stands there holding the orange the king gave him earlier, looking in.',
  'ai-duoc-goi-ai-khong.chronicle': 'He stood outside the gate.',

  'juice-on-his-wrist.title': 'Juice on His Wrist',
  'juice-on-his-wrist.body': 'He asks to be sent against the enemy. He is fifteen, he is not on any muster roll, and his household numbers a thousand. The gate officer reports that he has been standing there since morning. When he raises his hands the juice runs down his wrist — the orange the king gave him has been crushed to pulp in his fist for some time, and he has not noticed.',
  'juice-on-his-wrist.advice': 'Fifteen, my lord. Admit him today and tomorrow the whole court asks the same.',
  'juice-on-his-wrist.he-is-a-child': 'He is a child',
  'juice-on-his-wrist.he-is-a-child.d': 'Send him home. This is not children’s business.',
  'juice-on-his-wrist.admit-him': 'Let him in',
  'juice-on-his-wrist.admit-him.d': 'He has stood there since morning. Let him listen.',
  'juice-on-his-wrist.chronicle': 'You answered the boy at the Bình Than gate.',

  'sau-chu-tren-la-co.line': 'He went home and had six characters embroidered on a banner.',
  'sau-chu-tren-la-co.scene': 'Phá cường địch, báo hoàng ân — destroy the strong foe, repay the imperial favour. Six characters in gold thread, sewn by his own mother, who did not ask what it was for because she already knew. Nobody summoned the household; by the next morning the yard was full.',
  'sau-chu-tren-la-co.chronicle': 'Six characters on a banner: destroy the strong foe, repay the imperial favour.',

  'he-raises-his-banner.title': 'He Raises His Banner',
  'he-raises-his-banner.body': 'A thousand retainers and kinsmen, armed at their own cost, fed at their own cost. Nobody called them and nobody pays them. That host is on your map from today — and you cannot direct it, cannot recall it, and do not know where it is going.',
  'he-raises-his-banner.ok': 'Leave it be',
  'he-raises-his-banner.chronicle': 'He raised his own banner. A thousand followed.',

  'cong-nhan-hay-khong.title': 'Recognise It or Not',
  'cong-nhan-hay-khong.body': 'That host is moving north and asking nobody. The Minister of War wants to know how to enter it in the books: rations and a commission make it the throne’s army; nothing at all makes it one family’s private business — and neither one stops it.',
  'cong-nhan-hay-khong.advice': 'Feed it and we answer for it, my lord. Do not, and we do not.',
  'cong-nhan-hay-khong.phong-chuc': 'Commission him and send rations',
  'cong-nhan-hay-khong.phong-chuc.d': 'If he fights for us he eats our rice.',
  'cong-nhan-hay-khong.de-tu-lo': 'Let them provide for themselves',
  'cong-nhan-hay-khong.de-tu-lo.d': 'They have managed this far.',
  'cong-nhan-hay-khong.chronicle': 'You decided the matter of the private banner.',

  'quan-cua-cau-ta-duoc-cap-luong.line': 'His men are on the rolls now, and drawing rice.',
  'quan-cua-cau-ta-duoc-cap-luong.scene': 'The clerk sent to keep their books reports that they accept the rice and do not accept orders, very politely, and that the boy calls him teacher and then does as he likes. The books are kept. The orders do not arrive anywhere.',
  'quan-cua-cau-ta-duoc-cap-luong.chronicle': 'They took the rations and not the orders.',

  'khong-ai-cap-gi-ca.line': 'Nobody gave them anything, and they went anyway.',
  'khong-ai-cap-gi-ca.scene': 'They ate what they carried, bought what they could, and when the money ran out the villages along the road fed them. No village refused. Asked afterwards why, people said it was the six characters, and that anyone could read them.',
  'khong-ai-cap-gi-ca.chronicle': 'Nobody supplied them. They went anyway.',

  'cau-ta-danh-o-cho-khong-ai-bao.line': 'He is fighting where nobody told him to fight.',
  'cau-ta-danh-o-cho-khong-ai-bao.scene': 'The news takes three days: the six-character banner is at Hàm Tử, ahead of the column that was ordered there. He did not report, did not ask, and did not lose. The Marshal read it, said nothing for a while, then said: send someone to cover him.',
  'cau-ta-danh-o-cho-khong-ai-bao.chronicle': 'The banner reached Hàm Tử ahead of the army.',

  'ham-tu-quan.title': 'Hàm Tử Pass',
  'ham-tu-quan.body': 'The great battle at Hàm Tử is drawn up, and the six-character banner is on the right. He asks for the vanguard. The Marshal says he will take it whether or not it is given — only that if it is given, the line can be built around him.',
  'ham-tu-quan.advice': 'Give him the van and we win it handsomely, my lord. Possibly only once.',
  'ham-tu-quan.cho-cau-ta-di-dau': 'Give him the vanguard',
  'ham-tu-quan.cho-cau-ta-di-dau.d': 'It is what he asked for.',
  'ham-tu-quan.goi-cau-ta-ve': 'Order him to the rear',
  'ham-tu-quan.goi-cau-ta-ve.d': 'One order, this time under our seal.',
  'ham-tu-quan.chronicle': 'You decided where he would stand at Hàm Tử.',

  'the-banner-falls.title': 'The Banner Falls',
  'the-banner-falls.body': 'The six-character banner went in first and did not come out. They found him at the furthest point that wing reached and brought him back by river. He was sixteen. The annals record the battle, the banner and the six characters; they do not record this part, and what you have just read is what later generations said.',
  'the-banner-falls.ok': 'Record the six characters',
  'the-banner-falls.chronicle': 'The banner went in first and did not come out.',

  'cau-ta-song.title': 'He Lives',
  'cau-ta-song.body': 'He took the order to the rear, and was angry for a month. Hàm Tử was won without him in the front rank. The annals do not say where he died — so his being alive does not contradict them, it is only something they stop mentioning. He is seventeen now, known everywhere, and has nothing to do.',
  'cau-ta-song.ok': 'Then there is more to settle',
  'cau-ta-song.chronicle': 'He lived, and the annals stopped mentioning him.',

  'mot-nguoi-song-sot-thi-lam-gi.title': 'What to Do With a Survivor',
  'mot-nguoi-song-sot-thi-lam-gi.body': 'He is seventeen, a thousand people follow him, and the whole country knows his name. Give him a frontier and he is useful and far from the capital. Send him home and he is quiet, and the name cools. The Marshal does not hide which he prefers, and does not hide why he will not say it loudly.',
  'mot-nguoi-song-sot-thi-lam-gi.advice': 'A name like that left idle, my lord, and someone else finds work for it.',
  'mot-nguoi-song-sot-thi-lam-gi.giao-bien-ai': 'Give him a frontier',
  'mot-nguoi-song-sot-thi-lam-gi.giao-bien-ai.d': 'Useful, and a long way off.',
  'mot-nguoi-song-sot-thi-lam-gi.cho-ve-que': 'Send him home',
  'mot-nguoi-song-sot-thi-lam-gi.cho-ve-que.d': 'That is enough. Let him finish growing up.',
  'mot-nguoi-song-sot-thi-lam-gi.chronicle': 'You decided where he would go after the battle.',

  'tran-bien-mot-doi.line': 'He held that frontier for the rest of his life.',
  'tran-bien-mot-doi.scene': 'There was never another large battle there, and there did not need to be — the other side knew who was holding it. He never stayed more than ten days in the capital. The six-character banner still flew, faded now, and his mother re-embroidered it once a year.',
  'tran-bien-mot-doi.chronicle': 'He held the frontier, and nobody crossed it.',

  've-que-trong-cam.line': 'He went home and planted oranges.',
  've-que-trong-cam.scene': 'That orchard became well known, and people in the district still use his name when they talk about it. He took no further office. Asked about Bình Than he would tell it quite calmly, and never once got as far as the orange crushed in his hand.',
  've-que-trong-cam.chronicle': 'He went home. The orchard is still there.',

  'tieng-noi-tre-nhat-trong-phong.line': 'He sits at the end of the row, and he is right.',
  'tieng-noi-tre-nhat-trong-phong.scene': 'He does not say much — twice in the whole session — and both times it was the thing nobody had said. One of the lords was visibly annoyed. The Marshal wrote both remarks down without comment, and that book was read later.',
  'tieng-noi-tre-nhat-trong-phong.chronicle': 'He sat in the council, and he was right.',

  'lam-gi-voi-cau-ta.title': 'What to Do With Him',
  'lam-gi-voi-cau-ta.body': 'Having let him in, he must be given something, and he is fifteen. Give him a command and the whole court is watching. Keep him at your shoulder as an aide and he learns the work — and he will understand that this is how one says no without saying it.',
  'lam-gi-voi-cau-ta.advice': 'Give a child an army, my lord, and his soldiers pay for it.',
  'lam-gi-voi-cau-ta.giao-mot-quan': 'Give him a command',
  'lam-gi-voi-cau-ta.giao-mot-quan.d': 'His household alone is a wing.',
  'lam-gi-voi-cau-ta.giu-ben-canh': 'Keep him at your side',
  'lam-gi-voi-cau-ta.giu-ben-canh.d': 'Watch first, act later.',
  'lam-gi-voi-cau-ta.chronicle': 'You decided his place in the council.',

  'cau-xin-tien-phong.title': 'He Asks for the Vanguard',
  'cau-xin-tien-phong.body': 'His wing is in the field and he asks for the front. It is the most dangerous place and he knows it. His argument is short: his men are his household, they follow him and not the commission, so if he stands behind them they will not advance either.',
  'cau-xin-tien-phong.advice': 'He is not wrong. That is the worrying part, my lord.',
  'cau-xin-tien-phong.cho-di': 'Let him have it',
  'cau-xin-tien-phong.cho-di.d': 'He is right, and he knows what he is asking for.',
  'cau-xin-tien-phong.giu-lai': 'Keep him in the second rank',
  'cau-xin-tien-phong.giu-lai.d': 'Fifteen is too young for the front.',
  'cau-xin-tien-phong.chronicle': 'You decided where he would stand.',

  'tuong-tre-lon-len.line': 'He grew into a commander, and still asks for the front.',
  'tuong-tre-lon-len.scene': 'Three years on nobody mentions his age. He fights more carefully than he did at fifteen and is still in the front rank, and not one of the old hands in that wing has left. The six-character banner is still in use — he says replacing it would be waste, the characters are perfectly legible.',
  'tuong-tre-lon-len.chronicle': 'He became a commander, and still went first.',

  'mat-o-tien-phong-that.title': 'Lost in the Van',
  'mat-o-tien-phong-that.body': 'He led and the battle was won. He did not come back. His men carried him home on foot over four days and not one of them would ride. The court granted him every posthumous honour available. None of them was the thing his men wanted.',
  'mat-o-tien-phong-that.ok': 'Grant the honours',
  'mat-o-tien-phong-that.chronicle': 'He led from the front, and did not return.',

  'trieu-dinh-cuoi-cau-ta.line': 'Someone in the hall laughed when he stood up.',
  'trieu-dinh-cuoi-cau-ta.scene': 'Nobody laughed loudly. But he heard it, and he sat down, and from that day he did not stand up again. He still attends everything, still takes notes, still answers when asked. The Marshal said one thing to you about it, very quietly, and never raised it again.',
  'trieu-dinh-cuoi-cau-ta.chronicle': 'He stopped standing up in the hall.',

  'ao-tia-hay-la-co.title': 'The Purple Robe or the Banner',
  'ao-tia-hay-la-co.body': 'He has stood behind you for two years and he knows the work. Give him a seat and he stays, and does it well, and the country gets used to a seventeen-year-old in a purple robe. Withhold it and he will not ask — he will wait, and some people wait their whole lives.',
  'ao-tia-hay-la-co.advice': 'Give the seat and lose a commander. Withhold it and lose both, my lord.',
  'ao-tia-hay-la-co.cho-cau-ta-mot-ghe': 'Give him a seat',
  'ao-tia-hay-la-co.cho-cau-ta-mot-ghe.d': 'This is the work he can do.',
  'ao-tia-hay-la-co.de-cau-ta-doi': 'Let him wait',
  'ao-tia-hay-la-co.de-cau-ta-doi.d': 'It is early. There are other seasons.',
  'ao-tia-hay-la-co.chronicle': 'You decided the matter of his seat.',

  'mac-ao-tia-that.line': 'He wears the purple robe, and never commands again.',
  'mac-ao-tia-that.scene': 'He is good at it, meticulous, and nobody can fault him. The six-character banner is in a chest. The Marshal asked once why it was not hung up, and he said it would not be the right place for it — and that was the end of it, and neither of them raised it again.',
  'mac-ao-tia-that.chronicle': 'He became a minister, and the banner was put away.',

  'cau-ta-thoi-hoi.line': 'He stopped asking. He still attends everything.',
  'cau-ta-thoi-hoi.scene': 'By the third season he sits at the end of the row like a man who has been there a very long time. He is not angry with anyone. His household drifted back to the country one at a time, unbidden, until the yard was as wide as it had been before.',
  'cau-ta-thoi-hoi.chronicle': 'He stopped asking, and his people went home.',

  // What the story page calls each step of the spine.
  'node.binh-than': 'The council at Bình Than',
  'node.qua-cam': 'The orange in his fist',
  'node.la-co': 'The six-character banner',
  'node.chinh-quy': 'Commissioned and fed',
  'node.co-rieng': 'Left to provide for himself',
  'node.ham-tu': 'Hàm Tử pass',
  'node.nga-xuong': 'The banner falls',
  'node.song-sot': 'He lives',
  'node.tran-bien': 'A frontier, for life',
  'node.ve-que': 'Home, and an orchard',
  'node.vao-hoi': 'Admitted to the council',
  'node.giao-quan': 'Given a command',
  'node.tuong-tre': 'The young commander',
  'node.mat-o-tien-phong': 'Lost in the van',
  'node.giu-ben-canh': 'Kept at your side',
  'node.mac-ao-tia': 'The purple robe',
  'node.bi-lang-quen': 'Quietly forgotten',
};
