/**
 * The Chronicle interrupting: one fragment of a running story, drawn as a card that stops the
 * world. The other two story surfaces live elsewhere — the outcome report one tap later is
 * `screens/aftermath.ts`, the record page is `screens/storyPage.ts` — because only the beat is
 * a prompt the scheduler raises.
 *
 * Every string here comes from `storyText` on a `templateId.fragmentId.suffix` key, not from
 * `t`: a key with no entry comes back as *the key itself* rather than throwing, which is why
 * the advisor line is compared against `prompt.advisorKey` before it is drawn at all.
 */
import { renderHeroFaceInBox } from '../../../ui/FaceRenderer';
import { drawStoryBand } from '../../../ui/ink/storyBand';
import { addStoryPrint, storyBeatPrint } from '../../../ui/storyPrint';
import { storyText } from '../../../i18n/story';
import { INK_UI, INK_UI_HEX } from '../../../ui/InkUI';
import { iconForOption } from '../../../ui/CardIcons';
import { UI_FONT } from '../../../ui/fonts';
import { formatResourceList, heroName, t } from '../../../i18n';
import type { AscentPrompt } from '../../../state/types';
import type { ConquestUIScene } from '../../ConquestUIScene';


/**
 * One fragment of a running story, loud enough to stop the world.
 *
 * **There is no beat counter and no total**, and that absence is the whole design. The header
 * carries the story's name and nothing else, so the player cannot tell whether this is the
 * second thing this story has said or the ninth — and with no fraction to be part of, there is
 * nothing to complete. A quest has a completion state; a story does not.
 *
 * A `blow` has no options. It pauses and tells you, and the only control is an acknowledgement.
 * That is what keeps the Chronicle from reading as a menu: a story the player always answers is
 * a story they control, and control is the opposite of drama.
 */
export function showStoryBeat(self: ConquestUIScene, prompt: Extract<AscentPrompt, { kind: 'story-beat' }>): void {
  const key = (suffix: string) => `${prompt.templateId}.${prompt.fragmentId}.${suffix}`;
  const { body, bodyWidth, finish } = self.promptScrollBody(
    storyText(key('title'), prompt.params),
    storyText(key('body'), prompt.params),
    0,
  );

  let used = 0;

  // Symbolic scenes describe the selected moment; the actual cast still uses its own portrait.
  // Other moments, and missing optional artwork, retain the procedural impression.
  const printKind = storyBeatPrint(prompt.templateId, prompt.fragmentId);
  const hasPrint = printKind && self.textures.exists(`story-print:${printKind}`);
  if (hasPrint || prompt.band) {
    const bandHeight = hasPrint ? 138 : 62;
    const faceWidth = prompt.speakerHeroId ? 62 : 0;
    const holder = self.add.container(0, used);

    if (prompt.speakerHeroId) {
      const speaker = self.state.heroes.find((hero) => hero.id === prompt.speakerHeroId);
      if (speaker) {
        holder.add(renderHeroFaceInBox(self, speaker,
          { x: 0, y: (bandHeight - 62) / 2, width: faceWidth, height: 62 }));
      }
    }

    if (hasPrint) {
      addStoryPrint(self, holder, printKind,
        { x: faceWidth, y: 0, width: bodyWidth - faceWidth, height: bandHeight });
    } else if (prompt.band) {
      const band = drawStoryBand(
        self,
        prompt.band,
        `${prompt.storyId}:${prompt.fragmentId}`,
        bodyWidth - faceWidth,
        bandHeight,
      );
      band.setPosition(faceWidth, 0);
      holder.add(band);
    }

    const frame = self.add.graphics();
    frame.lineStyle(1.2, INK_UI.brush, 0.5);
    if (hasPrint) {
      if (faceWidth > 0) frame.strokeRect(0, (bandHeight - 62) / 2, faceWidth, 62);
    } else {
      frame.strokeRect(0, 0, bodyWidth, bandHeight);
      if (faceWidth > 0) frame.lineBetween(faceWidth, 0, faceWidth, bandHeight);
    }
    holder.add(frame);

    body.add(holder);
    used += bandHeight + 12;
  }

  if (prompt.options.length === 0) {
    // A blow. One way out, and it is not a choice.
    const card = self.optionCard(
      { x: 0, y: used, width: bodyWidth, height: 52 },
      {
        title: storyText(key('ok'), prompt.params),
        body: '',
        accent: INK_UI.cinnabar,
        parent: body,
        onTap: () => self.choose('ok'),
      },
    );
    used += ((card.getData('cardHeight') as number) ?? 52) + 10;
  }

  for (const option of prompt.options) {
    const card = self.optionCard(
      { x: 0, y: used, width: bodyWidth, height: 68 },
      {
        icon: iconForOption(option.id),
        title: storyText(key(option.id), prompt.params),
        body: storyText(key(`${option.id}.d`), prompt.params),
        note: option.cost
          ? (option.affordable ? formatResourceList(option.cost) : t('ascent.response.cantAfford'))
          : (!option.affordable && option.blockedKey
            ? storyText(key(option.blockedKey), prompt.params)
            : undefined),
        noteColor: option.affordable ? undefined : '#a4402c',
        accent: option.affordable ? INK_UI.gold : INK_UI.softBrush,
        disabled: !option.affordable,
        parent: body,
        onTap: () => { if (option.affordable) self.choose(option.id); },
      },
    );
    used += ((card.getData('cardHeight') as number) ?? 68) + 10;
  }

  // The advisor. Whoever holds the relevant seat, and **not** a neutral narrator: a hero with
  // low loyalty or high renown gives advice that serves themselves, and nothing marks it.
  if (prompt.advisorKey && prompt.advisorHeroId) {
    const advisor = self.state.heroes.find((hero) => hero.id === prompt.advisorHeroId);
    const line = storyText(prompt.advisorKey, prompt.params);
    if (advisor && line !== prompt.advisorKey) {
      const quote = self.add.text(2, used + 4, `${heroName(advisor)} — "${line}"`, {
        color: INK_UI_HEX.mutedText,
        fontFamily: UI_FONT,
        fontSize: '11px',
        fontStyle: 'italic',
        wordWrap: { width: bodyWidth - 8 },
      });
      body.add(quote);
      used += quote.height + 14;
    }
  }

  finish(used);
}
