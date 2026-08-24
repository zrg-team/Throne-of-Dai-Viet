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

  const { addRow, addHeading, finish } = self.laneList(
    t('ascent.chronicle.title'),
    need.length > 0
      ? t('ascent.chronicle.needCount', { n: need.length })
      : t('ascent.chronicle.body', { year: state.year }),
    {
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

  if (running.length === 0 && recorded.length === 0) {
    addRow({
      title: t('ascent.chronicle.emptyTitle'),
      subtitle: t('ascent.chronicle.emptyBody'),
      border: INK_UI.softBrush,
      muted: true,
    });
    finish();
    return;
  }

  // ── Oaths still outstanding ──
  //
  // `chargeTrackerLines` was written for exactly this and had no caller anywhere, so a player
  // could swear an oath on a card and never see it again — which is most of the reason no charge
  // resolved in six measured runs. Phrased as the undertaking rather than as a task, because the
  // moment this reads as a quest log it has become the thing the Chronicle exists to avoid.
  {
    const charges = chargeTrackerLines(state);
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
  }

  // ── Đã nghe: the lines that went past ──
  //
  // The permanent half of the whisper strip. The strip is four and a half seconds and gone;
  // this is where a player who was reading the map instead comes to find out what was said —
  // and, because every row opens the story it came from, where the scene behind the line is
  // finally reachable. Before both existed, forty-three per cent of the catalogue was written,
  // translated, fired and discarded without ever being drawn.
  {
    const heard = (state.eventLog ?? []).filter((entry) => entry.ref).slice(-12).reverse();
    if (heard.length > 0) {
      addHeading(t('ascent.chronicle.heard'));
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
          // A story that has since ended has no page to open. The line stays readable; it
          // simply stops being a door, which is better than a door onto the Chronicle it is
          // already sitting in.
          live ? () => self.showStoryPage(ref.storyId) : undefined,
        );
      }
    }
  }


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

  if (need.length > 0) {
    addHeading(t('ascent.chronicle.need'));
    for (const story of need) storyRow(story, true);
  }

  if (waiting.length > 0) {
    addHeading(t('ascent.chronicle.waitingHdr'));
    for (const story of waiting) storyRow(story, false);
  }

  // ── Đền thờ: the dead, and what they were remembered for ──
  //
  // Above the recorded endings rather than below them, because a shrine outlasts the entry that
  // put it there: the Chronicle ring drops its oldest at sixty and this list never does.
  {
    const memorials = state.memorials ?? [];
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
  }

  if (recorded.length > 0) {
    // Counted by class, because that one line is the reign's identity: a dynasty that mostly
    // followed the record reads differently from one that mostly did not.
    const tally = chronicleTally(state);
    // The tally goes in the hint line, not the heading. Appended to the heading it is uppercased
    // and letter-spaced, and "RECORDED · CHÍNH SỬ 1 · DÃ SỬ 0 · NGOẠI TRUYỆN 0" runs off the
    // right edge of a 390px phone with the last figure cut in half — which is the one character
    // that carries the information.
    addHeading(t('ascent.chronicle.recorded'), t('ascent.chronicle.tally', tally));
    for (const entry of recorded) {
      // A story with no source class shows none. Only templates that have actually been
      // placed against the record carry a tag; the rest keep the old tone colouring and say
      // nothing they cannot back up.
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

  finish();
}
