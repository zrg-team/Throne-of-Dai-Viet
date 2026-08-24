/**
 * Sử Ký — the Chronicle lane, one page in a fixed, hand-written order: oaths still outstanding,
 * the last twelve whispers that went past, the stories asking for the player, the ones waiting
 * on the world, the shrine, then the endings already recorded. Each section says why it sits
 * where it does.
 *
 * Every row with a live story behind it is a door onto `showStoryPage`, and that page's Back
 * comes straight back here — the two files are one screen and move together.
 *
 * The mute toggle at the foot and the story page's Back both redraw this page by re-entering
 * `showChronicleScreen`, so the redraw tears the page down first — `laneList` only ever appends to
 * `modalLayer`, and one mute toggle used to double the lane's draw cost (93 objects to 186).
 */
import {
  chronicleTally,
  heldBeat,
  storyCardsMuted,
  storyNeedsPlayer,
  storyParams,
  storyPressure,
  storyWantsPlayer,
} from '../../../systems/story/StorySystem';
import { storyText, storyTitle } from '../../../i18n/story';
import { chargeTrackerLines } from '../../../systems/story/charges';
import { INK_UI } from '../../../ui/InkUI';
import { heroName, t } from '../../../i18n';
import { clearLanePage } from '../layers';
import type { ActiveStory } from '../../../state/types';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * Sử Ký — what has already happened, in past tense.
 *
 * Takes the slot the Codex vacated, which is the right home for it: the Codex was a permanent
 * cross-run collection with nothing to be done about it mid-run, and this is the one screen a
 * player actually wants to open while playing.
 *
 * **No progress, no pips, no counts.** A running story shows its most recent line and the
 * subjects it has marked — that it is being spoken of, and what was last said. Never how far
 * along it is, because it is not along anything.
 */
/**
 * Sử Ký, sorted by whose turn it is.
 *
 * Every story is always in exactly one of three states, and the screen says which without
 * being asked: CẦN NGƯƠI — an offer is open and there is something the player could do;
 * ĐANG CHỜ — it is waiting on the world, and says what it is watching for; ĐÃ CHÉP — over.
 * The shipped version showed none of these, which is why every row looked equally inert
 * and two of three rows read "nobody has said anything yet."
 *
 * Two rules from that failure: a story that has said nothing is *invisible* — a listed
 * promise the screen cannot keep is worse than absence — and rows are people, not titles:
 * name, want, and the most recent line, so a scan of the list is a scan of situations.
 */
export function showChronicleScreen(self: ConquestUIScene): void {
  clearLanePage(self);
  const state = self.state;
  // A latent story does not exist yet as far as the player is concerned — unless it is
  // holding an open door. An opening is deliberately not "spoken" (an offer is not a line),
  // so filtering on spoken alone hid exactly the stories whose *first* move is the offer:
  // the button glowed red over a list that did not contain the reason.
  const running = (state.stories ?? []).filter((story) => story.spoken.length > 0 || storyNeedsPlayer(story));
  const recorded = [...(state.chronicle ?? [])].reverse();

  const need = running.filter((story) => storyWantsPlayer(state, story));
  const waiting = running
    .filter((story) => !storyWantsPlayer(state, story))
    .sort((a, b) => b.lastSpokeTurn - a.lastSpokeTurn);

  const charges = chargeTrackerLines(state);
  const heard = (state.eventLog ?? []).filter((entry) => entry.ref).slice(-12).reverse();
  const memorials = state.memorials ?? [];
  const tabs = [
    { id: 'actions', label: t('ascent.chronicle.tab.actions'), count: need.length },
    { id: 'ongoing', label: t('ascent.chronicle.tab.ongoing'), count: charges.length + waiting.length },
    { id: 'heard', label: t('ascent.chronicle.tab.heard'), count: heard.length },
    { id: 'recorded', label: t('ascent.chronicle.tab.recorded'), count: memorials.length + recorded.length },
  ] as const;
  const activeTab = Math.max(0, tabs.findIndex((tab) => tab.id === self.chronicleTab));

  const { addRow, addHeading, finish } = self.laneList(
    t('ascent.chronicle.title'),
    need.length > 0
      ? t('ascent.chronicle.needCount', { n: need.length })
      : t('ascent.chronicle.body', { year: state.year }),
    {
      tabs: {
        items: tabs.map(({ label, count }) => ({ label, count })),
        active: activeTab,
        onSelect: (index) => {
          self.chronicleTab = tabs[index]?.id ?? 'actions';
          showChronicleScreen(self);
        },
      },
      // At the foot, where the thumb already is. This page is read one-handed, and this is the
      // only control on it that is a setting rather than a story.
      footerToggle: {
        label: t('ascent.chronicle.muteLabel'),
        hint: t(storyCardsMuted(state)
          ? 'ascent.chronicle.mutedHint'
          : 'ascent.chronicle.interruptHint'),
        checked: storyCardsMuted(state),
        onToggle: () => {
          if (state.ascent) state.ascent.storyCardsMuted = !storyCardsMuted(state);
          showChronicleScreen(self);
        },
      },
    },
  );

  const addEmpty = (key:
    | 'ascent.chronicle.emptyActions'
    | 'ascent.chronicle.emptyOngoing'
    | 'ascent.chronicle.emptyHeard'
    | 'ascent.chronicle.emptyRecorded') => {
    addRow({
      title: t('ascent.chronicle.emptyTitle'),
      subtitle: t(key),
      border: INK_UI.softBrush,
      muted: true,
    });
  };


  /** One story as one person: name · want, then the latest line, then the state. */
  const storyRow = (story: ActiveStory, needsYou: boolean) => {
    const params = storyParams(state, story);
    const lastId = story.spoken[story.spoken.length - 1];
    // A story surfaced by its opening alone has said nothing yet — there is no last line.
    const line = lastId ? storyText(`${story.templateId}.${lastId}.chronicle`, params) : undefined;
    const hero = state.heroes.find((candidate) => candidate.id === story.cast.heroId);
    const want = storyText(`${story.templateId}.want`, params);
    // A running instrument says how it stands, right here, so the lane answers "what is
    // happening with him" without the player having to open anything. Falls back to what the
    // person wants, which is what the row said before.
    const pressure = storyPressure(state, story);
    const pressureKey = `${story.templateId}.pressure.${pressure}`;
    const standing = pressure ? storyText(pressureKey, params) : undefined;
    const wantLine = (standing && standing !== pressureKey)
      ? standing
      : (want !== `${story.templateId}.want`
        ? t('ascent.story.wants', { want })
        : undefined);
    // Two different kinds of "needs you", and the row says which: a door standing open on a
    // subject, or a beat the story is holding because beats have been muted.
    const status = heldBeat(state, story)
      ? t('ascent.story.needsAnswer')
      : needsYou
        ? t('ascent.story.doorsOpen')
        : storyText(`${story.templateId}.waiting`, params);

    addRow(
      {
        title: hero ? `${storyTitle(story.templateId)} · ${heroName(hero)}` : storyTitle(story.templateId),
        subtitle: [wantLine, line, status].filter(Boolean).join('\n'),
        border: needsYou ? INK_UI.cinnabar : INK_UI.jade,
      },
      () => self.showStoryPage(story.id),
    );
  };

  if (self.chronicleTab === 'actions') {
    if (need.length === 0) addEmpty('ascent.chronicle.emptyActions');
    else for (const story of need) storyRow(story, true);
  }

  if (self.chronicleTab === 'ongoing') {
    // `chargeTrackerLines` gives an oath a permanent home without turning the Chronicle into one
    // vast list. Oaths and stories waiting on the world share this shelf because neither asks for
    // a tap now, but both are still alive.
    if (charges.length > 0) {
      addHeading(t('ascent.chronicle.sworn'));
      for (const charge of charges) {
        addRow({
          title: charge.text,
          subtitle: charge.seasonsLeft === undefined
            ? ''
            : t('ascent.chronicle.swornSeasons', { n: charge.seasonsLeft }),
          border: INK_UI.gold,
        });
      }
    }
    if (waiting.length > 0) {
      addHeading(t('ascent.chronicle.waitingHdr'));
      for (const story of waiting) storyRow(story, false);
    }
    if (charges.length === 0 && waiting.length === 0) addEmpty('ascent.chronicle.emptyOngoing');
  }

  if (self.chronicleTab === 'heard') {
    // The permanent half of the whisper strip. Only the latest twelve are kept here; a live story
    // remains a door onto its page, while an ended one stays readable without pretending to open.
    if (heard.length === 0) addEmpty('ascent.chronicle.emptyHeard');
    for (const entry of heard) {
      const ref = entry.ref!;
      const live = (state.stories ?? []).some((candidate) => candidate.id === ref.storyId);
      addRow(
        {
          title: storyTitle(ref.templateId),
          subtitle: entry.text,
          border: entry.kind === 'threat' ? INK_UI.cinnabar
            : entry.kind === 'reward' || entry.kind === 'milestone' ? INK_UI.gold : INK_UI.softBrush,
          muted: true,
        },
        live ? () => self.showStoryPage(ref.storyId) : undefined,
      );
    }
  }

  if (self.chronicleTab === 'recorded') {
    // Shrines outlast the ring-buffered ending that raised them, so they sit first on the archive
    // shelf; the tally below remains attached specifically to story endings.
    if (memorials.length > 0) {
      addHeading(t('ascent.chronicle.memorials'));
      for (const entry of memorials) {
        const key = `${entry.templateId}.memorial.${entry.key}`;
        const line = storyText(key, { name: entry.name, land: entry.landId ?? '', n: entry.deeds ?? 0 });
        addRow({
          title: entry.name || storyTitle(entry.templateId),
          subtitle: line !== key ? line : storyTitle(entry.templateId),
          border: INK_UI.jade,
        });
      }
    }
    if (recorded.length > 0) {
      const tally = chronicleTally(state);
      addHeading(t('ascent.chronicle.recorded'), t('ascent.chronicle.tally', tally));
      for (const entry of recorded) {
        const cls = entry.historicity;
        addRow({
          title: cls
            ? storyTitle(entry.templateId) + '  ·  ' + t(('ascent.story.tag.' + cls) as Parameters<typeof t>[0])
            : storyTitle(entry.templateId),
          subtitle: storyText(entry.templateId + '.' + entry.fragmentId + '.chronicle', entry.params),
          border: cls === 'chinh-su' ? INK_UI.jade
            : cls === 'da-su' ? INK_UI.gold
              : cls === 'ngoai-truyen' ? INK_UI.cinnabar
                : entry.tone === 'threat' ? INK_UI.cinnabar
                  : entry.tone === 'reward' ? INK_UI.jade : INK_UI.softBrush,
          muted: true,
        });
      }
    }
    if (memorials.length === 0 && recorded.length === 0) addEmpty('ascent.chronicle.emptyRecorded');
  }

  finish();
}
