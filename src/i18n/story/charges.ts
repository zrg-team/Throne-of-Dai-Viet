import type { StoryCatalog } from './types';

/**
 * Text for the eight charge-bearing histories.
 *
 * Written to the same four rules as the depth pass: every act is a scene, detail instead of
 * adjectives, characters speak, and no act closes clean. The charge lines carry a fifth: **the
 * tracker never reads as a task list.** "The shrine at {land} still stands unbuilt" is a state of
 * the world; "0/1 objectives" is a chore, and the moment the Chronicle sounds like one it has
 * become the thing `riverStakes.ts` refused to be.
 */

// ── Bình Ngô Đại Cáo · 1428 ─────────────────────────────────────────────────

export const daiCaoEn: StoryCatalog = {
  'the-scholar-asks-for-paper.chronicle': 'A scholar asked leave to write the country down.',
  'the-scholar-asks-for-paper.let-him-write.d': 'Only once, and only after it is true.',
  'the-scholar-asks-for-paper.not-yet.d': 'A boast now is a boast forever.',
  'the-proclamation-read-out.chronicle': 'The Great Proclamation was read at the gate.',
  'the-proclamation-read-out.ok': 'Let it be copied',
  'the-paper-goes-unused.chronicle': 'The paper stayed unmarked on his desk.',
  'the-paper-goes-unused.reconsider.d': 'He may still have the words.',
  'the-paper-goes-unused.dismiss-it.d': 'Some records are better unwritten.',
  title: 'The Great Proclamation',
  want: 'to write it down while it is still true',
  waiting: 'Waiting: for a victory worth announcing to the world.',
  stake: 'What the dynasty will be remembered as having been.',
  'regard.watching': 'He watches the wars and says nothing. He is deciding whether they add up to anything.',
  'regard.drafting': 'He writes at night now. He will not show anyone the drafts.',
  'regard.vindicated': 'He has stopped writing. He says the country wrote the rest of it itself.',

  'the-scholar-asks-for-paper.title': 'The scholar asks for paper',
  'the-scholar-asks-for-paper.body':
    'He has been in the record room for a season and a half, and he comes out holding nothing. "I want to write the country down," he says. "Not the battles — anyone can count battles. Why we fought them. What we say we are." He is asking for a great deal of paper, and for the right to say it in the throne\'s name. "But it can only be written once, and only after. If I write it now it is a boast. If I write it after we have broken a great host, held eight provinces, and there is a chancellor at this court worth the seal — then it is a record."',
  'the-scholar-asks-for-paper.let-him-write': 'Let him write it',
  'the-scholar-asks-for-paper.not-yet': 'Not yet. Come back when it is true',

  'charge.proclaim.sworn': 'The record room is given over to him. He is writing toward something that has not happened yet.',
  'charge.proclaim.watching': 'He is still writing. A great host unbroken, eight provinces unheld, or the chancellery empty.',
  'charge.proclaim.kept': 'He has finished. He asks when it may be read.',
  'charge.proclaim.broken': 'The paper goes back into the record room, unmarked.',

  'the-proclamation-read-out.title': 'Read out at the gate',
  'the-proclamation-read-out.body':
    'It is read at the gate, and then at the ferry crossing, and then by men who cannot read repeating it wrong to men who were not there. *Benevolence lies in bringing peace to the people.* Two of the envoys who came to threaten us last year stand at the back and do not interrupt. Whatever we were before this, we are now a country that has said what it is out loud, and the saying has done something the fighting could not.',

  'the-paper-goes-unused.title': 'The paper goes unused',
  'the-paper-goes-unused.body':
    'He has stopped asking. The record room still has his desk in it, and the desk still has the paper on it, squared off, unmarked. A clerk mentions that he has begun writing letters home instead.',
  'the-paper-goes-unused.reconsider': 'Tell him the throne is ready',
  'the-paper-goes-unused.dismiss-it': 'Let him write his letters',
};

export const daiCaoVi: StoryCatalog = {
  'the-scholar-asks-for-paper.chronicle': 'Một người học trò xin được chép nước Nam xuống.',
  'the-scholar-asks-for-paper.let-him-write.d': 'Chỉ một lần, và phải chép sau.',
  'the-scholar-asks-for-paper.not-yet.d': 'Khoe bây giờ thì khoe mãi mãi.',
  'the-proclamation-read-out.chronicle': 'Bình Ngô Đại Cáo tuyên ở cửa thành.',
  'the-proclamation-read-out.ok': 'Cho sao chép ra',
  'the-paper-goes-unused.chronicle': 'Xấp giấy nằm trắng trên bàn ông.',
  'the-paper-goes-unused.reconsider.d': 'Có lẽ chữ vẫn còn trong ông.',
  'the-paper-goes-unused.dismiss-it.d': 'Có những sử không chép còn hơn.',
  title: 'Bình Ngô Đại Cáo',
  want: 'chép lại, khi nó còn là sự thật',
  waiting: 'Đang chờ: một chiến thắng đáng để bố cáo với thiên hạ.',
  stake: 'Vương triều này rồi sẽ được nhớ là gì.',
  'regard.watching': 'Ông nhìn các cuộc chiến mà không nói gì. Ông đang cân xem chúng có cộng lại thành cái gì không.',
  'regard.drafting': 'Dạo này ông viết ban đêm. Bản thảo thì không cho ai xem.',
  'regard.vindicated': 'Ông thôi viết. Ông bảo phần còn lại đất nước tự chép lấy.',

  'the-scholar-asks-for-paper.title': 'Người học trò xin giấy',
  'the-scholar-asks-for-paper.body':
    'Ông ở trong tàng thư một mùa rưỡi, rồi bước ra tay không. "Thần muốn chép nước Nam xuống," ông nói. "Không phải các trận đánh — trận đánh thì ai đếm chẳng được. Mà là vì sao ta đánh. Ta tự nhận ta là gì." Ông xin rất nhiều giấy, và xin được nói nhân danh ngai vàng. "Nhưng chỉ chép được một lần, và phải chép sau. Chép bây giờ thì là khoe. Chép sau khi đã phá một đại quân, giữ được tám trấn, và trong triều có một vị Tể tướng xứng với ấn — thì mới là sử."',
  'the-scholar-asks-for-paper.let-him-write': 'Cho ông chép',
  'the-scholar-asks-for-paper.not-yet': 'Chưa. Chờ tới khi nó thành sự thật',

  'charge.proclaim.sworn': 'Tàng thư giao lại cho ông. Ông đang viết hướng tới một điều chưa xảy ra.',
  'charge.proclaim.watching': 'Ông vẫn đang viết. Đại quân chưa phá, tám trấn chưa đủ, hoặc ghế Tể tướng còn khuyết.',
  'charge.proclaim.kept': 'Ông đã viết xong. Ông hỏi khi nào thì được tuyên.',
  'charge.proclaim.broken': 'Xấp giấy trở lại tàng thư, còn trắng.',

  'the-proclamation-read-out.title': 'Tuyên ở cửa thành',
  'the-proclamation-read-out.body':
    'Bài cáo tuyên ở cửa thành, rồi ở bến đò, rồi tới lượt những người không biết chữ đọc sai cho những người không có mặt hôm ấy. *Việc nhân nghĩa cốt ở yên dân.* Hai viên sứ năm ngoái sang doạ ta đứng phía sau và không hề ngắt lời. Trước đó ta là gì cũng được, nhưng từ hôm nay ta là một nước đã nói thành lời mình là ai — và lời ấy làm được cái mà gươm giáo không làm nổi.',

  'the-paper-goes-unused.title': 'Giấy vẫn để trắng',
  'the-paper-goes-unused.body':
    'Ông thôi hỏi. Tàng thư vẫn còn cái bàn của ông, trên bàn vẫn còn xấp giấy, xếp vuông vắn, chưa một nét. Một viên thư lại nói dạo này ông chuyển sang viết thư về nhà.',
  'the-paper-goes-unused.reconsider': 'Báo ông rằng triều đình đã sẵn sàng',
  'the-paper-goes-unused.dismiss-it': 'Cứ để ông viết thư',
};

// ── Chiếu Dời Đô · 1010 ─────────────────────────────────────────────────────

export const chieuDoiDoEn: StoryCatalog = {
  'the-valley-is-too-narrow.chronicle': 'A geomancer named {land} as a better seat.',
  'the-valley-is-too-narrow.survey-the-plain.d': 'A market, a wall, and twelve seasons.',
  'the-valley-is-too-narrow.hoa-lu-served-our-fathers.d': 'Defensible. Also poor.',
  'the-dragon-rising.chronicle': 'The seat of the dynasty moved to {land}.',
  'the-dragon-rising.ok': 'Move the court',
  title: 'The Edict on Moving the Capital',
  want: 'a seat the country can grow out of',
  waiting: 'Waiting: for {land} to be worth calling a capital.',
  stake: 'Where the dynasty sits, and therefore what it can become.',
  'regard.surveying': 'The surveyors are at {land} again. They have started calling it by a different name.',

  'the-valley-is-too-narrow.title': 'The valley is too narrow',
  'the-valley-is-too-narrow.body':
    'The old geomancer will not sit down. "Look at where you are," he says. "Mountains on three sides. Your fathers chose this because it could be defended, and they were right, and they were poor. A place that cannot be attacked also cannot be traded with." He unrolls a map of {land} and taps the middle of it, hard enough that the paper dents. "Flat. Open. A river that goes somewhere. Build a market there and a wall around it, hold it a dozen seasons, and I will show you a capital instead of a hiding place."',
  'the-valley-is-too-narrow.survey-the-plain': 'Send the surveyors to {land}',
  'the-valley-is-too-narrow.hoa-lu-served-our-fathers': 'The old seat served our fathers',

  'charge.move.sworn': 'The surveyors go out to {land}. A market, a wall, and twelve seasons of holding it.',
  'charge.move.watching': '{land} is not yet a capital. It wants a market, a wall, and time.',
  'charge.move.kept': 'The court is told to pack. The seat of the dynasty moves to {land}.',
  'charge.move.broken': 'The surveyors come home. The maps go into a chest.',

  'the-dragon-rising.title': 'The dragon rising',
  'the-dragon-rising.body':
    'They move the court in the ninth month, in carts, badly. Halfway through the crossing the old geomancer points at the water and says he has seen a dragon come up out of it, and nobody else sees anything, and the name sticks anyway — the ascending dragon. Thăng Long. Within two seasons there are boats at the quay from three rivers and a market street that did not exist. The valley we left is still there. It is a good place to be from.',
};

export const chieuDoiDoVi: StoryCatalog = {
  'the-valley-is-too-narrow.chronicle': 'Thầy địa lý chỉ {land} là chỗ đóng đô tốt hơn.',
  'the-valley-is-too-narrow.survey-the-plain.d': 'Một cái chợ, một bức thành, mười hai mùa.',
  'the-valley-is-too-narrow.hoa-lu-served-our-fathers.d': 'Giữ thì dễ. Mà nghèo.',
  'the-dragon-rising.chronicle': 'Kinh đô dời về {land}.',
  'the-dragon-rising.ok': 'Dời triều đình',
  title: 'Chiếu Dời Đô',
  want: 'một kinh đô mà nước có thể lớn lên khỏi nó',
  waiting: 'Đang chờ: {land} đủ tầm để gọi là kinh đô.',
  stake: 'Vương triều ngồi ở đâu, và vì thế có thể trở thành cái gì.',
  'regard.surveying': 'Đám thợ đạc lại ra {land}. Họ đã bắt đầu gọi nơi ấy bằng một cái tên khác.',

  'the-valley-is-too-narrow.title': 'Thung lũng này chật quá',
  'the-valley-is-too-narrow.body':
    'Ông thầy địa lý già không chịu ngồi. "Bệ hạ nhìn chỗ mình đang đứng đi," ông nói. "Núi ba mặt. Tiên đế chọn đây vì giữ được, và tiên đế đúng, và tiên đế nghèo. Chỗ nào không ai đánh vào được thì cũng không ai buôn bán vào được." Ông trải bản đồ {land} ra, gõ vào giữa mạnh đến lõm cả giấy. "Bằng phẳng. Rộng mở. Có con sông chảy đi đâu đó. Dựng ở đấy cái chợ, quây quanh nó bức thành, giữ được mươi hai mùa — rồi thần chỉ cho bệ hạ một kinh đô, thay vì một chỗ trốn."',
  'the-valley-is-too-narrow.survey-the-plain': 'Sai thợ đạc ra {land}',
  'the-valley-is-too-narrow.hoa-lu-served-our-fathers': 'Đất cũ đã đủ cho tiên đế',

  'charge.move.sworn': 'Thợ đạc kéo ra {land}. Một cái chợ, một bức thành, và mười hai mùa giữ cho vững.',
  'charge.move.watching': '{land} chưa phải kinh đô. Nó còn thiếu chợ, thiếu thành, và thiếu thời gian.',
  'charge.move.kept': 'Truyền cho triều đình thu xếp. Kinh đô dời về {land}.',
  'charge.move.broken': 'Thợ đạc về. Bản đồ cất vào rương.',

  'the-dragon-rising.title': 'Rồng bay lên',
  'the-dragon-rising.body':
    'Triều đình dời vào tháng chín, bằng xe, lộn xộn. Đang giữa dòng thì ông thầy địa lý chỉ xuống nước, bảo vừa thấy một con rồng bay lên, mà chẳng ai khác thấy gì cả — thế mà cái tên cứ ở lại. Rồng bay lên. Thăng Long. Chưa đầy hai mùa, bến đã có thuyền từ ba con sông về, và mọc ra một phố chợ trước đó không có. Thung lũng cũ vẫn còn đó. Nó là một nơi tốt để mà xuất thân.',
};

// ── Nam Quốc Sơn Hà · 1077 ──────────────────────────────────────────────────

export const namQuocEn: StoryCatalog = {
  'a-voice-from-the-shrine.chronicle': 'An old man at {land} asked for somewhere to stand.',
  'a-voice-from-the-shrine.raise-the-shrine.d': 'On the bank, where the water carries.',
  'a-voice-from-the-shrine.the-river-is-only-a-river.d': 'Four lines win nothing.',
  'the-southern-land-has-its-own-emperor.chronicle': 'Four lines were read across the water at {land}.',
  'the-southern-land-has-its-own-emperor.ok': 'Let it be read again',
  'the-shrine-burns.chronicle': 'The shrine at {land} was burned.',
  'the-shrine-burns.ok': 'Note it',
  title: 'The Mountains and Rivers of the Southern Land',
  want: 'to be heard across the water',
  waiting: 'Waiting: for a shrine on the bank at {land}, and for someone to come.',
  stake: '{land}, and what an army believes when it hears its own defeat read aloud.',
  'regard.listening': 'The shrine is up. The old man sleeps in it now, and will not say why.',

  'a-voice-from-the-shrine.title': 'A voice from the bank',
  'a-voice-from-the-shrine.body':
    'There is an old man at the ferry crossing at {land} who has been telling anyone who stops that he can win a battle with four lines. The soldiers find it funny. He is not joking. "Build me somewhere to stand," he says, "on the bank, where the water carries. Not for the gods. For the men on the other side. An army that has come a long way in the dark, that does not know the country — you do not need to beat all of it. You need the front rank to hear something in a language they half understand and decide it was meant for them."',
  'a-voice-from-the-shrine.raise-the-shrine': 'Raise it on the bank at {land}',
  'a-voice-from-the-shrine.the-river-is-only-a-river': 'The river is only a river',

  'charge.shrine.sworn': 'They begin cutting timber on the bank at {land}. He has not written the lines down yet.',
  'charge.shrine.watching': 'The bank at {land} is still bare, or not yet ours long enough to matter.',
  'charge.shrine.kept': 'The shrine stands at {land}. The old man has moved into it.',
  'charge.shrine.broken': 'They took the bank at {land} before the timber was cut.',

  'the-southern-land-has-its-own-emperor.title': 'Read out in the dark',
  'the-southern-land-has-its-own-emperor.body':
    'It is read three times in the night, across water, by a voice nobody on the far bank can place. *The mountains and rivers of the Southern land are the Southern emperor\'s.* The men who came a long way in the dark hear four lines about a border settled in heaven and a fate for those who cross it, and by the third reading a good number of them have decided it was addressed to them personally. They are still an army in the morning. They are not the same army.',

  'the-shrine-burns.title': 'The shrine burns',
  'the-shrine-burns.body':
    'They came up the river faster than anyone expected and they went for the bank first, because a thing built where everyone can see it is a thing worth taking down where everyone can see it. The old man was not in it. Nobody has seen him since, which the soldiers have decided to find encouraging.',
};

export const namQuocVi: StoryCatalog = {
  'a-voice-from-the-shrine.chronicle': 'Ông lão ở {land} xin một chỗ đứng.',
  'a-voice-from-the-shrine.raise-the-shrine.d': 'Trên bờ, chỗ nước đưa tiếng đi.',
  'a-voice-from-the-shrine.the-river-is-only-a-river.d': 'Bốn câu thì thắng được gì.',
  'the-southern-land-has-its-own-emperor.chronicle': 'Bốn câu vọng qua sông ở {land}.',
  'the-southern-land-has-its-own-emperor.ok': 'Cho đọc lại',
  'the-shrine-burns.chronicle': 'Miếu ở {land} bị đốt.',
  'the-shrine-burns.ok': 'Ghi lại',
  title: 'Nam Quốc Sơn Hà',
  want: 'được nghe thấy từ bên kia sông',
  waiting: 'Đang chờ: một cái miếu trên bờ {land}, và một kẻ nào đó kéo tới.',
  stake: '{land}, và điều một đạo quân tin khi nghe chính thất bại của mình đọc lên.',
  'regard.listening': 'Miếu dựng xong. Ông lão giờ ngủ luôn trong đó, hỏi cũng không nói vì sao.',

  'a-voice-from-the-shrine.title': 'Một giọng nói từ bờ sông',
  'a-voice-from-the-shrine.body':
    'Ở bến đò {land} có một ông lão, ai dừng chân ông cũng bảo rằng ông thắng được một trận bằng bốn câu. Lính nghe thì cười. Ông không đùa. "Dựng cho lão một chỗ đứng," ông nói, "trên bờ, chỗ nước đưa tiếng đi. Không phải để thờ thần. Là để cho người bên kia. Một đạo quân đi xa trong đêm, không thuộc đất — không cần đánh cả đạo. Chỉ cần hàng đầu nghe được mấy tiếng trong một thứ tiếng họ hiểu lõm bõm, rồi tự quyết rằng câu ấy nói về mình."',
  'a-voice-from-the-shrine.raise-the-shrine': 'Dựng miếu trên bờ {land}',
  'a-voice-from-the-shrine.the-river-is-only-a-river': 'Sông thì cũng chỉ là sông',

  'charge.shrine.sworn': 'Người ta bắt đầu đốn gỗ trên bờ {land}. Ông lão vẫn chưa chép bốn câu ấy ra.',
  'charge.shrine.watching': 'Bờ {land} vẫn còn trống, hoặc chưa thuộc về ta đủ lâu để thành chuyện.',
  'charge.shrine.kept': 'Miếu đã đứng ở {land}. Ông lão dọn vào ở trong đó.',
  'charge.shrine.broken': 'Chúng chiếm mất bờ {land} trước khi gỗ kịp hạ.',

  'the-southern-land-has-its-own-emperor.title': 'Đọc lên trong đêm',
  'the-southern-land-has-its-own-emperor.body':
    'Bài ấy đọc ba lượt trong đêm, vọng qua mặt nước, bằng một giọng mà cả bờ bên kia không ai đoán được là ai. *Nam quốc sơn hà Nam đế cư.* Những kẻ đi xa trong đêm nghe bốn câu nói về một cõi bờ đã định ở sách trời và một số phận dành cho kẻ vượt qua — tới lượt đọc thứ ba thì kha khá trong số họ đã tự nhận rằng câu ấy nói riêng với mình. Sáng ra họ vẫn là một đạo quân. Nhưng không còn là đạo quân cũ.',

  'the-shrine-burns.title': 'Miếu cháy',
  'the-shrine-burns.body':
    'Chúng ngược sông nhanh hơn mọi dự liệu, và nhằm vào bờ trước tiên — vì cái gì dựng lên chỗ ai cũng thấy thì cũng đáng bị hạ xuống chỗ ai cũng thấy. Ông lão không có trong đó. Từ bấy không ai gặp lại ông, và đám lính đã quyết định coi đó là điềm lành.',
};

// ── Hịch Tướng Sĩ · ~1284 ───────────────────────────────────────────────────

export const hichEn: StoryCatalog = {
  'he-reads-it-to-the-officers.chronicle': 'A marshal wrote to his officers, and did not raise his voice.',
  'he-reads-it-to-the-officers.let-them-hear-it.d': 'Three hosts, three commanders.',
  'he-reads-it-to-the-officers.the-men-are-tired.d': 'Shame keeps. So does the sword.',
  'three-hosts-under-three-banners.chronicle': 'The proclamation was read to three hosts in one morning.',
  'three-hosts-under-three-banners.ok': 'Give him the hardest ground',
  'the-officers-look-at-their-boots.chronicle': 'The proclamation was never assembled for.',
  'the-officers-look-at-their-boots.ok': 'Say nothing',
  title: 'Proclamation to the Officers',
  want: 'officers who are ashamed of the right things',
  waiting: 'Waiting: for three hosts in the field, each with a man at its head.',
  stake: 'Whether the army is an army or a list of names.',
  'regard.expectant': 'He has read it once and will not read it again until there is someone to read it to.',

  'he-reads-it-to-the-officers.title': 'He reads it to the officers',
  'he-reads-it-to-the-officers.body':
    'He does not raise his voice, which is worse. He tells them he has forgotten to eat, that he sleeps badly, that he would give his body to the field a hundred times over if it bought anything — and then, in exactly the same tone, he lists what they have been doing instead. Cockfights. A good sword sold for a horse nobody rides. One of them looks at the floor. "This is not for reading," he says afterward. "It is for three hosts standing where I can see them, each with a man at its head who has heard it. Give me that and I will finish it."',
  'he-reads-it-to-the-officers.let-them-hear-it': 'Let the officers hear it',
  'he-reads-it-to-the-officers.the-men-are-tired': 'The men are tired. Let it wait',

  'charge.muster.sworn': 'He has stopped writing and started counting banners. Three hosts, each with a commander.',
  'charge.muster.watching': 'He is still counting. There are not yet three hosts with three commanders.',
  'charge.muster.kept': 'Three banners in the field, and a man under each of them who has heard it.',
  'charge.muster.broken': 'He puts it away. The officers were never assembled.',

  'three-hosts-under-three-banners.title': 'Three banners',
  'three-hosts-under-three-banners.body':
    'It is read to all three hosts on the same morning, badly, by three different men — one of whom loses his place twice. It does not matter. By the second reading the ranks have stopped shuffling, and by the end of the third a young officer nobody had marked has walked forward to ask, in front of everyone, for the hardest ground on the line. He gets it.',

  'the-officers-look-at-their-boots.title': 'The officers look at their boots',
  'the-officers-look-at-their-boots.body':
    'The assembly never happened. Word of what was written got out anyway — the good lines always do — and what reached the ranks was the half about cockfights, without the half about what he would give. Officers who were not being accused have spent a season being talked about as though they were.',
};

export const hichVi: StoryCatalog = {
  'he-reads-it-to-the-officers.chronicle': 'Quan Thái uý viết hịch cho các tướng, mà không hề cao giọng.',
  'he-reads-it-to-the-officers.let-them-hear-it.d': 'Ba đạo quân, ba chủ tướng.',
  'he-reads-it-to-the-officers.the-men-are-tired.d': 'Nỗi hổ thẹn để dành được. Gươm cũng vậy.',
  'three-hosts-under-three-banners.chronicle': 'Bài hịch đọc cho ba đạo quân trong một buổi sáng.',
  'three-hosts-under-three-banners.ok': 'Giao cho anh ta khúc khó nhất',
  'the-officers-look-at-their-boots.chronicle': 'Rốt cuộc chẳng có buổi tụ nào để đọc hịch.',
  'the-officers-look-at-their-boots.ok': 'Không nói gì',
  title: 'Hịch Tướng Sĩ',
  want: 'những viên tướng biết xấu hổ đúng chỗ',
  waiting: 'Đang chờ: ba đạo quân ngoài trận, mỗi đạo có một người cầm đầu.',
  stake: 'Quân đội này là quân đội, hay chỉ là một danh sách tên.',
  'regard.expectant': 'Ông đọc một lượt rồi thôi, và sẽ không đọc lại cho tới khi có người xứng để nghe.',

  'he-reads-it-to-the-officers.title': 'Ông đọc cho các tướng nghe',
  'he-reads-it-to-the-officers.body':
    'Ông không cao giọng, mà thế lại nặng hơn. Ông bảo có bữa quên cả ăn, đêm nằm không ngủ được, rằng thân này phơi ngoài nội cỏ trăm lần cũng cam — rồi vẫn đúng giọng ấy, ông kể ra những việc họ đang làm thay vào đó. Chọi gà. Một thanh gươm tốt đem đổi lấy con ngựa chẳng ai cưỡi. Một người cúi nhìn xuống nền. "Bài này không phải để đọc," sau đó ông nói. "Là để cho ba đạo quân đứng chỗ thần trông thấy được, mỗi đạo một người cầm đầu đã nghe qua nó. Cho thần chừng ấy, thần viết nốt."',
  'he-reads-it-to-the-officers.let-them-hear-it': 'Cho các tướng nghe',
  'he-reads-it-to-the-officers.the-men-are-tired': 'Quân đang mỏi. Để thong thả',

  'charge.muster.sworn': 'Ông thôi viết, quay ra đếm cờ. Ba đạo quân, mỗi đạo một chủ tướng.',
  'charge.muster.watching': 'Ông vẫn đang đếm. Chưa đủ ba đạo quân với ba chủ tướng.',
  'charge.muster.kept': 'Ba lá cờ ngoài trận, dưới mỗi lá là một người đã nghe qua bài hịch.',
  'charge.muster.broken': 'Ông cất bài hịch đi. Các tướng rốt cuộc chẳng bao giờ tụ về.',

  'three-hosts-under-three-banners.title': 'Ba lá cờ',
  'three-hosts-under-three-banners.body':
    'Bài hịch đọc cho cả ba đạo trong cùng một buổi sáng, đọc vụng, do ba người khác nhau — một người lạc dòng tới hai lần. Không sao cả. Tới lượt thứ hai thì hàng quân đã thôi cựa quậy, và hết lượt thứ ba thì một viên tướng trẻ chẳng ai để ý bước lên, xin ngay trước mặt mọi người được giữ khúc khó nhất của phòng tuyến. Người ta cho anh ta khúc ấy.',

  'the-officers-look-at-their-boots.title': 'Các tướng cúi nhìn mũi giày',
  'the-officers-look-at-their-boots.body':
    'Buổi tụ ấy rốt cuộc không có. Nhưng nội dung bài hịch vẫn lọt ra ngoài — câu hay thì bao giờ cũng lọt — và cái đến tai quân sĩ là nửa nói về chọi gà, thiếu mất nửa nói về điều ông sẵn lòng đánh đổi. Những viên tướng không hề bị nhắc tên đã phải chịu suốt một mùa bị bàn tán như thể có.',
};

// ── Ải Chi Lăng · 1427 ──────────────────────────────────────────────────────

export const chiLangEn: StoryCatalog = {
  'the-pass-is-narrow-here.chronicle': 'A captain proposed losing a battle badly at {land}.',
  'the-pass-is-narrow-here.let-them-come-in.d': 'Look thin. Let the front get all the way in.',
  'the-pass-is-narrow-here.meet-them-on-the-plain.d': 'Where we can see them coming.',
  'lieu-thang-does-not-come-out.chronicle': 'A relief column was destroyed in the pass at {land}.',
  'lieu-thang-does-not-come-out.ok': 'Close the road behind them',
  title: 'The Chi Lăng Pass',
  want: 'to be underestimated once, at the right place',
  waiting: 'Waiting: to hold {land}, and for a great host to take the road.',
  stake: '{land}, and a relief column that thinks it is late.',
  'regard.waiting-in-the-pass': 'The scouts have stopped reporting. That is the arrangement.',

  'the-pass-is-narrow-here.title': 'The pass is narrow here',
  'the-pass-is-narrow-here.body':
    'The captain who grew up at {land} walks it with you and keeps stopping. "Here the road is two carts wide. Here it bends and you cannot see the bend until you are in it. Here the ground goes up on both sides and a man on the top has all day." He is describing somewhere to lose a battle badly, and he is grinning. "A relief column is always in a hurry — it is going somewhere else, that is the whole nature of it. So we hold the pass, we look thin, and we let the front of it get all the way in before anyone at the back knows anything is wrong."',
  'the-pass-is-narrow-here.let-them-come-in': 'Hold {land} and let them come in',
  'the-pass-is-narrow-here.meet-them-on-the-plain': 'Meet them on the plain instead',

  'charge.ambush.sworn': 'The pass at {land} is held thin, on purpose. Now it needs someone to walk into it.',
  'charge.ambush.watching': 'Still holding {land}. No great host has taken the road yet.',
  'charge.ambush.kept': 'A column is in the pass at {land}, and the road behind it is closed.',
  'charge.ambush.broken': 'The pass at {land} is lost. Nobody had to walk into anything.',

  'lieu-thang-does-not-come-out.title': 'The column does not come out',
  'lieu-thang-does-not-come-out.body':
    'They come through fast because they are late, and the front third is past the bend before the noise starts behind them. Their commander is killed early — not by anyone who knew who he was, which the captain from {land} finds very funny for weeks afterward. The siege he was riding to relieve hears about it four days later and gives up without being attacked at all. That is the part that matters. That is always the part that matters.',
};

export const chiLangVi: StoryCatalog = {
  'the-pass-is-narrow-here.chronicle': 'Một viên đội trưởng bày cách thua cho thảm ở {land}.',
  'the-pass-is-narrow-here.let-them-come-in.d': 'Để lộ ra mỏng. Cho khúc đầu vào thật sâu.',
  'the-pass-is-narrow-here.meet-them-on-the-plain.d': 'Chỗ ta còn trông thấy chúng tới.',
  'lieu-thang-does-not-come-out.chronicle': 'Một đạo viện binh bị diệt trong ải {land}.',
  'lieu-thang-does-not-come-out.ok': 'Khép đường sau lưng chúng',
  title: 'Ải Chi Lăng',
  want: 'được coi thường một lần, đúng chỗ',
  waiting: 'Đang chờ: giữ được {land}, và một đại quân chịu đi vào đường ấy.',
  stake: '{land}, và một đạo viện binh đang sốt ruột vì tới muộn.',
  'regard.waiting-in-the-pass': 'Thám mã thôi báo về. Đó là giao hẹn.',

  'the-pass-is-narrow-here.title': 'Ải đây hẹp lắm',
  'the-pass-is-narrow-here.body':
    'Viên đội trưởng lớn lên ở {land} dẫn ngài đi dọc ải, cứ đi vài bước lại dừng. "Chỗ này đường rộng vừa hai cỗ xe. Chỗ này đường quặt, mà chưa vào tới thì chưa thấy khúc quặt. Chỗ này hai bên đất dựng lên, người đứng trên có cả ngày mà bắn." Anh ta đang tả một nơi để thua trận cho thảm, mà lại tả với vẻ khoái trá. "Viện binh thì bao giờ cũng vội — bản chất của nó là đang đi tới chỗ khác. Nên ta giữ ải, ta để lộ ra mỏng, và ta cho khúc đầu vào thật sâu trước khi khúc đuôi kịp biết có chuyện."',
  'the-pass-is-narrow-here.let-them-come-in': 'Giữ {land} và để chúng vào',
  'the-pass-is-narrow-here.meet-them-on-the-plain': 'Ra đồng bằng nghênh chiến',

  'charge.ambush.sworn': 'Ải {land} cố ý giữ mỏng. Giờ chỉ còn thiếu kẻ chịu bước vào.',
  'charge.ambush.watching': 'Vẫn đang giữ {land}. Chưa đại quân nào chịu đi đường ấy.',
  'charge.ambush.kept': 'Một đạo quân đã vào trong ải {land}, và đường sau lưng chúng khép lại.',
  'charge.ambush.broken': 'Mất ải {land}. Rốt cuộc chẳng ai phải bước vào đâu cả.',

  'lieu-thang-does-not-come-out.title': 'Đạo quân ấy không ra được',
  'lieu-thang-does-not-come-out.body':
    'Chúng qua ải rất nhanh vì đang trễ, và một phần ba khúc đầu đã lọt qua khúc quặt trước khi phía sau nổi tiếng động. Chủ tướng của chúng chết sớm — chết bởi một người chẳng biết hắn là ai, mà chuyện ấy viên đội trưởng người {land} còn thấy buồn cười suốt mấy tuần sau. Bốn ngày sau, đám đang vây thành mà hắn định tới cứu nghe tin, rồi tự rút, không ai đánh một trận nào. Đó mới là phần đáng kể. Bao giờ cũng vậy.',
};

// ── Thần Tốc · 1789 ─────────────────────────────────────────────────────────

export const thanTocEn: StoryCatalog = {
  'we-eat-tet-in-the-capital.chronicle': 'A feast was promised in a city we did not hold.',
  'we-eat-tet-in-the-capital.promise-the-feast.d': 'Three men to a hammock. Rotate on the walk.',
  'we-eat-tet-in-the-capital.no-army-moves-that-fast.d': 'And no feast survives a broken promise.',
  'the-thirtieth-day-of-the-twelfth-month.chronicle': 'They arrived on the day he named, four days early.',
  'the-thirtieth-day-of-the-twelfth-month.ok': 'Let them sit down',
  'the-feast-is-eaten-cold.chronicle': 'The year turned with the column still on the road.',
  'the-feast-is-eaten-cold.ok': 'Say nothing about it',
  title: 'The Lightning March',
  want: 'to arrive before anyone has finished celebrating',
  waiting: 'Waiting: six provinces and a host of nine hundred, quickly.',
  stake: 'Whether an army can be somewhere it cannot possibly be.',
  'regard.marching': 'They march in threes now, one carried while two walk. Nobody has slept properly in a week.',

  'we-eat-tet-in-the-capital.title': 'We will eat Tết in the capital',
  'we-eat-tet-in-the-capital.body':
    'He announces the feast before he announces the march, which everyone later agrees was the clever part. "Not the seventh day," he says. "The thirtieth of the twelfth month. They will be drinking. Their generals will be writing letters home about how quiet it is here." Somebody points out that nothing moves that fast. He has already thought about it: three men to a hammock, two carrying, one sleeping, rotate on the walk. "The march is the weapon. The battle is only where the march stops."',
  'we-eat-tet-in-the-capital.promise-the-feast': 'Promise them the feast',
  'we-eat-tet-in-the-capital.no-army-moves-that-fast': 'No army moves that fast',

  'charge.march.sworn': 'The hammocks are cut and the feast is promised. Six provinces, nine hundred men, and no time at all.',
  'charge.march.watching': 'Still short. Six provinces and a host of nine hundred, before the year turns.',
  'charge.march.kept': 'They are where they said they would be, on the day they said it.',
  'charge.march.broken': 'The year turned. They were not there.',

  'the-thirtieth-day-of-the-twelfth-month.title': 'The thirtieth day',
  'the-thirtieth-day-of-the-twelfth-month.body':
    'They arrive filthy, four days early, and are made to wait in a wood so as not to spoil it. The feast is eaten where he said it would be eaten, on the day he named, by men who have not properly stopped walking since the eleventh month. Two of them fall asleep sitting up with food in their hands. Nobody in the country will believe the distance for a hundred years, and the men who walked it will spend the rest of their lives being asked to repeat it and being disbelieved.',

  'the-feast-is-eaten-cold.title': 'Eaten cold',
  'the-feast-is-eaten-cold.body':
    'The year turns with the column still on the road. The feast is eaten cold, in the wrong place, out of packs that were meant to be empty by now — and they are empty afterward, which is its own problem for the seasons that follow. He does not make a speech about it. That is somehow worse than if he had.',
};

export const thanTocVi: StoryCatalog = {
  'we-eat-tet-in-the-capital.chronicle': 'Một bữa tiệc được hứa ở toà thành ta chưa hề giữ.',
  'we-eat-tet-in-the-capital.promise-the-feast.d': 'Ba người một võng. Đổi phiên ngay trên đường.',
  'we-eat-tet-in-the-capital.no-army-moves-that-fast.d': 'Mà lời hứa gãy thì tiệc cũng chẳng còn.',
  'the-thirtieth-day-of-the-twelfth-month.chronicle': 'Họ tới đúng ngày ông hẹn, sớm bốn ngày.',
  'the-thirtieth-day-of-the-twelfth-month.ok': 'Cho họ ngồi xuống',
  'the-feast-is-eaten-cold.chronicle': 'Năm sang khi đạo quân vẫn còn trên đường.',
  'the-feast-is-eaten-cold.ok': 'Không nhắc tới nữa',
  title: 'Thần Tốc',
  want: 'tới nơi trước khi người ta ăn mừng xong',
  waiting: 'Đang chờ: sáu trấn và một đạo chín trăm quân, thật nhanh.',
  stake: 'Một đạo quân có thể có mặt ở nơi nó không thể nào có mặt hay không.',
  'regard.marching': 'Giờ họ đi theo bộ ba, hai khiêng một nằm. Cả tuần nay chẳng ai ngủ ra hồn.',

  'we-eat-tet-in-the-capital.title': 'Ăn Tết ở kinh đô',
  'we-eat-tet-in-the-capital.body':
    'Ông tuyên bố bữa tiệc trước khi tuyên bố cuộc hành quân, mà về sau ai cũng công nhận đó mới là chỗ cao tay. "Không phải mùng bảy," ông nói. "Ba mươi tháng chạp. Giờ ấy chúng đang uống. Tướng của chúng đang viết thư về nhà kể rằng bên này yên ắng lắm." Có người thưa rằng không quân nào đi nhanh được như thế. Ông đã tính rồi: ba người một võng, hai khiêng một ngủ, đổi phiên ngay trên đường. "Cuộc hành quân mới là vũ khí. Trận đánh chỉ là chỗ cuộc hành quân dừng lại."',
  'we-eat-tet-in-the-capital.promise-the-feast': 'Hứa với họ bữa tiệc ấy',
  'we-eat-tet-in-the-capital.no-army-moves-that-fast': 'Không quân nào đi nhanh vậy được',

  'charge.march.sworn': 'Võng đã cắt, tiệc đã hứa. Sáu trấn, chín trăm quân, và không còn chút thì giờ nào.',
  'charge.march.watching': 'Vẫn còn thiếu. Sáu trấn và một đạo chín trăm quân, trước khi sang năm.',
  'charge.march.kept': 'Họ có mặt đúng chỗ đã nói, đúng ngày đã hẹn.',
  'charge.march.broken': 'Năm đã sang. Họ chưa tới.',

  'the-thirtieth-day-of-the-twelfth-month.title': 'Ngày ba mươi',
  'the-thirtieth-day-of-the-twelfth-month.body':
    'Họ tới nơi lấm lem, sớm bốn ngày, và bị giữ lại trong rừng để khỏi hỏng chuyện. Bữa tiệc ăn đúng chỗ ông đã nói, đúng ngày ông đã hẹn, bởi những người từ tháng một tới giờ chưa thật sự dừng chân. Hai người ngủ gục ngay khi đang ngồi, tay còn cầm miếng ăn. Cả nước sẽ không tin nổi quãng đường ấy trong trăm năm nữa, và những người đã đi hết quãng đường đó sẽ suốt đời bị bắt kể lại, rồi bị nghi là bịa.',

  'the-feast-is-eaten-cold.title': 'Tiệc ăn nguội',
  'the-feast-is-eaten-cold.body':
    'Năm sang khi đạo quân vẫn còn trên đường. Bữa tiệc ăn nguội, sai chỗ, moi ra từ những cái đãy lẽ ra giờ này đã rỗng — và sau đó thì chúng rỗng thật, điều ấy thành chuyện riêng của mấy mùa kế tiếp. Ông không diễn thuyết gì về việc đó. Không hiểu sao thế lại nặng hơn là có.',
};

// ── Tiên Phát Chế Nhân · 1075 ───────────────────────────────────────────────

export const tienPhatEn: StoryCatalog = {
  'they-are-stacking-grain-at-the-border.chronicle': 'Three depots rose across the border in one season.',
  'they-are-stacking-grain-at-the-border.burn-the-depots.d': 'Be the aggressor. Choose the year.',
  'they-are-stacking-grain-at-the-border.wait-for-them.d': 'Be the battlefield. Keep the name.',
  'the-depots-burn.chronicle': 'The depots of {kingdom} burned for eleven days.',
  'the-depots-burn.ok': 'Recall the columns',
  'we-made-an-enemy-and-nothing-else.chronicle': 'The border was crossed and the depots still stand.',
  'we-made-an-enemy-and-nothing-else.ok': 'Double the border garrisons',
  title: 'Strike First',
  want: 'to choose the year the war happens',
  waiting: 'Waiting: for {kingdom} to be cold enough, and beaten twice.',
  stake: 'Whether the war is fought on their ground or ours.',
  'regard.sharpening': 'The maps of the border have stopped being maps of our side of it.',

  'they-are-stacking-grain-at-the-border.title': 'They are stacking grain at the border',
  'they-are-stacking-grain-at-the-border.body':
    'The merchant is nervous, and not about the price. "Three depots in a season," he says. "Grain, and then arrowshafts, and then more grain than any garrison eats. They are not defending anything — you do not stack a year of food behind a wall you intend to stand on." The marshal has been quiet through all of it. When he speaks he does not argue the point: "Then the only question left is whose fields it burns in. If we go first we are the aggressor and every court in the world will say so. If we wait we are the battlefield."',
  'they-are-stacking-grain-at-the-border.burn-the-depots': 'Cross the border and burn the depots',
  'they-are-stacking-grain-at-the-border.wait-for-them': 'Wait. Let them be the aggressor',

  'charge.strike.sworn': 'The border is crossed. {kingdom} will not forgive it, and the depots are not burned yet.',
  'charge.strike.watching': 'Not finished. {kingdom} is not cold enough, or has not been beaten twice.',
  'charge.strike.kept': 'The depots burn. It was the right year to have chosen.',
  'charge.strike.broken': 'The campaign ends where it started, with a border crossed and nothing to show.',

  'the-depots-burn.title': 'The depots burn',
  'the-depots-burn.body':
    'It takes eleven days and the smoke is visible from our own bank, which the men treat as a festival. What was in those depots was a war — the whole of it, stacked and counted and waiting for a spring that will now not come. The court of {kingdom} says a great many things about treachery, all of them true, none of them worth a season of grain.',

  'we-made-an-enemy-and-nothing-else.title': 'We made an enemy and nothing else',
  'we-made-an-enemy-and-nothing-else.body':
    'The depots are still there. So is everything that was in them, and now so is a reason. The marshal does not say he told us; he was, after all, the one who crossed. He simply asks for the border garrisons to be doubled, and does not explain what he expects to arrive.',
};

export const tienPhatVi: StoryCatalog = {
  'they-are-stacking-grain-at-the-border.chronicle': 'Một mùa mà bên kia biên dựng ba cái kho.',
  'they-are-stacking-grain-at-the-border.burn-the-depots.d': 'Mang tiếng gây sự. Nhưng chọn được năm.',
  'they-are-stacking-grain-at-the-border.wait-for-them.d': 'Giữ được tiếng. Nhưng thành bãi chiến trường.',
  'the-depots-burn.chronicle': 'Kho lương của {kingdom} cháy mười một ngày.',
  'the-depots-burn.ok': 'Thu quân về',
  'we-made-an-enemy-and-nothing-else.chronicle': 'Đã vượt biên mà các kho vẫn còn nguyên.',
  'we-made-an-enemy-and-nothing-else.ok': 'Tăng gấp đôi quân đồn biên',
  title: 'Tiên Phát Chế Nhân',
  want: 'tự chọn lấy cái năm mà chiến tranh xảy ra',
  waiting: 'Đang chờ: {kingdom} đủ lạnh nhạt, và bị đánh bại hai lần.',
  stake: 'Cuộc chiến này đánh trên đất chúng, hay trên đất ta.',
  'regard.sharpening': 'Bản đồ biên giới thôi không còn là bản đồ phía bên ta nữa.',

  'they-are-stacking-grain-at-the-border.title': 'Chúng đang chất lương ngoài biên',
  'they-are-stacking-grain-at-the-border.body':
    'Người lái buôn có vẻ sợ, mà không phải sợ về giá. "Một mùa dựng ba kho," ông ta nói. "Lương, rồi cán tên, rồi lương nhiều hơn bất cứ đồn nào ăn hết. Chúng không phòng thủ gì cả — không ai chất lương cả năm sau một bức tường mà mình định đứng lại giữ." Quan Thái uý im lặng suốt buổi. Đến khi lên tiếng, ông không cãi lời nào: "Vậy chỉ còn một câu hỏi: nó cháy trên ruộng của ai. Ta đi trước thì ta là kẻ gây sự, và cả thiên hạ sẽ nói đúng như thế. Ta chờ thì ta là bãi chiến trường."',
  'they-are-stacking-grain-at-the-border.burn-the-depots': 'Vượt biên, đốt sạch các kho',
  'they-are-stacking-grain-at-the-border.wait-for-them': 'Chờ. Để chúng mang tiếng gây sự',

  'charge.strike.sworn': 'Biên giới đã vượt. {kingdom} sẽ không bỏ qua, mà kho thì chưa cháy.',
  'charge.strike.watching': 'Chưa xong. {kingdom} chưa đủ lạnh nhạt, hoặc chưa bại đủ hai lần.',
  'charge.strike.kept': 'Các kho cháy. Quả là đã chọn đúng năm.',
  'charge.strike.broken': 'Cuộc chinh phạt kết thúc ngay chỗ nó bắt đầu: một biên giới đã vượt, và không được gì.',

  'the-depots-burn.title': 'Các kho cháy',
  'the-depots-burn.body':
    'Mất mười một ngày, khói bên ta cũng trông thấy, và quân sĩ coi đó như một ngày hội. Trong mấy cái kho ấy là cả một cuộc chiến tranh — trọn vẹn, chất đống, đếm đủ, chờ một mùa xuân mà bây giờ sẽ không tới nữa. Triều đình {kingdom} nói rất nhiều về chuyện bội tín, lời nào cũng đúng cả, mà chẳng lời nào đáng bằng một mùa lương.',

  'we-made-an-enemy-and-nothing-else.title': 'Ta chỉ chuốc thêm một kẻ thù',
  'we-made-an-enemy-and-nothing-else.body':
    'Kho vẫn còn đó. Mọi thứ trong kho cũng còn đó, và bây giờ thì có thêm một cái cớ. Quan Thái uý không nói "thần đã bảo rồi"; dù sao chính ông là người đã vượt biên. Ông chỉ xin tăng gấp đôi quân đồn biên giới, và không giải thích ông đang đợi cái gì tới.',
};

// ── Hai Bà Trưng · 40 AD ────────────────────────────────────────────────────

export const haiBaEn: StoryCatalog = {
  'two-women-at-the-gate.chronicle': 'Two sisters offered a country held by agreement.',
  'two-women-at-the-gate.hear-them-out.d': 'Two courts warm at once. That is the hard part.',
  'two-women-at-the-gate.send-them-home.d': 'Provinces are taken, not asked for.',
  'sixty-five-citadels-answer.chronicle': 'Sixty-five citadels answered without being asked twice.',
  'sixty-five-citadels-answer.ok': 'Ride with them',
  title: 'The Trưng Sisters',
  want: 'a country that answers without being ordered',
  waiting: 'Waiting: for two courts to think well of us at the same time.',
  stake: 'Whether anything can be built out of agreement rather than out of conquest.',
  'regard.gathering': 'They have not left. They talk to the district headmen in the evenings, and the headmen listen.',

  'two-women-at-the-gate.title': 'Two women at the gate',
  'two-women-at-the-gate.body':
    'The elder does the talking; the younger watches the room, which is the more unsettling of the two jobs. They are not asking for soldiers. "You take provinces," the elder says, "and each one costs you a war and then costs you a garrison forever after. We are saying there is another way of holding a country, and it is older than yours. Districts answer people they trust. So be a court that two other courts think well of at the same time — not one, two, at once, which is the hard part — and we will show you what answers."',
  'two-women-at-the-gate.hear-them-out': 'Hear them out',
  'two-women-at-the-gate.send-them-home': 'Send them home',

  'charge.sisters.sworn': 'They stay on as guests, which is not quite the word. Two courts, warm, at the same time.',
  'charge.sisters.watching': 'Only one court thinks well of us, or none. The sisters are patient about it.',
  'charge.sisters.kept': 'Two courts, warm at once. The sisters send for their horses.',
  'charge.sisters.broken': 'They leave without saying anything unkind, which is worse.',

  'sixty-five-citadels-answer.title': 'Sixty-five citadels answer',
  'sixty-five-citadels-answer.body':
    'It goes out as a message to the district headmen and comes back as a country. Sixty-five citadels — the number is what everyone remembers, and the number is probably wrong, and it does not matter, because what arrives is not sixty-five garrisons but sixty-five places that have decided whose side they are on without being asked twice. The sisters ride at the head of it together and will not be separated, not on the road and not in the histories, which have never once managed to talk about one of them alone.',
};

export const haiBaVi: StoryCatalog = {
  'two-women-at-the-gate.chronicle': 'Hai chị em hiến kế giữ nước bằng lòng người.',
  'two-women-at-the-gate.hear-them-out.d': 'Hai triều cùng ấm một lúc. Chỗ khó là đấy.',
  'two-women-at-the-gate.send-them-home.d': 'Trấn thì phải lấy, chứ không đi xin.',
  'sixty-five-citadels-answer.chronicle': 'Sáu mươi lăm thành đáp lời, không cần hỏi lần hai.',
  'sixty-five-citadels-answer.ok': 'Cùng lên ngựa với hai bà',
  title: 'Hai Bà Trưng',
  want: 'một đất nước tự đáp lời, không cần ai ra lệnh',
  waiting: 'Đang chờ: hai triều đình cùng lúc có thiện cảm với ta.',
  stake: 'Có dựng nổi cái gì bằng lòng người, thay vì bằng chinh phạt, hay không.',
  'regard.gathering': 'Hai bà chưa đi. Chiều chiều nói chuyện với các già làng, mà các già làng thì chịu nghe.',

  'two-women-at-the-gate.title': 'Hai người đàn bà ngoài cửa',
  'two-women-at-the-gate.body':
    'Bà chị nói; bà em quan sát cả gian phòng, mà việc sau mới là việc khiến người ta gai người. Hai bà không xin quân. "Ngài lấy trấn," bà chị nói, "mà mỗi trấn thì tốn một cuộc chiến, rồi tốn một đồn trú suốt đời sau đó. Chúng tôi nói rằng còn một lối giữ nước khác, và lối ấy cổ hơn lối của ngài. Các huyện đáp lời người mà chúng tin. Vậy ngài hãy làm một triều đình mà hai triều đình khác cùng lúc có thiện cảm — không phải một, mà hai, cùng lúc, chỗ khó là ở đấy — rồi chúng tôi chỉ cho ngài xem cái gì sẽ đáp lời."',
  'two-women-at-the-gate.hear-them-out': 'Nghe hai bà nói hết',
  'two-women-at-the-gate.send-them-home': 'Mời hai bà về',

  'charge.sisters.sworn': 'Hai bà ở lại làm khách, mà chữ ấy cũng chưa đúng hẳn. Hai triều đình, cùng lúc, cùng ấm.',
  'charge.sisters.watching': 'Mới có một triều đình thuận, hoặc chưa có triều nào. Hai bà vẫn nhẫn nại.',
  'charge.sisters.kept': 'Hai triều đình cùng ấm một lúc. Hai bà cho gọi ngựa.',
  'charge.sisters.broken': 'Hai bà ra đi mà không nói một lời nặng nào, thế lại nặng hơn.',

  'sixty-five-citadels-answer.title': 'Sáu mươi lăm thành đáp lời',
  'sixty-five-citadels-answer.body':
    'Nó đi ra như một lời nhắn tới các già làng, và trở về như một đất nước. Sáu mươi lăm thành — cái số ấy là cái ai cũng nhớ, mà cái số ấy có lẽ sai, và điều đó không quan trọng, bởi cái kéo tới không phải sáu mươi lăm đồn trú, mà là sáu mươi lăm nơi đã tự quyết mình đứng về phía nào, không cần hỏi tới lần thứ hai. Hai bà cùng cưỡi ngựa đi đầu và không chịu rời nhau, trên đường đã vậy mà trong sử cũng vậy — sử chưa một lần nào kể được về riêng một bà.',
};
