import type { StoryCatalog } from './types';

/**
 * Thánh Gióng. Vietnamese is the source — the register of a village clerk asking for his
 * objection to be minuted does not survive a round trip through English.
 *
 * Three keys per ambient beat, and the split matters:
 *
 * - `line` is the **header strip**: one line, on a 390-pixel phone. A headline, not a scene.
 * - `scene` is the room it happened in, 40–90 words, read from the bell and the story page.
 * - `chronicle` is the **annal entry**, and stays under twelve words on purpose. The contrast
 *   between a sixty-word scene and its seven-word record is the whole conceit; inflating the
 *   annal line would destroy it.
 */
export const thanhGiongVi: StoryCatalog = {
  title: 'Thánh Gióng',
  want: 'một con ngựa sắt, một cây roi sắt, một áo giáp sắt',
  waiting: 'Làng Phù Đổng đang đợi, và giặc thì không đợi.',
  stake: 'Người và thóc đưa cho đứa bé là người và thóc không còn để mộ quân.',

  'regard.unanswered': 'Không ai đến. Chuyện ấy cũng được ghi lại.',
  'regard.fed': 'Lò rèn đã đỏ lửa. Đứa bé vẫn chưa đứng dậy nổi.',
  'regard.rising': 'Nó cao hơn cái cửa nó vừa ngồi.',
  'regard.gone': 'Ngài đã đi rồi. Vết chân ngựa còn đọng nước.',

  // ── tin-giac ──────────────────────────────────────────────────────────────
  'giac-an-qua-vu-ninh.line': 'Giặc Ân đã qua Vũ Ninh. Tin về ba đường, không đường nào khớp đường nào.',
  'giac-an-qua-vu-ninh.scene': 'Ba người lính trạm về tới cửa Nam trong cùng một buổi chiều, mỗi người một con số. Quan Binh bộ cho chép cả ba vào sổ, rồi gạch đi con số nhỏ nhất — không phải vì ông tin hai con số kia, mà vì ông không dám tin con số ấy.',
  'giac-an-qua-vu-ninh.chronicle': 'Giặc Ân qua Vũ Ninh.',

  'ba-ban-tin-khong-khop.line': 'Người ta bắt đầu chở đồ ra khỏi kinh thành bằng đường sông.',
  'ba-ban-tin-khong-khop.scene': 'Bến sông đông hơn thường lệ và không ai nói vì sao. Một bà lái đò nói rằng ba nhà buôn lụa đã trả tiền trước cho cả tháng sau, việc mà chưa năm nào họ làm. Bà không nói thêm gì nữa. Bà chỉ đợi khách.',
  'ba-ban-tin-khong-khop.chronicle': 'Kinh thành bắt đầu dọn đồ.',

  'loi-keu-goi.title': 'Lời kêu gọi',
  'loi-keu-goi.body': 'Quan Lễ bộ xin làm như triều đình đời tiên đế: sai sứ giả đi khắp các ngả, vào từng làng, rao tìm người cứu nước. Việc ấy tốn của kho và tốn một mùa. Quan Thái úy nhắc, không phải để mỉa, rằng đời tiên đế cũng làm thế mà chẳng được gì — và rằng một mùa là quãng thời gian giặc cần để tới đây.',
  'loi-keu-goi.advice': 'Sứ giả tốn một mùa, thưa bệ hạ. Giặc không đợi một mùa.',
  'loi-keu-goi.sai-su-gia': 'Sai sứ giả đi',
  'loi-keu-goi.sai-su-gia.d': 'Khắp các ngả, vào cả những làng chưa ai đếm.',
  'loi-keu-goi.ta-co-quan-roi': 'Ta đã có quân',
  'loi-keu-goi.ta-co-quan-roi.d': 'Có bấy nhiêu thì đánh bấy nhiêu.',
  'loi-keu-goi.chronicle': 'Ngươi đã quyết cách gọi người cứu nước.',

  // ── su-gia ────────────────────────────────────────────────────────────────
  'a-child-who-has-never-spoken.line': 'Ở {land} có đứa bé lên ba chưa từng nói. Hôm qua nó nói.',
  'a-child-who-has-never-spoken.scene': 'Sứ giả rao ở sân đình {land} thì đứa bé nhà bà lão góa ngồi dậy và bảo mẹ mời sứ giả vào. Bà mẹ sợ hơn là mừng. Nó lên ba, chưa từng nói một tiếng nào, và câu đầu tiên nó nói không phải là gọi mẹ.',
  'a-child-who-has-never-spoken.chronicle': 'Đứa bé ở {land} lên tiếng.',

  'su-gia-di-qua-nhung-lang-khong-tra-loi.line': 'Sứ giả đã qua mười một làng. Mười một làng cùng im.',
  'su-gia-di-qua-nhung-lang-khong-tra-loi.scene': 'Người ta ra nghe, rồi về. Có làng dọn cơm cho sứ giả ăn rồi tiễn ra tận đầu ngõ, tử tế và dứt khoát. Sứ giả ghi vào sổ tên từng làng, không ghi gì thêm. Ông ta biết cái sổ ấy rồi cũng có người đọc.',
  'su-gia-di-qua-nhung-lang-khong-tra-loi.chronicle': 'Mười một làng không trả lời.',

  'he-asked-for-an-iron-horse.title': 'Nó xin một con ngựa sắt',
  'he-asked-for-an-iron-horse.body': 'Nó xin một con ngựa sắt, một cây roi sắt, một áo giáp sắt. Nó không xin gì khác — không chức, không ruộng, không hứa hẹn. Sứ giả chép đúng từng chữ rồi gửi về, và thợ rèn ở {land} muốn biết có bắt đầu hay không. Sắt thì đắt, và đứa bé thì lên ba.',
  'he-asked-for-an-iron-horse.advice': 'Sắt ấy đủ đúc mũi giáo cho hai trăm người, thưa bệ hạ.',
  'he-asked-for-an-iron-horse.make-it': 'Rèn cho nó',
  'he-asked-for-an-iron-horse.make-it.d': 'Cả trấn góp sắt lại.',
  'he-asked-for-an-iron-horse.a-child-is-a-child': 'Trẻ con thì là trẻ con',
  'he-asked-for-an-iron-horse.a-child-is-a-child.d': 'Cho nó gạo, đừng cho nó sắt.',
  'he-asked-for-an-iron-horse.dua-ve-trieu': 'Đưa nó về triều',
  'he-asked-for-an-iron-horse.dua-ve-trieu.d': 'Nó là cái gì thì ở đây cũng an toàn hơn.',
  'he-asked-for-an-iron-horse.chronicle': 'Ngươi đã trả lời đứa bé ở {land}.',

  // ── ren-sat ───────────────────────────────────────────────────────────────
  'he-eats-everything-the-village-has.line': 'Nó ăn hết phần cơm của cả nhà, rồi cả xóm nấu thêm.',
  'he-eats-everything-the-village-has.scene': 'Nhà bà lão hết gạo từ hôm kia. Xóm dưới mang sang một thúng, xóm trên mang sang hai. Không ai bảo ai và không ai xin triều đình cái gì. Đứa bé ăn xong thì ngồi im, và người ta thấy vai nó đã chạm vào thanh ngang cửa.',
  'he-eats-everything-the-village-has.chronicle': 'Nó ăn hơn cả xóm nấu được.',

  'his-armour-splits.line': 'Cái áo giáp tuần trước vừa xong đã không mặc vừa nữa.',
  'his-armour-splits.scene': 'Thợ rèn đo lại lần thứ ba. Lần này ông ta không hỏi ai, chỉ nới rộng ra một gang rồi làm tiếp, và bảo thằng nhỏ kéo bễ đừng nghỉ tay. Cái áo cũ treo ở góc lò. Không ai nghĩ tới chuyện nấu lại nó.',
  'his-armour-splits.chronicle': 'Áo giáp phải làm lại, lớn hơn.',

  'vien-thu-lai-coi-kho.line': 'Viên thư lại coi kho xin được ghi lại một điều vào sổ.',
  'vien-thu-lai-coi-kho.scene': 'Ông ta không phản đối. Ông ta chỉ xin ghi rằng số thóc và số đinh đã xuất cho làng {land} trong ba mùa vừa rồi bằng số dùng để mộ một đạo quân, và rằng ông ta có ghi điều đó lại. Rồi ông ta đóng sổ. Ông ta là người duy nhất trong việc này nhìn thấy trước chuyện sẽ đi tới đâu.',
  'vien-thu-lai-coi-kho.chronicle': 'Sổ kho đã ghi lại việc này.',

  'bay-nong-com-ba-nong-ca.line': 'Phù Đổng nấu hết những gì có, và nó vẫn đói.',
  'bay-nong-com-ba-nong-ca.scene': 'Cả làng góp lại được bảy nong cơm, ba nong cà. Ăn xong nó đứng dậy, cao hơn cái cửa nó vừa ngồi. Ông trưởng làng đã cho người sang làng bên, làng bên lại cho người sang làng nữa. Đi cùng thúng gạo là những người trai vác thúng — và họ ở lại đó.',
  'bay-nong-com-ba-nong-ca.gop': 'Cho làng góp thêm',
  'bay-nong-com-ba-nong-ca.gui-nguoi-va-gao': 'Cho làng góp thêm',
  'bay-nong-com-ba-nong-ca.gui-nguoi-va-gao.d': 'Hai trăm đinh của huyện, và thóc đi theo họ.',
  'bay-nong-com-ba-nong-ca.chronicle': 'Huyện đưa người và thóc sang {land}.',

  'ngua-sat-da-xong.title': 'Ngựa sắt đã xong',
  'ngua-sat-da-xong.body': 'Lò rèn tắt lửa đêm qua. Ngựa sắt dựng ở sân đình {land}, roi sắt dựng bên cạnh, và giặc thì đã tới chỗ có thể nhìn thấy khói. Bây giờ chỉ còn một câu hỏi, và câu trả lời không nằm ở triều đình nữa: nó đã đủ lớn hay chưa.',
  'ngua-sat-da-xong.ok': 'Ra xem',
  'ngua-sat-da-xong.chronicle': 'Ngựa sắt xong, và giặc đã tới.',

  // ── ra-tran ───────────────────────────────────────────────────────────────
  'nguoi-lang-dung-ben-duong.line': 'Người làng đứng hai bên đường, không ai nói gì.',
  'nguoi-lang-dung-ben-duong.scene': 'Họ ra đứng từ sáng sớm. Có người mang theo cơm nắm, không phải để ăn. Khi ngựa sắt đi qua thì không ai reo — họ chỉ nhìn, và mấy bà cụ chắp tay. Bà mẹ nó không ra. Bà ngồi trong nhà, và cửa để mở.',
  'nguoi-lang-dung-ben-duong.chronicle': 'Cả làng ra tiễn.',

  'he-rides.title': 'Ngài ra trận',
  'he-rides.body': 'Ngài nhắm thẳng chỗ dày nhất mà đâm vào. Roi sắt gãy ngang vai một viên tướng Ân và văng mất một nửa xuống ruộng; ngài không dừng lại tìm. Ven đường có bụi tre đằng ngà, và ngài nhổ cả bụi lên — rễ, đất, tất cả — rồi quay lại đánh tiếp bằng cái đó.',
  'he-rides.ok': 'Chép lại việc này',
  'he-rides.toast': '{count} quân theo ngài ra khỏi {land}.',
  'he-rides.chronicle': 'Ngài ra trận. Roi sắt gãy, ngài nhổ tre mà đánh.',

  'soc-son-khong-xuong-nua.title': 'Sóc Sơn',
  'soc-son-khong-xuong-nua.body': 'Xong việc vào buổi chiều. Ngài không xuống bằng con đường đã đi lên: ngài phóng lên đỉnh Sóc Sơn, cởi áo giáp đặt lại trên phiến đá, rồi từ đó bay lên. Vết chân ngựa dọc đường ruộng đọng nước, các làng đã gọi đó là ao. Bụi tre khúc ấy mọc lại vàng, và vàng cho tới bây giờ.',
  'soc-son-khong-xuong-nua.ok': 'Dựng đền dưới chân núi',
  'soc-son-khong-xuong-nua.chronicle': 'Ngài lên núi và không xuống nữa.',

  'nga-ngua-con-ngua-ve-mot-minh.title': 'Con ngựa về một mình',
  'nga-ngua-con-ngua-ve-mot-minh.body': 'Ngựa sắt về tới đầu làng lúc gần tối, không có ai trên lưng. Nó đứng ở sân đình đúng chỗ nó đã dựng, và người ta để nguyên đó. Không ai đi tìm. Chỗ ngài ngã, ruộng vẫn cấy được, và mấy năm sau người ta vẫn cấy.',
  'nga-ngua-con-ngua-ve-mot-minh.ok': 'Chép lại',
  'nga-ngua-con-ngua-ve-mot-minh.chronicle': 'Ngài không về. Con ngựa về một mình.',

  'the-village-forgets-him.line': 'Đứa bé ở {land} thôi nói. Người ta cũng thôi nhắc.',
  'the-village-forgets-him.scene': 'Áo giáp treo trong kho thóc, đã hoen. Ngựa sắt người ta kéo ra góc sân rồi trồng bí lên. Bà mẹ vẫn ở đấy, vẫn không ai hỏi bà cả. Cái làng ấy về sau không thích khách lạ, và không nói vì sao.',
  'the-village-forgets-him.chronicle': 'Chẳng có con ngựa sắt nào được dùng tới.',

  // ── cho-gao ───────────────────────────────────────────────────────────────
  'no-lon-nhanh-qua.line': 'Không có sắt, nó vẫn lớn. Lớn nhanh hơn là người ta muốn.',
  'no-lon-nhanh-qua.scene': 'Đến mùa thứ hai thì nó phải ngủ ngoài sân vì không nhà nào chứa được. Người ta dựng cho nó cái mái lá, rồi phải dựng lại cái to hơn. Nó không đòi gì cả. Nó ăn, rồi ngồi nhìn về phía bắc, và không ai dạy nó nhìn về phía ấy.',
  'no-lon-nhanh-qua.chronicle': 'Nó lớn, mà không có gì trong tay.',

  'lang-bat-dau-so.line': 'Trẻ con trong làng thôi ra sân chơi.',
  'lang-bat-dau-so.scene': 'Không phải vì ai cấm. Mẹ chúng gọi vào sớm hơn mọi khi, thế thôi. Ông trưởng làng vẫn sang ngồi với nó mỗi chiều, và ông là người duy nhất còn sang. Ông bảo nó vẫn ngoan. Ông cũng bảo, khẽ hơn, rằng làng không nuôi được mãi.',
  'lang-bat-dau-so.chronicle': 'Làng bắt đầu sợ nó.',

  'lam-gi-voi-mot-nguoi-khong-lo.title': 'Làm gì với một người khổng lồ',
  'lam-gi-voi-mot-nguoi-khong-lo.body': 'Nó cao hơn nóc đình và không có gì trong tay. Giặc thì đang tới. Ông trưởng làng {land} về kinh, đứng ngoài sảnh cả buổi, rồi nói đúng ba câu: làng không nuôi nổi nữa, nó không chịu ở yên nữa, và triều đình nên quyết một điều gì đó trước khi nó tự quyết.',
  'lam-gi-voi-mot-nguoi-khong-lo.advice': 'Thứ gì mình không trang bị được thì cũng không sai khiến được, thưa bệ hạ.',
  'lam-gi-voi-mot-nguoi-khong-lo.cho-di-tay-khong': 'Cho nó đi tay không',
  'lam-gi-voi-mot-nguoi-khong-lo.cho-di-tay-khong.d': 'Ven đường thiếu gì thứ cầm được.',
  'lam-gi-voi-mot-nguoi-khong-lo.giu-o-lang': 'Giữ nó ở làng',
  'lam-gi-voi-mot-nguoi-khong-lo.giu-o-lang.d': 'Nó không phải việc của chiến trận.',
  'lam-gi-voi-mot-nguoi-khong-lo.nau-chuong-chua': 'Nấu chuông chùa',
  'lam-gi-voi-mot-nguoi-khong-lo.nau-chuong-chua.d': 'Đồng thì không phải sắt, nhưng đồng thì có sẵn.',
  'lam-gi-voi-mot-nguoi-khong-lo.chronicle': 'Ngươi đã quyết việc của người khổng lồ ở {land}.',

  'roi-sat-khong-co-thi-lay-gi.line': 'Nó ra vườn tre, ngắm nghía một lúc lâu.',
  'roi-sat-khong-co-thi-lay-gi.scene': 'Nó thử mấy bụi, bụi nào cũng bẻ gãy trong tay. Cuối cùng nó chọn bụi già nhất ở bờ ao, thứ tre đằng ngà mà người làng vẫn để dành đan thúng, và nhổ thử cả gốc lên xem có được không. Được. Nó đặt xuống, cẩn thận, rồi về ăn cơm.',
  'roi-sat-khong-co-thi-lay-gi.chronicle': 'Nó chọn một bụi tre.',

  'ra-di-tay-khong.title': 'Ra đi tay không',
  'ra-di-tay-khong.body': 'Nó đứng ở đầu làng từ sáng, quay về phía bắc, và không đi. Nó đợi một lời. Ông trưởng làng nói rằng nó sẽ đi dù có lời hay không, chỉ là đi với lời thì nó còn quay lại, mà đi không có lời thì chưa chắc.',
  'ra-di-tay-khong.advice': 'Ta không mất gì cả, thưa bệ hạ. Ta có cho nó cái gì đâu.',
  'ra-di-tay-khong.de-no-di': 'Để nó đi',
  'ra-di-tay-khong.de-no-di.d': 'Và cho người theo sau.',
  'ra-di-tay-khong.giu-lai-da': 'Giữ lại đã',
  'ra-di-tay-khong.giu-lai-da.d': 'Chưa phải lúc, và chưa có gì trong tay.',
  'ra-di-tay-khong.chronicle': 'Ngươi đã trả lời việc nó đòi ra trận.',

  'nhung-cay-tre-dang-nga.title': 'Những cây tre đằng ngà',
  'nhung-cay-tre-dang-nga.body': 'Nó đánh bằng cả bụi tre, cầm ở gốc, và đánh như người ta phát bờ. Không có áo giáp nên nó bị thương ngay từ đầu và không để ý. Đến chiều thì đường cái không còn ai đứng nữa. Bụi tre ấy về sau mọc lại vàng, và không ai biết vì sao — vì lần này không có lửa.',
  'nhung-cay-tre-dang-nga.ok': 'Chép lại tên cái bụi tre ấy',
  'nhung-cay-tre-dang-nga.chronicle': 'Nó thắng bằng tre, không bằng sắt.',

  'nga-xuong-ruong.title': 'Ngã xuống ruộng',
  'nga-xuong-ruong.body': 'Không có giáp thì không đi được xa. Nó ngã ở khúc ruộng trũng dưới chân đê, và nước khép lại trên chỗ ấy trong một mùa. Người làng không đắp mộ. Họ để nguyên khúc ruộng đó không cấy, và cũng không nói vì sao không cấy.',
  'nga-xuong-ruong.ok': 'Để yên khúc ruộng ấy',
  'nga-xuong-ruong.chronicle': 'Nó ngã ở ruộng, tay không.',

  'no-an-het-ca-huyen.line': 'Giữ nó ở làng thì cả huyện phải nuôi.',
  'no-an-het-ca-huyen.scene': 'Ba xã chia nhau mỗi xã mười ngày. Đến lượt xã nào thì xã ấy nấu từ gà gáy, và không xã nào từ chối, và cả ba xã đều đã tính xem cái này kéo dài được bao lâu. Nó biết. Nó ăn ít đi, rồi lại lớn thêm, rồi lại ăn như cũ.',
  'no-an-het-ca-huyen.chronicle': 'Cả huyện thay nhau nuôi nó.',

  'giu-hay-tha.title': 'Giữ hay thả',
  'giu-hay-tha.body': 'Ba xã đã nuôi nó gần hai năm. Không ai kêu ca, và cũng không ai còn cho con sang bên ấy chơi. Ông trưởng làng {land} hỏi triều đình một câu ngắn: nuôi tiếp thì nuôi tới bao giờ, mà thả thì thả đi đâu.',
  'giu-hay-tha.advice': 'Nuôi một cái miệng như thế thì bằng nuôi một cơ binh, thưa bệ hạ.',
  'giu-hay-tha.nuoi-tiep': 'Nuôi tiếp',
  'giu-hay-tha.nuoi-tiep.d': 'Kho còn thì còn nuôi.',
  'giu-hay-tha.de-no-di': 'Để nó đi',
  'giu-hay-tha.de-no-di.d': 'Nó muốn đi từ lâu rồi.',
  'giu-hay-tha.chronicle': 'Ngươi đã quyết việc nuôi nó.',

  'nguoi-khong-lo-o-lai.title': 'Người khổng lồ ở lại',
  'nguoi-khong-lo-o-lai.body': 'Nó ở lại. Nó đắp đê, kéo gỗ, dựng lại cái cầu đá mà ba đời không ai dựng nổi, và ăn bằng một xã. Người ta kéo tới xem, rồi kéo tới ở, và {land} đông lên trông thấy. Triều đình thì không bao giờ biết phải xếp nó vào sổ nào.',
  'nguoi-khong-lo-o-lai.ok': 'Cứ để như thế',
  'nguoi-khong-lo-o-lai.chronicle': 'Nó ở lại {land}, và {land} đông lên.',

  'mot-dem-no-di.line': 'Một đêm nó đi, không ai thấy nó đi lối nào.',
  'mot-dem-no-di.scene': 'Cái mái lá vẫn còn, cơm nguội vẫn đậy trong thúng. Nó không lấy gì cả. Người ta đồn nó lên núi, có người đồn nó xuống bể, và ông trưởng làng thì không đồn gì — ông chỉ để cái mái lá đó thêm ba năm nữa mới dỡ.',
  'mot-dem-no-di.chronicle': 'Nó đi, và không nhắn lại gì.',

  'nha-su-khong-dong-y.line': 'Nhà chùa nghe tin thì đóng cổng.',
  'nha-su-khong-dong-y.scene': 'Sư cụ không ra tiếp. Chú tiểu ra thưa lại một câu, rất lễ phép, rằng cái chuông ấy đúc năm nào thì trong làng còn người nhớ, và người nhớ thì còn sống. Rồi chú tiểu đóng cổng. Bên trong, không ai đánh chuông buổi chiều hôm ấy.',
  'nha-su-khong-dong-y.chronicle': 'Nhà chùa không bằng lòng.',

  'chuong-hay-giap.title': 'Chuông hay giáp',
  'chuong-hay-giap.body': 'Đồng đủ cho một bộ giáp, và đồng ấy đang treo trên gác chuông chùa làng {land}. Quan Công bộ nói rằng nấu ba hôm là xong. Sư cụ thì nói rằng cái chuông ấy có tên người cúng khắc ở vành, và những người ấy có con cháu đang ở ngay trong làng này.',
  'chuong-hay-giap.advice': 'Đồng là đồng, thưa bệ hạ. Chỗ khác cũng đúc được chuông.',
  'chuong-hay-giap.cu-nau': 'Cứ nấu',
  'chuong-hay-giap.cu-nau.d': 'Giặc không đợi hết tuần chay.',
  'chuong-hay-giap.nghe-nha-su': 'Nghe nhà chùa',
  'chuong-hay-giap.nghe-nha-su.d': 'Còn cách khác, và còn thì giờ để tìm.',
  'chuong-hay-giap.chronicle': 'Ngươi đã quyết việc cái chuông ở {land}.',

  'giap-dong-nang-hon.title': 'Giáp đồng nặng hơn',
  'giap-dong-nang-hon.body': 'Giáp đồng nặng hơn giáp sắt và nó mặc vừa. Nó ra trận và nó thắng. Nhưng ở {land} người ta không dựng đền cho nó, và mấy chục năm sau, hỏi tới chuyện này, người làng chỉ nói rằng dạo ấy có một đứa bé lớn nhanh lắm — rồi thôi, không kể thêm.',
  'giap-dong-nang-hon.ok': 'Vậy là xong',
  'giap-dong-nang-hon.chronicle': 'Nó mặc giáp đồng ra trận. Không ai dựng đền.',

  'chuong-van-treo.line': 'Cái chuông vẫn treo. Đứa bé thì không đi đâu cả.',
  'chuong-van-treo.scene': 'Sư cụ có sang thăm nó một lần, mang theo oản. Hai người ngồi với nhau đến chiều, không nói gì mấy. Về sau chuông vẫn đánh đúng giờ, và người làng vẫn ra nghe, và trong số ra nghe có nó — ngồi ngoài sân, vì trong chùa không đủ chỗ.',
  'chuong-van-treo.chronicle': 'Chuông vẫn treo, và nó không ra trận.',

  // ── dua-ve-trieu ──────────────────────────────────────────────────────────
  'no-thoi-an.line': 'Về tới kinh thành thì nó thôi ăn.',
  'no-thoi-an.scene': 'Người ta dọn cho nó đủ thứ, và nó ăn như một đứa bé lên ba, tức là rất ít. Nó không ốm. Thầy thuốc bắt mạch bảo không có bệnh gì. Nó chỉ ngồi ở góc sân sau, quay mặt về hướng làng nó, và ai hỏi gì thì nó cũng thưa rất lễ phép.',
  'no-thoi-an.chronicle': 'Về triều, nó thôi lớn.',

  'trieu-dinh-cai-nhau-ve-no.line': 'Triều đình cãi nhau về việc xếp nó vào đâu.',
  'trieu-dinh-cai-nhau-ve-no.scene': 'Quan Lễ bộ bảo nó là điềm, nên phải có chỗ trong nghi lễ. Quan Hình bộ bảo nó là dân, nên phải có tên trong sổ đinh. Quan Thái úy không nói gì cả cho tới cuối buổi, rồi hỏi một câu: nếu nó là điềm thì điềm ấy báo cái gì, mà nếu nó là dân thì ai đang nuôi nó.',
  'trieu-dinh-cai-nhau-ve-no.chronicle': 'Triều đình không biết xếp nó vào đâu.',

  'lam-gi-voi-dua-be-o-trieu.title': 'Đứa bé ở trong cung',
  'lam-gi-voi-dua-be-o-trieu.body': 'Nó đã ở trong cung ba mùa và không lớn thêm một tấc nào. Nó ngoan, nó lễ phép, và nó không phải là cái mà sứ giả đã tìm thấy ở {land}. Bây giờ phải quyết: cho nó một cái tước, hay gọi thầy thuốc xem cho ra nhẽ, hay trả nó về chỗ nó đã ngồi.',
  'lam-gi-voi-dua-be-o-trieu.advice': 'Thứ gì đem vào trong cung rồi thì hiếm khi ra được như cũ, thưa bệ hạ.',
  'lam-gi-voi-dua-be-o-trieu.phong-cho-no': 'Phong cho nó một tước',
  'lam-gi-voi-dua-be-o-trieu.phong-cho-no.d': 'Đã ở đây thì phải có chỗ trong sổ.',
  'lam-gi-voi-dua-be-o-trieu.goi-thay-thuoc': 'Gọi thầy thuốc',
  'lam-gi-voi-dua-be-o-trieu.goi-thay-thuoc.d': 'Xem cho ra nhẽ, một lần cho xong.',
  'lam-gi-voi-dua-be-o-trieu.tra-ve-lang': 'Trả nó về làng',
  'lam-gi-voi-dua-be-o-trieu.tra-ve-lang.d': 'Lò rèn ở {land} vẫn còn đó.',
  'lam-gi-voi-dua-be-o-trieu.chronicle': 'Ngươi đã quyết việc đứa bé ở trong cung.',

  'mot-tuoc-cho-dua-tre.title': 'Một tước cho đứa trẻ',
  'mot-tuoc-cho-dua-tre.body': 'Nó có tước, có bổng, có hai người hầu và một chỗ ngồi trong sảnh mà nó không bao giờ ngồi. Quan Lễ bộ muốn đưa nó ra đứng ở lễ tế để dân trông thấy. Quan Thái úy muốn để yên. Cả hai đều biết rằng cái gì đã đem ra cho dân trông thấy thì không cất lại được.',
  'mot-tuoc-cho-dua-tre.advice': 'Một điềm lành mà không ai trông thấy thì cũng như không có, thưa bệ hạ.',
  'mot-tuoc-cho-dua-tre.dung-no-that': 'Đưa nó ra cho dân trông thấy',
  'mot-tuoc-cho-dua-tre.dung-no-that.d': 'Điềm thì phải có người tin mới thành điềm.',
  'mot-tuoc-cho-dua-tre.de-no-yen': 'Để nó yên',
  'mot-tuoc-cho-dua-tre.de-no-yen.d': 'Nó vẫn chỉ là đứa bé lên ba.',
  'mot-tuoc-cho-dua-tre.chronicle': 'Ngươi đã quyết việc cái tước của nó.',

  'hau-tre-lon-len.line': 'Nó lớn lên trong cung, và người ta quen dần với nó.',
  'hau-tre-lon-len.scene': 'Nó không bao giờ cao thêm được nữa, nhưng dân thì tin, và cái đó hóa ra là thứ dùng được. Đến đâu nó cũng có người theo, và đi tới đâu thì đinh ở đấy ghi tên vào sổ quân đông hơn hẳn. Nó vẫn lễ phép. Nó vẫn không bao giờ nhắc tới con ngựa sắt.',
  'hau-tre-lon-len.chronicle': 'Nó thành một tước hầu, và dân tin nó.',

  'chet-o-trieu.title': 'Nó mất ở trong cung',
  'chet-o-trieu.body': 'Nó mất vào mùa đông, không vì bệnh gì thầy thuốc gọi được tên. Người ta chôn nó theo lễ dành cho tước hầu, và bà mẹ nó ở {land} không kịp về. Sau đó triều đình không nhắc tới chuyện này nữa, và cái sổ có tên nó thì cất vào trong.',
  'chet-o-trieu.ok': 'Chép theo lễ',
  'chet-o-trieu.chronicle': 'Nó mất ở trong cung, mùa đông.',

  'khong-co-gi-ca.line': 'Thầy thuốc khám ba ngày rồi thưa: không có gì cả.',
  'khong-co-gi-ca.scene': 'Không bệnh, không tật, không điềm. Một đứa bé lên ba chậm nói, thế thôi, và cái chuyện ở sân đình thì bốn người kể là bốn kiểu. Triều đình trả nó về với mẹ và cho một ít gạo. Từ đó, hễ có ai lên kinh báo điềm lạ thì người ta cho ăn cơm rồi tiễn về.',
  'khong-co-gi-ca.chronicle': 'Không có gì cả. Nó chỉ là một đứa bé.',

  // ── khong-goi ─────────────────────────────────────────────────────────────
  'khong-ai-toi.line': 'Không sai sứ giả, thì cũng không có ai tới.',
  'khong-ai-toi.scene': 'Không có gì xảy ra cả, và đó chính là điều đáng ghi. Các làng vẫn cấy, vẫn nộp thuế, vẫn không biết là đáng lẽ có người tới hỏi họ một câu. Quan Thái úy cho kiểm lại sổ quân và bảo rằng con số này đánh được — rồi ông ta cho kiểm lại lần nữa.',
  'khong-ai-toi.chronicle': 'Không ai được gọi.',

  'so-quan-la-so-quan.line': 'Sổ quân là sổ quân. Ta có bấy nhiêu.',
  'so-quan-la-so-quan.scene': 'Ba cơ ở kinh, hai cơ ở biên, và số đinh các huyện gọi thêm được nếu gọi ngay. Quan Thái úy đọc to lên trong sảnh, không thêm bớt gì, rồi gấp sổ lại. Ông ta không xin thêm, vì xin thì cũng không có. Đây là cách đánh giặc mà không cần phép lạ.',
  'so-quan-la-so-quan.chronicle': 'Ta đánh bằng số quân ta có.',

  'danh-the-nao.title': 'Đánh thế nào',
  'danh-the-nao.body': 'Không có phép lạ nào cả, nên bây giờ chỉ còn là việc của tướng. Giặc sẽ tới bằng hai đường, và ta không đủ quân giữ cả hai. Quan Thái úy bày ra hai cách và nói thẳng rằng ông ta không chắc cách nào hơn — điều mà ông ta chưa nói bao giờ.',
  'danh-the-nao.advice': 'Giữ ải thì mất ruộng. Dàn trận thì mất cả hai nếu thua.',
  'danh-the-nao.giu-ai': 'Giữ ải',
  'danh-the-nao.giu-ai.d': 'Đường hẹp thì ít quân cũng chặn được.',
  'danh-the-nao.dan-tran': 'Dàn trận ngoài đồng',
  'danh-the-nao.dan-tran.d': 'Đánh một trận cho xong, ở chỗ ta chọn.',
  'danh-the-nao.chronicle': 'Ngươi đã chọn cách đánh.',

  'ai-hep-va-sau.line': 'Ải hẹp, sâu, và hai bên là đá.',
  'ai-hep-va-sau.scene': 'Quân đóng ở chỗ khe thắt lại, nơi hai người đi ngang là chật. Lính chặt cây bó thành giàn, đổ đất lên, và làm việc ấy suốt đêm không cần ai giục. Người coi ải bảo rằng giữ được, nếu giặc chịu đi vào — và giặc thì phải đi vào, vì đường kia xa hơn mười ngày.',
  'ai-hep-va-sau.chronicle': 'Quân ta đóng ở ải.',

  'dot-kho-hay-cat-duong.title': 'Đốt kho hay cắt đường',
  'dot-kho-hay-cat-duong.body': 'Giặc còn ba ngày nữa tới ải. Có hai việc làm được trong ba ngày ấy và chỉ làm được một: đốt sạch thóc ở các làng phía trước để chúng tới nơi thì không còn gì ăn, hoặc để chúng qua rồi cắt đường về. Việc thứ nhất là đốt thóc của dân ta.',
  'dot-kho-hay-cat-duong.advice': 'Dân đói một mùa thì còn sống. Giặc no thì ta không còn mùa nào.',
  'dot-kho-hay-cat-duong.dot-kho-truoc-mat-chung': 'Đốt sạch phía trước',
  'dot-kho-hay-cat-duong.dot-kho-truoc-mat-chung.d': 'Chúng tới nơi thì không còn gì.',
  'dot-kho-hay-cat-duong.cat-duong-sau-lung': 'Cắt đường sau lưng',
  'dot-kho-hay-cat-duong.cat-duong-sau-lung.d': 'Để chúng qua, rồi khóa lại.',
  'dot-kho-hay-cat-duong.chronicle': 'Ngươi đã quyết việc ở ải.',

  'tu-lo-lay-duoc.title': 'Ta tự lo lấy được',
  'tu-lo-lay-duoc.body': 'Chúng vào ải ngày thứ tư và không ra. Không có ngựa sắt, không có đứa bé nào cả — chỉ có quân ta, ở chỗ ta chọn, đông vừa đủ. Về sau người ta kể chuyện này ít hơn hẳn chuyện kia, nhưng các làng thì nhớ, và cái họ nhớ là lần ấy không ai phải đợi phép lạ.',
  'tu-lo-lay-duoc.ok': 'Chép vào sử',
  'tu-lo-lay-duoc.chronicle': 'Ta đánh lui giặc, không cần phép lạ.',

  'mat-phu-dong-that-thu.title': '{land} thất thủ',
  'mat-phu-dong-that-thu.body': 'Chúng qua ải rồi mới bị cắt đường, và cái giá của việc để chúng qua là {land}. Khi quân ta khép lại phía sau thì trong ấy đã cháy hai hôm. Chúng thua, và ta cũng không gọi đó là thắng.',
  'mat-phu-dong-that-thu.ok': 'Chép cả hai việc',
  'mat-phu-dong-that-thu.chronicle': '{land} cháy. Giặc thua ở phía sau nó.',

  'dan-tran-ngoai-dong.line': 'Quân ta dàn ngoài đồng, chỗ đất cao bên tả.',
  'dan-tran-ngoai-dong.scene': 'Ruộng vừa gặt xong nên đi lại được, và đó là lý do chọn chỗ này chứ không vì gì khác. Lính đứng từ sáng, ăn ngay tại chỗ, không ai được rời hàng. Bên kia đồng, bụi bốc lên từ trưa và cứ dày thêm mãi, và ta thì đứng nhìn nó dày lên.',
  'dan-tran-ngoai-dong.chronicle': 'Quân ta dàn trận ngoài đồng.',

  'ai-cam-quan.title': 'Ai cầm quân',
  'ai-cam-quan.body': 'Trận này đánh một lần là xong, nên ai cầm quân là câu hỏi cuối cùng. Quan Thái úy đã già và đã đánh trận này ba lần trong đầu. Nhưng lính thì đứng ngoài đồng từ sáng, và có một điều mà chỉ một người trong cả nước làm được cho họ, và người ấy đang ngồi trong sảnh.',
  'ai-cam-quan.advice': 'Bệ hạ ra đó thì thắng to hơn. Thua thì cũng không còn ai để chép lại.',
  'ai-cam-quan.tuong-gia-cam': 'Để lão tướng cầm',
  'ai-cam-quan.tuong-gia-cam.d': 'Ông ta biết việc, và ông ta biết chỗ này.',
  'ai-cam-quan.vua-di': 'Ta thân chinh',
  'ai-cam-quan.vua-di.d': 'Lính đứng ngoài đồng từ sáng.',
  'ai-cam-quan.chronicle': 'Ngươi đã chọn người cầm quân.',

  'tuong-gia-giu-duoc-dat.title': 'Lão tướng giữ được đất',
  'tuong-gia-giu-duoc-dat.body': 'Ông ta giữ được hàng đến lúc bên kia gãy trước, và ông ta không về. Người ta tìm thấy ông ở chỗ hàng đầu, đúng chỗ ông đứng từ sáng. Đất giữ được. Trong sảnh, cái ghế của ông để trống suốt mùa ấy vì chưa ai muốn ngồi vào.',
  'tuong-gia-giu-duoc-dat.ok': 'Chép tên ông ta',
  'tuong-gia-giu-duoc-dat.chronicle': 'Lão tướng giữ được đất và không về.',

  'vua-than-chinh-ra-tran.title': 'Ta thân chinh',
  'vua-than-chinh-ra-tran.body': 'Lính trông thấy cờ vua ở hàng thứ hai thì hàng thứ nhất đứng thẳng lên, và cái đó không có trong sách nào cả. Trận ấy đánh từ trưa tới lúc tắt nắng. Về sau, hỏi các làng về năm ấy, họ không kể trận đánh — họ kể chuyện nhà vua đứng ở đâu.',
  'vua-than-chinh-ra-tran.ok': 'Chép vào sử',
  'vua-than-chinh-ra-tran.chronicle': 'Vua thân chinh. Các làng nhớ chỗ ngài đứng.',
  // The spine's own labels: what the story page calls each step it has passed through.
  'node.tin-giac': 'Tin giặc tới',
  'node.su-gia': 'Sứ giả đi rao',
  'node.ren-sat': 'Lò rèn, và việc góp',
  'node.ra-tran': 'Ra trận',
  'node.soc-son': 'Sóc Sơn',
  'node.nga-ngua': 'Con ngựa về một mình',
  'node.khong-du-an': 'Áo giáp hoen trong kho',
  'node.cho-gao': 'Cho gạo, không cho sắt',
  'node.tay-khong': 'Ra đi tay không',
  'node.nhung-cay-tre': 'Những cây tre đằng ngà',
  'node.nga-o-ruong': 'Ngã xuống ruộng',
  'node.giu-lang': 'Giữ nó ở làng',
  'node.nguoi-khong-lo': 'Người khổng lồ ở lại',
  'node.bo-di': 'Một đêm nó đi',
  'node.chuong-chua': 'Chuông chùa',
  'node.giap-dong': 'Giáp đồng',
  'node.su-phan-doi': 'Nhà chùa giữ chuông',
  'node.dua-ve-trieu': 'Đứa bé ở trong cung',
  'node.phong-vuong': 'Một tước cho đứa trẻ',
  'node.hau-tre': 'Hầu trẻ lớn lên',
  'node.chet-yeu': 'Mất ở trong cung',
  'node.thay-thuoc': 'Thầy thuốc bảo không có gì',
  'node.khong-goi': 'Không gọi ai cả',
  'node.giu-ai': 'Giữ ải',
  'node.tu-lo-lay': 'Ta tự lo lấy được',
  'node.mat-phu-dong': '{land} thất thủ',
  'node.dan-tran': 'Dàn trận ngoài đồng',
  'node.tuong-gia': 'Lão tướng cầm quân',
  'node.vua-than-chinh': 'Vua thân chinh',
};


export const thanhGiongEn: StoryCatalog = {
  title: 'Thánh Gióng',
  want: 'an iron horse, an iron rod and iron armour',
  waiting: 'Phù Đổng is waiting, and the Ân are not.',
  stake: 'The men and the grain sent to the child are men and grain not in the levy.',

  'regard.unanswered': 'Nobody came. That was written down too.',
  'regard.fed': 'The forge is lit. The child still cannot stand up straight.',
  'regard.rising': 'He is taller than the doorway he was sitting in.',
  'regard.gone': 'He has gone. The hoofprints have filled with water.',

  'giac-an-qua-vu-ninh.line': 'The Ân have crossed at Vũ Ninh. Three reports, and no two agree.',
  'giac-an-qua-vu-ninh.scene': 'Three post-riders reached the south gate in one afternoon, each with a different number. The Minister of War had all three written into the book and then struck out the smallest — not because he believed the other two, but because he did not dare believe that one.',
  'giac-an-qua-vu-ninh.chronicle': 'The Ân crossed at Vũ Ninh.',

  'ba-ban-tin-khong-khop.line': 'People have started moving their goods out of the capital by river.',
  'ba-ban-tin-khong-khop.scene': 'The landing is busier than it should be and nobody will say why. A ferrywoman mentioned that three silk merchants had paid a month ahead, which they have never done in any year she can remember. She did not add anything to that. She went back to waiting for fares.',
  'ba-ban-tin-khong-khop.chronicle': 'The capital began packing.',

  'loi-keu-goi.title': 'The Call',
  'loi-keu-goi.body': 'The Minister of Rites proposes what the court did in your grandfather’s time: send a herald down every road and into every village, and let him call for anyone who can save the country. It costs the treasury and it costs a season. The Marshal points out, not unkindly, that your grandfather’s court did the same and got nothing — and that a season is exactly how long the Ân need to arrive.',
  'loi-keu-goi.advice': 'A herald costs a season, my lord. The enemy is not waiting a season.',
  'loi-keu-goi.sai-su-gia': 'Send the herald',
  'loi-keu-goi.sai-su-gia.d': 'Down every road, and into villages nobody has counted.',
  'loi-keu-goi.ta-co-quan-roi': 'We have an army',
  'loi-keu-goi.ta-co-quan-roi.d': 'It is what we have. It will have to do.',
  'loi-keu-goi.chronicle': 'You decided how the country would be called.',

  'a-child-who-has-never-spoken.line': 'At {land} there is a three-year-old who has never spoken. Yesterday he spoke.',
  'a-child-who-has-never-spoken.scene': 'The herald was calling in the yard at {land} when the widow’s child sat up and told his mother to invite the man inside. She was more frightened than pleased. He is three, he has never said one word in his life, and the first thing he said was not her name.',
  'a-child-who-has-never-spoken.chronicle': 'The child at {land} spoke.',

  'su-gia-di-qua-nhung-lang-khong-tra-loi.line': 'The herald has passed eleven villages. Eleven villages said nothing.',
  'su-gia-di-qua-nhung-lang-khong-tra-loi.scene': 'They came out to listen and then they went home. One village fed him and walked him to the end of the lane, courteous and final. He wrote down the name of each place and nothing else beside it. He knew someone would read that list eventually.',
  'su-gia-di-qua-nhung-lang-khong-tra-loi.chronicle': 'Eleven villages did not answer.',

  'he-asked-for-an-iron-horse.title': 'He Asked for an Iron Horse',
  'he-asked-for-an-iron-horse.body': 'He asked for an iron horse, an iron rod and iron armour. He asked for nothing else — no rank, no land, no promise. The herald wrote it down word for word and sent it back, and the smiths at {land} want to know whether to start. Iron is dear, and the child is three years old.',
  'he-asked-for-an-iron-horse.advice': 'That iron is two hundred spearheads, my lord.',
  'he-asked-for-an-iron-horse.make-it': 'Forge it for him',
  'he-asked-for-an-iron-horse.make-it.d': 'The whole province gives up its iron.',
  'he-asked-for-an-iron-horse.a-child-is-a-child': 'A child is a child',
  'he-asked-for-an-iron-horse.a-child-is-a-child.d': 'Give him rice, not iron.',
  'he-asked-for-an-iron-horse.dua-ve-trieu': 'Bring him to court',
  'he-asked-for-an-iron-horse.dua-ve-trieu.d': 'Whatever he is, he is safer here.',
  'he-asked-for-an-iron-horse.chronicle': 'You answered the child of {land}.',

  'he-eats-everything-the-village-has.line': 'He eats the household’s rice, and then the hamlet cooks more.',
  'he-eats-everything-the-village-has.scene': 'The widow ran out of rice the day before yesterday. The lower hamlet sent over one basket and the upper hamlet sent two. Nobody was asked and nobody has asked the court for anything. He finished and sat still, and they saw that his shoulder was against the crossbeam of the door.',
  'he-eats-everything-the-village-has.chronicle': 'He outgrew what the hamlet could cook.',

  'his-armour-splits.line': 'The armour finished last week no longer fits.',
  'his-armour-splits.scene': 'The smith measured him for the third time. This time he did not ask anyone, only let it out a hand’s width and carried on, and told the boy on the bellows not to stop. The old suit hangs in the corner of the forge. Nobody has suggested melting it down.',
  'his-armour-splits.chronicle': 'The armour had to be made again, larger.',

  'vien-thu-lai-coi-kho.line': 'The granary clerk would like one thing entered in the book.',
  'vien-thu-lai-coi-kho.scene': 'He is not objecting. He would simply like it recorded that the grain and the men sent to {land} over three seasons come to what it costs to raise an army, and that he has recorded it. Then he closed the book. He is the only person in this business who can see where it ends.',
  'vien-thu-lai-coi-kho.chronicle': 'The granary book noted it.',

  'bay-nong-com-ba-nong-ca.line': 'Phù Đổng has cooked everything it had and he is still hungry.',
  'bay-nong-com-ba-nong-ca.scene': 'The village pooled what it could — seven trays of rice and three of aubergine — and he ate it and stood up, taller than the doorway he had been sitting in. The headman sent to the next village, and that one sent to the one after. What comes with the baskets is the young men carrying them, and they stay.',
  'bay-nong-com-ba-nong-ca.gop': 'Let the district send more',
  'bay-nong-com-ba-nong-ca.gui-nguoi-va-gao': 'Let the district send more',
  'bay-nong-com-ba-nong-ca.gui-nguoi-va-gao.d': 'Two hundred of the district’s men, and the rice that goes with them.',
  'bay-nong-com-ba-nong-ca.chronicle': 'The district sent men and grain to {land}.',

  'ngua-sat-da-xong.title': 'The Iron Horse Is Finished',
  'ngua-sat-da-xong.body': 'The forge went cold last night. The iron horse stands in the yard at {land} with the rod beside it, and the Ân are close enough now that the smoke is visible from the dyke. There is only one question left and the court does not get to answer it: whether he is big enough yet.',
  'ngua-sat-da-xong.ok': 'Go and see',
  'ngua-sat-da-xong.chronicle': 'The horse was finished, and the Ân arrived.',

  'nguoi-lang-dung-ben-duong.line': 'The village stood along both sides of the road and said nothing.',
  'nguoi-lang-dung-ben-duong.scene': 'They came out at first light. Some brought rice balls, not to eat. When the iron horse went past nobody cheered — they only watched, and the old women put their hands together. His mother did not come out. She sat inside, and left the door open.',
  'nguoi-lang-dung-ben-duong.chronicle': 'The village came out to see him go.',

  'he-rides.title': 'He Rides',
  'he-rides.body': 'He goes straight for the thickest part. The iron rod breaks across the shoulder of an Ân captain and half of it goes into the paddy; he does not stop or look for it. There is a stand of bamboo along the roadside, the yellow kind, and he pulls it up in armfuls — roots, earth and all — and goes back in with that.',
  'he-rides.ok': 'Have this written down',
  'he-rides.toast': '{count} men went out of {land} behind him.',
  'he-rides.chronicle': 'He rode. The rod broke and he fought on with bamboo.',

  'soc-son-khong-xuong-nua.title': 'Sóc Sơn',
  'soc-son-khong-xuong-nua.body': 'It ends in the afternoon. He does not come back down the road he went up: he rides to the top of Sóc Sơn, takes the armour off and leaves it on the rock, and goes up from there. The hoofprints along the paddy road have filled with water and the villages are already calling them ponds. The bamboo on that stretch came back yellow and has stayed yellow.',
  'soc-son-khong-xuong-nua.ok': 'Build the shrine at the foot of it',
  'soc-son-khong-xuong-nua.chronicle': 'He went up the mountain and did not come down.',

  'nga-ngua-con-ngua-ve-mot-minh.title': 'The Horse Came Back Alone',
  'nga-ngua-con-ngua-ve-mot-minh.body': 'The iron horse reached the village near dusk with nobody on it. It stood in the yard exactly where it had been built, and they left it there. No one went to look for him. Where he fell the ground still takes a crop, and for years afterwards they went on taking one.',
  'nga-ngua-con-ngua-ve-mot-minh.ok': 'Write it down',
  'nga-ngua-con-ngua-ve-mot-minh.chronicle': 'He did not come back. The horse did.',

  'the-village-forgets-him.line': 'The child at {land} has stopped speaking. People have stopped mentioning it.',
  'the-village-forgets-him.scene': 'The armour hangs in the grain store, rusting. They dragged the iron horse into the corner of the yard and grew gourds up it. His mother is still there and nobody asks her anything. That village never did care much for strangers afterwards, and never said why.',
  'the-village-forgets-him.chronicle': 'No iron horse was ever used.',

  'no-lon-nhanh-qua.line': 'Without the iron he grew anyway. Faster than anyone wanted.',
  'no-lon-nhanh-qua.scene': 'By the second season he slept in the yard because no house would hold him. They built him a thatch roof and then had to build a larger one. He asks for nothing. He eats, and then sits looking north, and nobody taught him to look north.',
  'no-lon-nhanh-qua.chronicle': 'He grew, with nothing in his hands.',

  'lang-bat-dau-so.line': 'The village children have stopped playing in the yard.',
  'lang-bat-dau-so.scene': 'Not because anyone forbade it. Their mothers simply call them in earlier than they used to. The headman still goes and sits with him every evening and is the only one who does. He says the boy is no trouble. He also says, more quietly, that the village cannot feed him forever.',
  'lang-bat-dau-so.chronicle': 'The village began to be afraid of him.',

  'lam-gi-voi-mot-nguoi-khong-lo.title': 'What to Do With a Giant',
  'lam-gi-voi-mot-nguoi-khong-lo.body': 'He is taller than the communal hall and he has nothing in his hands, and the Ân are coming. The headman of {land} came up to the capital, stood outside the hall all morning, and said three sentences: the village cannot feed him, he will not stay put much longer, and the court should decide something before he decides it himself.',
  'lam-gi-voi-mot-nguoi-khong-lo.advice': 'What we cannot arm, my lord, we cannot command either.',
  'lam-gi-voi-mot-nguoi-khong-lo.cho-di-tay-khong': 'Send him out bare-handed',
  'lam-gi-voi-mot-nguoi-khong-lo.cho-di-tay-khong.d': 'There is plenty by the roadside a man can pick up.',
  'lam-gi-voi-mot-nguoi-khong-lo.giu-o-lang': 'Keep him in the village',
  'lam-gi-voi-mot-nguoi-khong-lo.giu-o-lang.d': 'He is not a matter for the war.',
  'lam-gi-voi-mot-nguoi-khong-lo.nau-chuong-chua': 'Melt the temple bell',
  'lam-gi-voi-mot-nguoi-khong-lo.nau-chuong-chua.d': 'Bronze is not iron, but bronze is here.',
  'lam-gi-voi-mot-nguoi-khong-lo.chronicle': 'You decided the matter of the giant at {land}.',

  'roi-sat-khong-co-thi-lay-gi.line': 'He went out to the bamboo and looked at it for a long time.',
  'roi-sat-khong-co-thi-lay-gi.scene': 'He tried several stands and broke each one in his hands. In the end he picked the oldest clump on the pond bank, the yellow kind the village keeps for weaving baskets, and pulled it up by the roots to see whether it would come. It came. He set it down carefully and went in to eat.',
  'roi-sat-khong-co-thi-lay-gi.chronicle': 'He chose a stand of bamboo.',

  'ra-di-tay-khong.title': 'Going Out With Nothing',
  'ra-di-tay-khong.body': 'He has been standing at the end of the lane since morning, facing north, not going. He is waiting for a word. The headman says he will go whether the word comes or not — only that with it he might come back, and without it, probably not.',
  'ra-di-tay-khong.advice': 'We lose nothing, my lord. We never gave him anything.',
  'ra-di-tay-khong.de-no-di': 'Let him go',
  'ra-di-tay-khong.de-no-di.d': 'And send men after him.',
  'ra-di-tay-khong.giu-lai-da': 'Hold him back',
  'ra-di-tay-khong.giu-lai-da.d': 'Not yet, and not with empty hands.',
  'ra-di-tay-khong.chronicle': 'You answered his asking to go.',

  'nhung-cay-tre-dang-nga.title': 'The Yellow Bamboo',
  'nhung-cay-tre-dang-nga.body': 'He fought with the whole clump, held at the root, swinging it the way a man clears a hedge. With no armour he was cut early and did not notice. By evening there was nobody left standing on the high road. That bamboo grew back yellow, and nobody knows why — because this time there was no fire.',
  'nhung-cay-tre-dang-nga.ok': 'Record the name of that stand of bamboo',
  'nhung-cay-tre-dang-nga.chronicle': 'He won with bamboo, not iron.',

  'nga-xuong-ruong.title': 'Down in the Paddy',
  'nga-xuong-ruong.body': 'Without armour a man does not get far. He went down in the low ground under the dyke and the water closed over the place within a season. The village raised no grave. They left that stretch of paddy unplanted, and never said why they left it.',
  'nga-xuong-ruong.ok': 'Leave that ground alone',
  'nga-xuong-ruong.chronicle': 'He fell in the paddy, bare-handed.',

  'no-an-het-ca-huyen.line': 'Keeping him in the village means the whole district feeds him.',
  'no-an-het-ca-huyen.scene': 'Three communes take ten days each. Whichever commune has him cooks from cockcrow, and none of them has refused, and all three have worked out how long this can last. He knows. He eats less for a while, then grows again, then eats as before.',
  'no-an-het-ca-huyen.chronicle': 'Three communes took turns feeding him.',

  'giu-hay-tha.title': 'Keep Him or Let Him Go',
  'giu-hay-tha.body': 'Three communes have fed him for nearly two years. Nobody has complained, and nobody sends their children over there any more either. The headman of {land} asks the court one short question: if we go on feeding him, until when — and if we let him go, where to.',
  'giu-hay-tha.advice': 'A mouth like that costs what a company costs, my lord.',
  'giu-hay-tha.nuoi-tiep': 'Go on feeding him',
  'giu-hay-tha.nuoi-tiep.d': 'While the granary holds, it holds.',
  'giu-hay-tha.de-no-di': 'Let him go',
  'giu-hay-tha.de-no-di.d': 'He has wanted to go for a long time.',
  'giu-hay-tha.chronicle': 'You decided how long he would be fed.',

  'nguoi-khong-lo-o-lai.title': 'The Giant Stays',
  'nguoi-khong-lo-o-lai.body': 'He stayed. He builds dykes, hauls timber, and put up the stone bridge three generations had failed to put up, and he eats what a commune eats. People came to look and then came to live, and {land} is visibly larger. The court never did work out which register he belonged in.',
  'nguoi-khong-lo-o-lai.ok': 'Leave it as it is',
  'nguoi-khong-lo-o-lai.chronicle': 'He stayed at {land}, and {land} grew.',

  'mot-dem-no-di.line': 'One night he went, and nobody saw which way.',
  'mot-dem-no-di.scene': 'The thatch roof is still standing and the cold rice is still covered in its basket. He took nothing. Some say he went up into the mountains and some say he went down to the sea, and the headman says neither — he simply left the roof up for another three years before taking it down.',
  'mot-dem-no-di.chronicle': 'He went, and left no word.',

  'nha-su-khong-dong-y.line': 'The temple heard, and shut its gate.',
  'nha-su-khong-dong-y.scene': 'The old monk did not come out. A novice came instead and said, very politely, that there are people still living in this village who remember the year that bell was cast. Then he shut the gate. Inside, nobody rang it that evening.',
  'nha-su-khong-dong-y.chronicle': 'The temple did not agree.',

  'chuong-hay-giap.title': 'The Bell or the Armour',
  'chuong-hay-giap.body': 'There is enough bronze for one suit of armour and it is hanging in the bell tower at {land}. The Minister of Works says three days to melt it. The old monk says the bell has the names of its donors cast into the rim, and that those people have grandchildren living in this village now.',
  'chuong-hay-giap.advice': 'Bronze is bronze, my lord. Bells can be cast elsewhere.',
  'chuong-hay-giap.cu-nau': 'Melt it',
  'chuong-hay-giap.cu-nau.d': 'The Ân are not waiting for the fast to end.',
  'chuong-hay-giap.nghe-nha-su': 'Listen to the temple',
  'chuong-hay-giap.nghe-nha-su.d': 'There are other ways, and time to find one.',
  'chuong-hay-giap.chronicle': 'You decided the matter of the bell at {land}.',

  'giap-dong-nang-hon.title': 'Bronze Is Heavier',
  'giap-dong-nang-hon.body': 'Bronze armour is heavier than iron and it fit him. He rode out and he won. But there is no shrine at {land}, and decades later, asked about all this, the villagers will only say that there was a boy once who grew very fast — and stop there, and not go on.',
  'giap-dong-nang-hon.ok': 'So it is done',
  'giap-dong-nang-hon.chronicle': 'He rode in bronze. Nobody built a shrine.',

  'chuong-van-treo.line': 'The bell still hangs. The boy did not go anywhere.',
  'chuong-van-treo.scene': 'The old monk went to see him once, and took sweet cakes. The two of them sat together until evening without saying much. The bell went on being rung at the proper hour and the village went on coming out to hear it, and he was among them — sitting in the yard, because there was no room for him inside.',
  'chuong-van-treo.chronicle': 'The bell stayed up, and he never rode.',

  'no-thoi-an.line': 'Once he reached the capital, he stopped eating.',
  'no-thoi-an.scene': 'They set everything before him and he ate like a three-year-old, which is to say very little. He is not ill. The physician took his pulse and found nothing wrong. He sits in the corner of the back courtyard facing the direction of his village, and answers anything he is asked very politely.',
  'no-thoi-an.chronicle': 'At court, he stopped growing.',

  'trieu-dinh-cai-nhau-ve-no.line': 'The court is arguing about which register he belongs in.',
  'trieu-dinh-cai-nhau-ve-no.scene': 'The Minister of Rites says he is an omen and must have a place in the ceremonies. The Minister of Justice says he is a commoner and must have a name in the tax rolls. The Marshal said nothing until the end, then asked one question: if he is an omen, an omen of what — and if he is a commoner, who is feeding him.',
  'trieu-dinh-cai-nhau-ve-no.chronicle': 'The court could not place him.',

  'lam-gi-voi-dua-be-o-trieu.title': 'The Child in the Palace',
  'lam-gi-voi-dua-be-o-trieu.body': 'He has been inside three seasons and has not grown a finger’s width. He is well-behaved, he is polite, and he is not the thing the herald found at {land}. It has to be settled: give him a title, call the physicians and have it out once and for all, or send him back to the yard he was sitting in.',
  'lam-gi-voi-dua-be-o-trieu.advice': 'What comes into the palace rarely goes out the way it came, my lord.',
  'lam-gi-voi-dua-be-o-trieu.phong-cho-no': 'Give him a title',
  'lam-gi-voi-dua-be-o-trieu.phong-cho-no.d': 'If he is here, he must be somewhere in the register.',
  'lam-gi-voi-dua-be-o-trieu.goi-thay-thuoc': 'Call the physicians',
  'lam-gi-voi-dua-be-o-trieu.goi-thay-thuoc.d': 'Have it out, once, and be done.',
  'lam-gi-voi-dua-be-o-trieu.tra-ve-lang': 'Send him back to the village',
  'lam-gi-voi-dua-be-o-trieu.tra-ve-lang.d': 'The forge at {land} is still standing.',
  'lam-gi-voi-dua-be-o-trieu.chronicle': 'You decided the matter of the child in the palace.',

  'mot-tuoc-cho-dua-tre.title': 'A Title for a Child',
  'mot-tuoc-cho-dua-tre.body': 'He has a title, a stipend, two servants and a seat in the hall that he never sits in. The Minister of Rites wants him stood up at the state sacrifice where the people can see him. The Marshal wants him left alone. Both of them know that what is shown to the people cannot afterwards be put away.',
  'mot-tuoc-cho-dua-tre.advice': 'An omen nobody sees is not an omen, my lord.',
  'mot-tuoc-cho-dua-tre.dung-no-that': 'Show him to the people',
  'mot-tuoc-cho-dua-tre.dung-no-that.d': 'An omen needs believers before it is one.',
  'mot-tuoc-cho-dua-tre.de-no-yen': 'Leave him alone',
  'mot-tuoc-cho-dua-tre.de-no-yen.d': 'He is still a three-year-old.',
  'mot-tuoc-cho-dua-tre.chronicle': 'You decided what his title was for.',

  'hau-tre-lon-len.line': 'He grew up in the palace, and people got used to him.',
  'hau-tre-lon-len.scene': 'He never got any taller, but the people believe, and that turns out to be a usable thing. Wherever he goes a crowd goes, and wherever he goes the district registers noticeably more men fit to serve. He is still polite. He still never mentions the iron horse.',
  'hau-tre-lon-len.chronicle': 'He became a marquis, and the people believed him.',

  'chet-o-trieu.title': 'He Died Inside',
  'chet-o-trieu.body': 'He died in winter, of nothing the physicians could name. They buried him with the rites of a marquis, and his mother at {land} did not reach the capital in time. The court did not raise the matter again afterwards, and the register with his name in it was put away inside.',
  'chet-o-trieu.ok': 'Record it with the proper rites',
  'chet-o-trieu.chronicle': 'He died in the palace, in winter.',

  'khong-co-gi-ca.line': 'The physicians examined him for three days and reported: nothing at all.',
  'khong-co-gi-ca.scene': 'No illness, no defect, no omen. A three-year-old slow to speak, and four witnesses to the business in the yard who tell it four different ways. The court sent him home to his mother with some rice. After that, anyone who came up to the capital reporting a marvel was fed and sent home.',
  'khong-co-gi-ca.chronicle': 'Nothing at all. He was only a child.',

  'khong-ai-toi.line': 'No herald was sent, so nobody came.',
  'khong-ai-toi.scene': 'Nothing happened, and that is the part worth recording. The villages went on planting and paying and not knowing that someone might have come and asked them a question. The Marshal had the muster rolls checked and said the number would do — and then had them checked again.',
  'khong-ai-toi.chronicle': 'Nobody was called.',

  'so-quan-la-so-quan.line': 'The rolls are the rolls. This is what we have.',
  'so-quan-la-so-quan.scene': 'Three companies in the capital, two on the border, and whatever the districts can raise if they raise it now. The Marshal read it aloud in the hall without adding anything, and closed the book. He did not ask for more, because there is no more. This is what fighting a war without a miracle looks like.',
  'so-quan-la-so-quan.chronicle': 'We fight with the men on the rolls.',

  'danh-the-nao.title': 'How to Fight It',
  'danh-the-nao.body': 'There is no miracle, so this is now a matter for soldiers. They will come by two roads and we cannot hold both. The Marshal sets out two ways of doing it and says plainly that he is not sure which is better — which he has never said before.',
  'danh-the-nao.advice': 'Hold the pass and lose the fields. Meet them and lose both, if we lose.',
  'danh-the-nao.giu-ai': 'Hold the passes',
  'danh-the-nao.giu-ai.d': 'A narrow road can be shut by few men.',
  'danh-the-nao.dan-tran': 'Meet them in the open',
  'danh-the-nao.dan-tran.d': 'One battle, finished, on ground we choose.',
  'danh-the-nao.chronicle': 'You chose how the war would be fought.',

  'ai-hep-va-sau.line': 'The pass is narrow and deep, with rock on both sides.',
  'ai-hep-va-sau.scene': 'They are dug in where the gorge pinches to the width of two men abreast. The soldiers cut timber into hurdles and piled earth on them, working all night without being told twice. The warden says it can be held, if the enemy comes in — and they must, because the other road is ten days longer.',
  'ai-hep-va-sau.chronicle': 'Our men dug in at the pass.',

  'dot-kho-hay-cat-duong.title': 'Burn It or Cut the Road',
  'dot-kho-hay-cat-duong.body': 'They are three days from the pass. Two things can be done in three days and only one of them can be done: burn the grain in every village ahead of them so there is nothing to eat when they arrive, or let them through and cut the road behind. The first one means burning our own people’s rice.',
  'dot-kho-hay-cat-duong.advice': 'A hungry season is survivable. A fed enemy is not.',
  'dot-kho-hay-cat-duong.dot-kho-truoc-mat-chung': 'Burn everything ahead of them',
  'dot-kho-hay-cat-duong.dot-kho-truoc-mat-chung.d': 'They arrive to nothing.',
  'dot-kho-hay-cat-duong.cat-duong-sau-lung': 'Cut the road behind them',
  'dot-kho-hay-cat-duong.cat-duong-sau-lung.d': 'Let them through, then shut it.',
  'dot-kho-hay-cat-duong.chronicle': 'You decided the matter at the pass.',

  'tu-lo-lay-duoc.title': 'We Managed It Ourselves',
  'tu-lo-lay-duoc.body': 'They came into the pass on the fourth day and did not come out. No iron horse, no child — only our men, on ground we chose, in just enough numbers. People tell this story far less often than the other one, but the villages remember it, and what they remember is that nobody had to wait for a miracle.',
  'tu-lo-lay-duoc.ok': 'Enter it in the annals',
  'tu-lo-lay-duoc.chronicle': 'We turned them back without a miracle.',

  'mat-phu-dong-that-thu.title': '{land} Fell',
  'mat-phu-dong-that-thu.body': 'They were through the pass before the road closed behind them, and the price of letting them through was {land}. By the time our men shut it, the place had been burning for two days. They lost, and we do not call it a victory.',
  'mat-phu-dong-that-thu.ok': 'Record both halves of it',
  'mat-phu-dong-that-thu.chronicle': '{land} burned. They were beaten behind it.',

  'dan-tran-ngoai-dong.line': 'Our line is out in the open, on the high ground to the left.',
  'dan-tran-ngoai-dong.scene': 'The fields were harvested last month so the ground carries, and that is the only reason this place was chosen. The men have stood since dawn and eaten where they stand and nobody may leave the line. Across the field the dust has been rising since noon and thickening, and we have watched it thicken.',
  'dan-tran-ngoai-dong.chronicle': 'Our line formed in the open.',

  'ai-cam-quan.title': 'Who Commands',
  'ai-cam-quan.body': 'This will be settled in one battle, so who commands it is the last question. The Marshal is old and has fought this battle three times in his head. But the men have been standing in that field since dawn, and there is one thing only one person in the country can do for them, and he is sitting in the hall.',
  'ai-cam-quan.advice': 'Go yourself and we win larger. Lose, and there is nobody left to write it down.',
  'ai-cam-quan.tuong-gia-cam': 'Let the old Marshal have it',
  'ai-cam-quan.tuong-gia-cam.d': 'He knows the work, and he knows this ground.',
  'ai-cam-quan.vua-di': 'Go yourself',
  'ai-cam-quan.vua-di.d': 'They have been standing in that field since dawn.',
  'ai-cam-quan.chronicle': 'You chose who would command.',

  'tuong-gia-giu-duoc-dat.title': 'The Old Marshal Held',
  'tuong-gia-giu-duoc-dat.body': 'He held the line until the other side broke first, and he did not come back. They found him in the front rank, on the spot he had stood on since dawn. The ground was held. In the hall his chair stayed empty for the rest of that season because nobody wanted to sit in it yet.',
  'tuong-gia-giu-duoc-dat.ok': 'Write down his name',
  'tuong-gia-giu-duoc-dat.chronicle': 'The old Marshal held the ground and did not return.',

  'vua-than-chinh-ra-tran.title': 'You Went Yourself',
  'vua-than-chinh-ra-tran.body': 'When the men saw the royal standard in the second rank the first rank straightened up, and that is in no book anywhere. The battle ran from noon until the light went. Afterwards, asked about that year, the villages do not describe the fighting — they describe where the king was standing.',
  'vua-than-chinh-ra-tran.ok': 'Enter it in the annals',
  'vua-than-chinh-ra-tran.chronicle': 'The king went himself. The villages remember where he stood.',
  // The spine's own labels: what the story page calls each step it has passed through.
  'node.tin-giac': 'News of the Ân',
  'node.su-gia': 'The herald on the road',
  'node.ren-sat': 'The forge, and the offering',
  'node.ra-tran': 'He rides',
  'node.soc-son': 'Sóc Sơn',
  'node.nga-ngua': 'The horse came back alone',
  'node.khong-du-an': 'The armour rusts in the store',
  'node.cho-gao': 'Rice, not iron',
  'node.tay-khong': 'Going out with nothing',
  'node.nhung-cay-tre': 'The yellow bamboo',
  'node.nga-o-ruong': 'Down in the paddy',
  'node.giu-lang': 'Kept in the village',
  'node.nguoi-khong-lo': 'The giant stays',
  'node.bo-di': 'One night he went',
  'node.chuong-chua': 'The temple bell',
  'node.giap-dong': 'Bronze armour',
  'node.su-phan-doi': 'The bell stayed up',
  'node.dua-ve-trieu': 'The child in the palace',
  'node.phong-vuong': 'A title for a child',
  'node.hau-tre': 'The young marquis',
  'node.chet-yeu': 'He died inside',
  'node.thay-thuoc': 'The physicians found nothing',
  'node.khong-goi': 'Nobody was called',
  'node.giu-ai': 'Holding the pass',
  'node.tu-lo-lay': 'We managed it ourselves',
  'node.mat-phu-dong': '{land} fell',
  'node.dan-tran': 'The line in the open',
  'node.tuong-gia': 'The old Marshal commands',
  'node.vua-than-chinh': 'You went yourself',
};

