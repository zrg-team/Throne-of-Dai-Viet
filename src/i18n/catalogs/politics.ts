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
};
