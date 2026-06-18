export interface PoliticsText {
  title: string;
  description: string;
  choices: Record<string, { label: string; description: string }>;
}

export const viPolitics: Record<string, PoliticsText> = {
  'granary-charter': {
    title: 'Điều Lệ Kho Lương',
    description: 'Triều đình bàn cách bảo vệ thóc lúa dự trữ cho toàn cõi.',
    choices: {
      'royal-granaries': { label: 'Kho Lương Hoàng Gia', description: 'Thu nhập lương thực tăng vĩnh viễn.' },
      'settler-rations': { label: 'Khẩu Phần Khai Khẩn', description: 'Tăng trưởng dân số tăng vĩnh viễn.' },
    },
  },
  'mint-policy': {
    title: 'Chính Sách Đúc Tiền',
    description: 'Quan coi ngân khố đề xuất chuẩn mới cho tiền đúc và thuế thương mại.',
    choices: {
      'true-weight-coins': { label: 'Tiền Đúng Trọng Lượng', description: 'Thu nhập vàng tăng vĩnh viễn.' },
      'merchant-ledgers': { label: 'Sổ Cái Thương Nhân', description: 'Các chợ tạo thêm vàng vĩnh viễn.' },
    },
  },
  'arsenal-charter': {
    title: 'Điều Lệ Quân Khí',
    description: 'Thợ rèn xin triều đình chuẩn hóa kho vật tư và dụng cụ quân sự.',
    choices: {
      'royal-warehouses': { label: 'Kho Vật Tư Hoàng Gia', description: 'Thu nhập vật tư tăng vĩnh viễn.' },
      'cheap-armories': { label: 'Xưởng Giáp Tiết Kiệm', description: 'Chi phí vật tư tuyển mộ giảm vĩnh viễn.' },
    },
  },
  'maintenance-edict': {
    title: 'Sắc Lệnh Bảo Trì',
    description: 'Quan lại tìm cách cắt giảm chi phí duy trì hằng kỳ.',
    choices: {
      'building-audits': { label: 'Kiểm Kê Công Trình', description: 'Bảo trì vàng cho công trình giảm vĩnh viễn.' },
      'supply-audits': { label: 'Kiểm Kê Vật Tư', description: 'Bảo trì vật tư cho công trình giảm vĩnh viễn.' },
    },
  },
  'campaign-budget': {
    title: 'Ngân Sách Chiến Dịch',
    description: 'Tướng lĩnh và thư lại tranh luận về quân phí.',
    choices: {
      'lean-camps': { label: 'Doanh Trại Gọn Nhẹ', description: 'Bảo trì vàng cho quân đội giảm vĩnh viễn.' },
      'settlement-brokers': { label: 'Môi Giới Định Cư', description: 'Chi phí thâu nạp hòa bình giảm vĩnh viễn.' },
    },
  },
  'spring-harvest': {
    title: 'Vụ Xuân Thuận Lợi',
    description: 'Thời tiết ôn hòa giúp làng xã tạo ra lương dư.',
    choices: {
      'store-rice': { label: 'Tích Trữ Gạo', description: 'Thu nhập lương thực tăng mạnh trong 6 nhịp.' },
      'invite-settlers': { label: 'Mời Dân Khai Khẩn', description: 'Tăng trưởng dân số tăng mạnh trong 6 nhịp.' },
    },
  },
  'river-tolls': {
    title: 'Thuế Bến Sông',
    description: 'Đường thủy tấp nập có thể làm đầy ngân khố hoặc kho vật tư.',
    choices: {
      'collect-tolls': { label: 'Thu Thuế Bến', description: 'Thu nhập vàng tăng mạnh trong 6 nhịp.' },
      'stock-boats': { label: 'Tích Trữ Thuyền Hàng', description: 'Thu nhập vật tư tăng mạnh trong 6 nhịp.' },
    },
  },
  'trade-caravan': {
    title: 'Đoàn Thương Lữ',
    description: 'Một đoàn buôn đem đến cơ hội thương mại bất thường.',
    choices: {
      'escort-caravan': { label: 'Hộ Tống Đoàn Buôn', description: 'Vàng và vật tư tăng trong 5 nhịp.' },
      'sell-grain': { label: 'Bán Thóc Dư', description: 'Nhận vàng ngay lập tức.' },
    },
  },
  'bad-harvest': {
    title: 'Mất Mùa',
    description: 'Triều đình phải quyết định cách gánh chịu một vụ mùa kém.',
    choices: {
      'tight-rations': { label: 'Siết Khẩu Phần', description: 'Thu nhập lương thực giảm trong 4 nhịp.' },
      'buy-relief-grain': { label: 'Mua Gạo Cứu Trợ', description: 'Dùng vàng để nhận lương thực ngay.' },
    },
  },
  'leaking-treasury': {
    title: 'Ngân Khố Rò Rỉ',
    description: 'Tiền biến mất khỏi sổ sách các tỉnh.',
    choices: {
      'accept-losses': { label: 'Chấp Nhận Hao Hụt', description: 'Thu nhập vàng giảm trong 4 nhịp.' },
      'seize-ledgers': { label: 'Tịch Thu Sổ Sách', description: 'Thu hồi ngay một phần vàng và vật tư.' },
    },
  },
  'spoiled-stores': {
    title: 'Kho Hàng Hư Hỏng',
    description: 'Kho vật tư bị ẩm, khiến dự trữ trở nên thiếu tin cậy.',
    choices: {
      'patch-warehouses': { label: 'Vá Lại Kho', description: 'Thu nhập vật tư giảm trong 4 nhịp.' },
      'emergency-purchase': { label: 'Mua Khẩn Cấp', description: 'Dùng vàng để nhận vật tư ngay.' },
    },
  },
  'labor-unrest': {
    title: 'Lao Dịch Bất Ổn',
    description: 'Dân phu chống lại lệnh trưng tập và việc xây dựng.',
    choices: {
      'concede-wages': { label: 'Nhượng Bộ Tiền Công', description: 'Tăng trưởng dân số giảm trong 4 nhịp.' },
      'pay-bonuses': { label: 'Trả Thưởng', description: 'Dùng vàng để nhận thêm dân ngay.' },
    },
  },
  'market-slowdown': {
    title: 'Chợ Đình Trệ',
    description: 'Thương nhân giữ hàng chờ triều đình định chính sách.',
    choices: {
      'lower-fees': { label: 'Hạ Phí Chợ', description: 'Sản lượng vàng từ chợ giảm ngắn hạn rồi hồi phục.' },
      'forced-sales': { label: 'Buộc Bán Hàng', description: 'Nhận ngay lương thực và vật tư.' },
    },
  },
  'good-harvest': {
    title: 'Được Mùa',
    description: 'Kho lương đầy nhanh hơn dự kiến, nhưng triều đình phải chọn nơi dùng phần dư.',
    choices: {
      'store-harvest': { label: 'Cất Vụ Mùa', description: 'Thu nhập lương thực tăng trong thời gian ngắn.' },
      'sell-surplus': { label: 'Bán Phần Dư', description: 'Dùng lương thực để nhận vàng ngay.' },
    },
  },
  'flooded-fields': {
    title: 'Ruộng Ngập Lụt',
    description: 'Nước lớn phá ruộng thấp và buộc phải sửa kênh mương khẩn cấp.',
    choices: {
      'accept-flood-losses': { label: 'Chấp Nhận Thiệt Hại', description: 'Thu nhập lương thực giảm trong vài nhịp.' },
      'repair-dikes': { label: 'Sửa Đê', description: 'Dùng vật tư và vàng để giảm nhẹ thiệt hại.' },
    },
  },
  'harsh-winter': {
    title: 'Mùa Đông Khắc Nghiệt',
    description: 'Giá rét làm căng kho dự trữ, đường sá và lương ăn trong dân.',
    choices: {
      'ration-through-winter': { label: 'Chia Khẩu Phần Qua Đông', description: 'Lương thực và tăng trưởng dân số giảm ngắn hạn.' },
      'winter-relief': { label: 'Cứu Trợ Mùa Đông', description: 'Dùng lương và vàng để bảo vệ ổn định.' },
    },
  },
  'granary-spoilage': {
    title: 'Thóc Kho Mốc Hỏng',
    description: 'Kho ẩm và sâu mọt đe dọa dự trữ trước vụ sau.',
    choices: {
      'dump-spoiled-grain': { label: 'Đổ Bỏ Thóc Hỏng', description: 'Thu nhập lương thực giảm trong lúc dọn kho.' },
      'fumigate-stores': { label: 'Xông Kho', description: 'Dùng vàng và vật tư để giữ lại một phần dự trữ.' },
    },
  },
  'tax-shortfall': {
    title: 'Thiếu Thu Thuế',
    description: 'Thương mại chậm lại, quan thu thuế báo số vàng thấp hơn kế hoạch.',
    choices: {
      'delay-projects': { label: 'Hoãn Dự Án', description: 'Thu nhập vàng giảm trong vài nhịp.' },
      'audit-collectors': { label: 'Kiểm Tra Quan Thu Thuế', description: 'Dùng vật tư để thu hồi một phần vàng.' },
    },
  },
  'market-corruption': {
    title: 'Tham Nhũng Chợ Búa',
    description: 'Thương nhân và thư lại giấu doanh thu trong mạng lưới chợ.',
    choices: {
      'tolerate-leakage': { label: 'Tạm Chịu Thất Thoát', description: 'Sản lượng vàng từ chợ giảm trong thời gian ngắn.' },
      'clean-ledgers': { label: 'Làm Sạch Sổ Sách', description: 'Dùng vàng để đổi lấy ổn định và ảnh hưởng.' },
    },
  },
  'mine-accident': {
    title: 'Tai Nạn Hầm Mỏ',
    description: 'Một hầm mỏ sập đe dọa sản xuất và trật tự công cộng.',
    choices: {
      'close-shafts': { label: 'Đóng Hầm', description: 'Thu nhập vật tư giảm trong lúc gia cố mỏ.' },
      'rescue-crews': { label: 'Đội Cứu Hộ', description: 'Dùng lương và vàng để bảo vệ thợ mỏ.' },
    },
  },
  'army-wage-arrears': {
    title: 'Nợ Lương Quân',
    description: 'Các đội trưởng cảnh báo việc chậm lương sẽ lan khắp doanh trại.',
    choices: {
      'promise-backpay': { label: 'Hứa Trả Bù', description: 'Bảo trì vàng cho quân đội tăng ngắn hạn.' },
      'pay-arrears': { label: 'Trả Nợ Lương', description: 'Dùng vàng để khôi phục sẵn sàng cho quân đội.' },
    },
  },
  'public-festival': {
    title: 'Hội Làng',
    description: 'Nhà cộng đồng có thể tổ chức lễ hội nếu kho lương chịu nổi.',
    choices: {
      'hold-festival': { label: 'Mở Hội Lớn', description: 'Dùng lương để đổi lấy ổn định, ân huệ và tăng trưởng.' },
      'modest-gathering': { label: 'Hội Nhỏ', description: 'Nhận một ít ân huệ mà không tốn kho dự trữ.' },
    },
  },
  'farm-petition': {
    title: 'Thỉnh Cầu Ruộng Mới',
    description: 'Kỳ mục trong làng xin trợ giúp để mở thêm đồng ruộng.',
    choices: {
      'grant-farm': { label: 'Cấp Nông Trại', description: 'Thêm miễn phí một Nông trại vào quận phù hợp.' },
      'improve-farm': { label: 'Cải Thiện Nông Trại', description: 'Nâng cấp miễn phí một Nông trại hiện có.' },
    },
  },
  'mine-charter': {
    title: 'Điều Lệ Khai Mỏ',
    description: 'Người dò quặng tìm thấy mỏ hữu ích trong vùng đồi.',
    choices: {
      'grant-mine': { label: 'Cấp Mỏ', description: 'Thêm miễn phí một Mỏ vào quận phù hợp.' },
      'deepen-mine': { label: 'Đào Mỏ Sâu Hơn', description: 'Nâng cấp miễn phí một Mỏ hiện có.' },
    },
  },
  'merchant-quarter': {
    title: 'Phường Thương Nhân',
    description: 'Các phường hội đề nghị tổ chức một khu buôn bán mới.',
    choices: {
      'grant-market': { label: 'Cấp Chợ', description: 'Thêm miễn phí một Chợ vào quận phù hợp.' },
      'expand-market': { label: 'Mở Rộng Chợ', description: 'Nâng cấp miễn phí một Chợ hiện có.' },
    },
  },
  'drill-ground': {
    title: 'Bãi Luyện Quân',
    description: 'Cựu binh xin lập nơi huấn luyện chính thức.',
    choices: {
      'grant-barracks': { label: 'Cấp Trại Lính', description: 'Thêm miễn phí một Trại lính vào quận phù hợp.' },
      'expand-barracks': { label: 'Mở Rộng Trại Lính', description: 'Nâng cấp miễn phí một Trại lính hiện có.' },
    },
  },
  'communal-hall-patronage': {
    title: 'Bảo Trợ Nhà Cộng Đồng',
    description: 'Kỳ mục xin lập nhà công để xử tranh chấp, mở hội và truyền lệnh triều đình.',
    choices: {
      'grant-communal-hall': { label: 'Cấp Nhà Cộng Đồng', description: 'Thêm miễn phí một Nhà cộng đồng vào quận phù hợp.' },
      'expand-communal-hall': { label: 'Mở Rộng Nhà Cộng Đồng', description: 'Nâng cấp miễn phí một Nhà cộng đồng hiện có.' },
    },
  },
  'frontier-defenses': {
    title: 'Phòng Thủ Biên Cương',
    description: 'Trinh sát báo một quận biên giới cần phòng thủ mạnh hơn.',
    choices: {
      'raise-wall': { label: 'Dựng Tường', description: 'Thêm miễn phí một Tường thành vào quận phù hợp.' },
      'raise-tower': { label: 'Dựng Tháp', description: 'Thêm miễn phí một Tháp canh vào quận phù hợp.' },
    },
  },
  'border-repair': {
    title: 'Sửa Đồn Biên',
    description: 'Một tiền đồn biên giới cần sửa nhanh trước cuộc tập kích kế tiếp.',
    choices: {
      'reinforce-post': { label: 'Gia Cố Đồn', description: 'Tăng phòng thủ cho một quận của người chơi.' },
      'stock-garrison': { label: 'Bổ Sung Đồn Trú', description: 'Nhận vật tư cho quân biên giới.' },
    },
  },
  'visiting-hero': {
    title: 'Anh Hùng Viếng Thăm',
    description: 'Lữ khách truyền tin về những người tài đang tìm minh chủ.',
    choices: {
      'open-court': { label: 'Mở Triều Tiếp Đón', description: 'Lập tức chọn từ bất kỳ đợt anh hùng nào.' },
      'seek-general': { label: 'Tìm Tướng Quân', description: 'Lập tức chọn từ đợt thiên về tướng quân.' },
    },
  },
  'civil-service': {
    title: 'Quan Lại Dân Chính',
    description: 'Triều đình có thể bảo trợ ứng viên cho việc cai quản địa phương.',
    choices: {
      'seek-governor': { label: 'Tìm Thái Thú', description: 'Lập tức chọn từ đợt thiên về thái thú.' },
      'seek-minister': { label: 'Tìm Đại Thần', description: 'Lập tức chọn từ đợt thiên về đại thần.' },
    },
  },
  'spy-candidate': {
    title: 'Ứng Viên Mật Thám',
    description: 'Một mật sứ kín đáo dâng tin tình báo hữu ích.',
    choices: {
      'seek-agent': { label: 'Tìm Mật Sứ', description: 'Lập tức chọn từ đợt thiên về mật sứ.' },
      'sell-intel': { label: 'Bán Tin Mật', description: 'Biến bí mật thành vàng ngay.' },
    },
  },
  'recruitment-drive': {
    title: 'Đợt Tuyển Quân',
    description: 'Quan tuyển mộ xin phép gom quân nhanh hơn.',
    choices: {
      'short-drive': { label: 'Đợt Ngắn', description: 'Tuyển quân nhanh hơn trong 4 nhịp.' },
      'long-drive': { label: 'Đợt Dài', description: 'Tuyển quân nhanh hơn trong 8 nhịp.' },
    },
  },
  'unit-specialists': {
    title: 'Chuyên Gia Binh Chủng',
    description: 'Các đội trưởng có thể định hình đạo quân kế tiếp trước khi tập hợp.',
    choices: {
      'archer-cadres': { label: 'Khung Cung Thủ', description: 'Đạo quân tuyển mộ kế tiếp có nhiều cung thủ hơn.' },
      'heavy-cadres': { label: 'Khung Bộ Binh Nặng', description: 'Đạo quân tuyển mộ kế tiếp có nhiều bộ binh nặng hơn.' },
    },
  },
  'court-calendar': {
    title: 'Lịch Triều Chính',
    description: 'Thư lại đề xuất nhịp quyết sách dày hơn cho hoàng triều.',
    choices: {
      'urgent-session': { label: 'Phiên Khẩn', description: 'Thẻ triều đình kế tiếp đến sớm hơn.' },
      'six-day-docket': { label: 'Lịch Sáu Ngày', description: 'Thẻ triều đình đến nhanh hơn trong 6 nhịp.' },
    },
  },
  'court-procedure': {
    title: 'Thủ Tục Triều Đình',
    description: 'Triều đình có thể trở thành guồng máy quyết sách lâu dài.',
    choices: {
      'standing-council': { label: 'Hội Đồng Thường Trực', description: 'Thẻ triều đình đến nhanh hơn vĩnh viễn.' },
      'second-docket': { label: 'Sổ Việc Thứ Hai', description: 'Một thẻ triều đình khác xuất hiện ngay sau đó.' },
    },
  },
  'building-guilds': {
    title: 'Phường Thợ Xây',
    description: 'Thợ thủ công đề xuất cách đẩy nhanh xây dựng.',
    choices: {
      'fast-builders': { label: 'Thợ Xây Nhanh', description: 'Công trình mới hoàn tất nhanh hơn trong 4 nhịp.' },
      'fast-upgraders': { label: 'Thợ Nâng Cấp Nhanh', description: 'Nâng cấp hoàn tất nhanh hơn trong 4 nhịp.' },
    },
  },
  'royal-inspectors': {
    title: 'Thanh Tra Hoàng Gia',
    description: 'Thanh tra có thể thúc ép để hoàn tất việc đang làm.',
    choices: {
      'finish-building': { label: 'Hoàn Tất Xây Dựng', description: 'Hoàn tất một lệnh xây đang hoạt động.' },
      'finish-upgrade': { label: 'Hoàn Tất Nâng Cấp', description: 'Hoàn tất một lệnh nâng cấp đang hoạt động.' },
    },
  },
  'military-lessons': {
    title: 'Bài Học Quân Sự',
    description: 'Cựu binh đúc kết kinh nghiệm chiến trường.',
    choices: {
      'field-school': { label: 'Trường Dã Chiến', description: 'Quân đội nhận nhiều XP hơn trong 6 nhịp.' },
      'seasoned-recruits': { label: 'Tân Binh Dày Dạn', description: 'Đạo quân tuyển mộ kế tiếp bắt đầu cao hơn một cấp.' },
    },
  },
  'elite-command': {
    title: 'Chỉ Huy Tinh Nhuệ',
    description: 'Tướng lĩnh xin triều đình đầu tư vào tầng lớp chỉ huy chuyên nghiệp.',
    choices: {
      'higher-caps': { label: 'Trần Cấp Cao Hơn', description: 'Giới hạn cấp quân đội tăng trong 8 nhịp.' },
      'restore-readiness': { label: 'Khôi Phục Sẵn Sàng', description: 'Khôi phục tinh thần và tiếp tế cho quân đội người chơi.' },
    },
  },
  'battle-logistics': {
    title: 'Hậu Cần Chiến Trận',
    description: 'Quan quân nhu đề xuất cách hỗ trợ chiến dịch gọn nhẹ hơn.',
    choices: {
      'frugal-battles': { label: 'Trận Đánh Tiết Kiệm', description: 'Chi phí vật tư chiến trận giảm trong 8 nhịp.' },
      'discount-contracts': { label: 'Khế Ước Giảm Giá', description: 'Các công trình kế tiếp rẻ hơn trong 6 nhịp.' },
    },
  },
  'noble-feast': {
    title: 'Yến Tiệc Hào Tộc',
    description: 'Triều đình đề xuất tiếp đãi hào tộc. Yến tiệc lớn tốn kém nhưng thu phục lòng người.',
    choices: {
      'grand-banquet': { label: 'Đại Tiệc Hoàng Gia', description: 'Tốn lương thực và vàng để tăng mạnh ổn định và ảnh hưởng.' },
      'modest-reception': { label: 'Tiệc Đơn Giản', description: 'Tốn ít vàng để tăng nhẹ uy tín.' },
    },
  },
  'court-conspiracy': {
    title: 'Âm Mưu Triều Đình',
    description: 'Tin đồn về một phe hào tộc đang mưu phản đến tai nhà vua.',
    choices: {
      'investigate-plot': { label: 'Điều Tra', description: 'Tốn ảnh hưởng để triệt hạ kẻ phản — ổn định tăng nhưng thu nhập vàng giảm ngắn hạn.' },
      'ignore-rumors': { label: 'Bỏ Qua Tin Đồn', description: 'Không làm gì — ổn định giảm khi tin đồn lan rộng.' },
    },
  },
  'royal-succession': {
    title: 'Khủng Hoảng Kế Vị',
    description: 'Các phe phái tranh nhau ngôi kế thừa, khiến triều đình và các tỉnh bất ổn.',
    choices: {
      'settle-succession': { label: 'Giải Quyết Dứt Khoát', description: 'Tốn vàng và ảnh hưởng để giải quyết tranh chấp. Ổn định tăng mạnh.' },
      'let-crisis-fester': { label: 'Mặc Cho Hỗn Loạn', description: 'Ổn định và uy tín giảm mạnh. Không tốn tài nguyên.' },
    },
  },
  'army-mutiny': {
    title: 'Binh Biến',
    description: 'Một đại đội từ chối lệnh vì lương chưa trả và điều kiện khắc nghiệt.',
    choices: {
      'pay-soldiers': { label: 'Trả Lương Ngay', description: 'Tốn vàng để khôi phục sẵn sàng và tinh thần quân đội.' },
      'crush-mutiny': { label: 'Dẹp Binh Biến', description: 'Đàn áp không trả lương — ổn định và uy tín giảm, không tốn vàng.' },
    },
  },
  'war-spoils': {
    title: 'Chiến Lợi Phẩm',
    description: 'Lương thực và vũ khí thu được từ biên giới về đến kinh thành. Triều đình quyết định cách sử dụng.',
    choices: {
      'rearm-troops': { label: 'Tái Trang Bị Quân Đội', description: 'Chuyển chiến lợi phẩm thành vật tư và khôi phục sẵn sàng chiến đấu.' },
      'sell-spoils': { label: 'Bán Chiến Lợi Phẩm', description: 'Đổi hàng thu được lấy vàng và lương thực.' },
    },
  },
  'plague-scare': {
    title: 'Lo Dịch Bệnh',
    description: 'Sốt lan qua các thị trấn chợ. Triều đình phải hành động trước khi trở thành dịch lớn.',
    choices: {
      'enforce-quarantine': { label: 'Phong Tỏa', description: 'Tăng trưởng dân và lương thực giảm khi đường sá đóng — nhưng dịch được kiểm soát.' },
      'distribute-medicine': { label: 'Phát Thuốc', description: 'Tốn vàng và vật tư để chữa bệnh trực tiếp.' },
    },
  },
  'noble-marriage': {
    title: 'Hôn Nhân Liên Minh',
    description: 'Một gia tộc hào tộc đề xuất hôn nhân chiến lược để củng cố mối quan hệ với vương triều.',
    choices: {
      'accept-alliance': { label: 'Chấp Thuận Liên Minh', description: 'Tăng ảnh hưởng và ổn định — tốn vàng hồi môn.' },
      'polite-refusal': { label: 'Từ Chối Lịch Sự', description: 'Nhận một ít thiện chí thay thế.' },
    },
  },
  'silk-road': {
    title: 'Đoàn Lữ Thương Con Đường Tơ Lụa',
    description: 'Đoàn thương nhân hiếm gặp từ phương xa đi qua cõi đất, mang theo các giao dịch lạ thường.',
    choices: {
      'buy-luxury-goods': { label: 'Mua Hàng Xa Xỉ', description: 'Tốn vàng để tăng ổn định, uy tín và ảnh hưởng.' },
      'sell-grain-silk': { label: 'Bán Lương Thực Dư', description: 'Đổi lương thực lấy vàng và vật tư.' },
    },
  },
  'scholars-proposal': {
    title: 'Học Viện Nho Thần',
    description: 'Các học giả xin triều đình tài trợ một học viện về văn và võ.',
    choices: {
      'fund-academy': { label: 'Tài Trợ Học Viện', description: 'Tốn vàng để tăng ảnh hưởng và tốc độ thẻ triều đình vĩnh viễn.' },
      'recruit-scholars': { label: 'Chiêu Mộ Làm Sĩ Quan', description: 'Biến học giả thành huấn luyện viên quân sự — thưởng kinh nghiệm quân đội.' },
    },
  },
  'temple-rededication': {
    title: 'Tái Hiến Đền Thờ',
    description: 'Các thầy tế kêu gọi lễ tái hiến ngôi đền lớn và tưởng nhớ tổ tiên.',
    choices: {
      'grand-ceremony': { label: 'Đại Lễ', description: 'Tốn lương và vàng để tăng mạnh ổn định, uy tín và ảnh hưởng.' },
      'modest-offering': { label: 'Lễ Vật Đơn Giản', description: 'Dâng ít lương thực để tăng nhẹ uy tín.' },
    },
  },
  'river-pirates': {
    title: 'Thổ Phỉ Sông',
    description: 'Tàu vũ trang cướp bóc thương nhân trên sông, gây xáo trộn thương mại và hoang mang nông dân.',
    choices: {
      'river-patrol': { label: 'Tuần Tra Sông', description: 'Tốn vàng và vật tư để bảo đảm đường thủy. Thu nhập vàng phục hồi.' },
      'pay-off-pirates': { label: 'Mua Chuộc Thổ Phỉ', description: 'Tốn vàng để đuổi chúng đi — rẻ hơn nhưng không có lợi lâu dài.' },
    },
  },
  'mountain-pass': {
    title: 'Tranh Chấp Đèo Núi',
    description: 'Thổ phỉ và các bộ lạc chiếm đèo chiến lược, cắt đứt đường tiếp tế.',
    choices: {
      'garrison-pass': { label: 'Đặt Đồn Canh', description: 'Tốn vàng và vật tư để kiểm soát — tăng phòng thủ và ổn định thu nhập vật tư.' },
      'negotiate-toll': { label: 'Đàm Phán Thu Lệ Phí', description: 'Trả cho bộ lạc địa phương để giữ hòa bình — rẻ hơn, thu nhập vàng vừa phải.' },
    },
  },
  'border-skirmish': {
    title: 'Giao Chiến Biên Giới',
    description: 'Lính canh biên giới đụng độ với quân cướp từ bên ngoài, đòi hỏi phản ứng nhanh.',
    choices: {
      'reinforce-border': { label: 'Tăng Cường Biên Phòng', description: 'Tốn vật tư và vàng — tăng phòng thủ và phục hồi sẵn sàng quân đội.' },
      'withhold-response': { label: 'Chờ Đợi', description: 'Tránh tốn kém — ổn định giảm khi dân làng cảm thấy bị bỏ mặc.' },
    },
  },
  'drought-warning': {
    title: 'Cảnh Báo Hạn Hán',
    description: 'Nhà chiêm tinh và nông dân cảnh báo về những tháng khô hạn sắp đến. Triều đình có thể chuẩn bị từ sớm.',
    choices: {
      'build-reserves': { label: 'Tích Trữ Dự Phòng', description: 'Tốn vàng để dự trữ thêm lương thực — giảm tác động hạn hán.' },
      'do-nothing-drought': { label: 'Không Làm Gì', description: 'Chấp nhận rủi ro — thu nhập lương thực sẽ giảm mạnh mùa sau.' },
    },
  },
  'elite-deserters': {
    title: 'Lính Tinh Nhuệ Đào Ngũ',
    description: 'Những cựu binh kỳ cựu đã lặng lẽ bỏ ngũ, mang theo vũ khí và kinh nghiệm.',
    choices: {
      'recall-veterans': { label: 'Triệu Hồi Cựu Binh', description: 'Tốn vàng và vật tư để thu phục họ — quân đội phục hồi sẵn sàng.' },
      'recruit-fresh': { label: 'Tuyển Quân Mới', description: 'Tốn vàng và dân để bổ sung hàng ngũ nhanh hơn.' },
    },
  },
  'treasury-windfall': {
    title: 'Bất Ngờ Được Của',
    description: 'Một khoản thừa kế vô chủ và các khoản nợ thu hồi được làm phình to ngân khố bất ngờ.',
    choices: {
      'invest-windfall': { label: 'Đầu Tư Vào Phát Triển', description: 'Chuyển vàng thành tăng trưởng dân và lương thực vĩnh viễn.' },
      'keep-windfall': { label: 'Giữ Nguyên Vàng', description: 'Giữ tất cả — thu vàng thuần.' },
    },
  },
  'peasant-petition': {
    title: 'Thỉnh Nguyện Nông Dân',
    description: 'Đám nông dân chặn đường vào kinh thành, đòi giảm thuế và đối xử công bằng hơn.',
    choices: {
      'grant-relief': { label: 'Ban Ân Xá', description: 'Thu nhập vàng giảm ngắn hạn nhưng ổn định và uy tín tăng mạnh.' },
      'disperse-crowd': { label: 'Giải Tán Đám Đông', description: 'Gửi lính — không tốn tài nguyên nhưng uy tín và ổn định giảm.' },
    },
  },
  'road-building': {
    title: 'Sắc Lệnh Mở Đường',
    description: 'Kỹ sư đề xuất mở rộng mạng lưới đường để tăng tốc quân đội, thương mại và xây dựng.',
    choices: {
      'military-roads': { label: 'Đường Quân Sự', description: 'Tốn vật tư và vàng — tuyển mộ và di chuyển quân nhanh hơn trong 6 nhịp.' },
      'merchant-roads': { label: 'Đường Thương Mại', description: 'Tốn vàng — thu nhập vàng và vật tư tăng trong 5 nhịp.' },
    },
  },
  'royal-envoy': {
    title: 'Phái Sứ Thần Hoàng Gia',
    description: 'Triều đình đề xuất phái sứ thần mang quà và hảo ý đến các vương quốc lân cận.',
    choices: {
      'full-diplomatic-tour': { label: 'Đại Tu Ngoại Giao', description: 'Tốn vàng và ảnh hưởng để cải thiện quan hệ với mọi vương quốc và hủy bỏ mọi nguy cơ xâm lược đang đến gần.' },
      'token-envoys': { label: 'Cử Sứ Mang Lễ', description: 'Tốn ít vàng để cải thiện nhẹ quan hệ với tất cả các nước.' },
    },
  },
  'border-insult': {
    title: 'Xúc Phạm Biên Giới',
    description: 'Một vị vua láng giềng tuyên bố lãnh chúa biên giới của ta đã xúc phạm sứ thần của ông ta. Quan hệ với mọi nước xấu đi trừ khi triều đình hành động nhanh.',
    choices: {
      'formal-apology': { label: 'Xin Lỗi Chính Thức', description: 'Tốn vàng và ảnh hưởng để dàn xếp — quan hệ phục hồi với tất cả các nước.' },
      'reject-accusation': { label: 'Bác Bỏ Lời Buộc Tội', description: 'Kiên quyết đứng vững — quan hệ giảm sâu hơn và nguy cơ thù địch tăng.' },
    },
  },
  'foreign-hostage': {
    title: 'Trao Đổi Con Tin',
    description: 'Một triều đình đối địch đề xuất trao đổi con tin quý tộc như bảo đảm hòa bình — tập tục cũ nhưng vẫn còn uy lực.',
    choices: {
      'accept-hostage-pact': { label: 'Chấp Nhận Giao Ước', description: 'Gửi con cháu quý tộc — quan hệ cải thiện mạnh và mọi bộ đếm thù địch bị hủy bỏ.' },
      'decline-hostage-pact': { label: 'Từ Chối Kiên Quyết', description: 'Từ chối trao đổi — quan hệ giảm nhẹ nhưng ổn định được giữ vững.' },
    },
  },
};
