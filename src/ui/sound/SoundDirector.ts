/**
 * Everything the game is heard through: the press effects, and the bed under a fight.
 *
 * **The effects are paper, and nothing is loaded to make them.** A sheet moved under the thumb
 * when a control is pressed, the stiffer snap of a card leaving a stack, and six documents for
 * the six lanes of the action bar — all synthesized, because the interface is a court of paper
 * and paper is a thing a filter can be honest about.
 *
 * **The music is licensed, and that is the second lesson.** A first pass synthesized đàn tranh,
 * đàn bầu, sáo and trống and scheduled generative beds across the whole game. It was reviewed by
 * ear and rejected — *"sound really bad except sound when click button"* — and the difference is
 * the craft, not the code: a woodblock print is made of marks a program can place honestly, and a
 * melody is not. So the effects stayed procedural and the music is now five real orchestral
 * tracks by a composer, playing only where the game asked for them: under a battle, very quietly,
 * and never anywhere else.
 *
 * Not Phaser's SoundManager. The effects are built, not loaded, and the music streams through an
 * `<audio>` element; what the manager would have given us is four lines — the context is built
 * inside the first press (a user gesture by construction, so the autoplay policy is satisfied
 * rather than negotiated) and everything suspends when the tab goes away.
 */

const STORAGE_KEY = 'mandate:sound:v1';

function readEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    return (JSON.parse(raw) as { enabled?: boolean }).enabled !== false;
  } catch {
    return true;
  }
}

/**
 * A sheet of paper, described: where its noise sits, how many times it moves, how hard.
 * `up`/`down` are functions so a voice can re-roll its timing per press.
 */
export interface PaperShape {
  centre: number;
  q: number;
  ripples: number;
  peak: number;
  /** How much quieter each ripple is than the one before it. */
  fade: number;
  up: () => number;
  down: () => number;
}

export interface LaneVoice {
  paper: PaperShape;
  /** A low thump under the paper — stock, a drum skin, a plank. */
  knock?: { from: number; to: number; level: number };
  /** A second sheet, later: the pages after the cover. */
  second?: { after: number; paper: PaperShape };
}

/**
 * The six lanes of the action bar, as six documents. See `SoundDirector.lane`.
 *
 * Exported so the harness can assert the set and the offline demo can render the real numbers
 * rather than a copy of them — a mirrored table is one that drifts the first time a voice is
 * retuned.
 */
export const LANE_VOICES: Record<string, LaneVoice> = {
  // Thick plans unrolled on a bench, and the plank they land on.
  build: {
    paper: { centre: 1000, q: 0.6, ripples: 3, peak: 0.5, fade: 0.22,
      up: () => 0.014 + Math.random() * 0.01, down: () => 0.032 + Math.random() * 0.02 },
    knock: { from: 150, to: 96, level: 0.1 },
  },
  // A portrait card flicked out of a stack: the brightest and the shortest of the six.
  heroes: {
    paper: { centre: 2800, q: 1.4, ripples: 1, peak: 0.42, fade: 0,
      up: () => 0.005, down: () => 0.05 + Math.random() * 0.02 },
  },
  // A memorial scroll unrolling — the longest, and the only one with four movements.
  court: {
    paper: { centre: 1700, q: 0.9, ripples: 4, peak: 0.42, fade: 0.18,
      up: () => 0.016 + Math.random() * 0.012, down: () => 0.036 + Math.random() * 0.022 },
  },
  // A muster roll: stiff paper over the knock of a drum skin.
  army: {
    paper: { centre: 2200, q: 1.2, ripples: 2, peak: 0.46, fade: 0.3,
      up: () => 0.006, down: () => 0.042 + Math.random() * 0.018 },
    knock: { from: 190, to: 118, level: 0.13 },
  },
  // A letter from another court — the softest and slowest; diplomacy is not loud.
  affairs: {
    paper: { centre: 1300, q: 0.5, ripples: 2, peak: 0.34, fade: 0.2,
      up: () => 0.026 + Math.random() * 0.014, down: () => 0.048 + Math.random() * 0.02 },
  },
  // A book: the cover, then the pages a beat behind it.
  chronicle: {
    paper: { centre: 1100, q: 0.7, ripples: 1, peak: 0.5, fade: 0,
      up: () => 0.01, down: () => 0.05 },
    knock: { from: 120, to: 82, level: 0.07 },
    second: { after: 0.13,
      paper: { centre: 1900, q: 0.8, ripples: 3, peak: 0.3, fade: 0.25,
        up: () => 0.012 + Math.random() * 0.01, down: () => 0.028 + Math.random() * 0.016 } },
  },
};

/**
 * How quiet the bed under a fight is, at its quietest and its loudest.
 *
 * "Very very small … and sound increase when numbers of army are large but still small."
 *
 * The band was raised twice while the files were, unknown to anyone, silent — see the note in
 * `verify-sound` about the 40 kbps encode. Once they made a noise the levels could finally be
 * judged by ear, and were: *"battle sound a bit higher"*. 18–30% against the map's 8.5% makes
 * walking into a fight an audible change of room, which is the whole job of a battle bed.
 */
const MUSIC_MIN = 0.18;
const MUSIC_MAX = 0.30;

/**
 * The five battle tracks, split by what the field deserves.
 *
 * All by Scott Buckley, CC-BY 4.0 — free for commercial use *provided the credit ships*, which
 * is why the licence page carries it. Re-encoded to mono 32 kHz 48 kbps (see
 * `test_scripts/scratch/encode-battle-music.mjs`): the studio masters are 320 kbps stereo and
 * 43 MB for the five, which is an absurd payload for a bed at five percent volume.
 *
 * The epic pair — a war march with choir and anvils, and a heroic full-orchestra cue — are held
 * for fields over ten thousand a side, so the tier the mode already draws is one the ear can
 * hear as well as read.
 */
const BATTLE_MUSIC = {
  ordinary: ['legionnaire.mp3', 'juggernaut.mp3', 'vanguard.mp3'],
  epic: ['song-of-the-forge.mp3', 'terminus.mp3'],
};


/**
 * How quiet the bed on the menu and the map is.
 *
 * Judged by ear once the files were fixed: *"menu and conquest gameplay should a bit smaller"*.
 * 8.5% is present on a phone speaker without asking to be listened to, and sits well under the
 * battle floor (0.18), so entering a fight is heard as the room getting louder rather than as a
 * track changing. Small has to mean "not the thing you are listening to", not "not there" —
 * which is what 3% and 5% turned out to mean.
 */
const AMBIENT_LEVEL = 0.085;

/**
 * The peaceful beds, and what they are.
 *
 * Three are **real Vietnamese traditional music** — field recordings made in Hanoi by kevp888
 * (CC-BY 4.0), which is as close to the game's own world as free music gets: plucked strings, a
 * singer, a theatre. The other three are composed East-Asian pieces by hitctrl and marcelofg55
 * (CC-BY 3.0). All six are trimmed to about a hundred seconds with the fades baked in, so a loop
 * is silence meeting silence rather than a seam.
 *
 * The menu leans on the composed pieces and the map on the recordings, but both draw from the
 * whole set: a front page that always sounds the same is a front page nobody hears twice.
 */
export const AMBIENT_MUSIC = {
  // The front page is brief; three is more than it needs.
  menu: ['jade-kings-throne.mp3', 'misty-mountains.mp3', 'hanoi-theatre.mp3'],
  // The map is where an hour is spent, so it plays these as a shuffled set rather than one
  // piece on repeat. A hundred seconds looped for an hour is a hundred seconds heard thirty-six
  // times.
  //
  // **Two Hanoi recordings were cut after listening**: `hanoi-strings` and `hanoi-singer` sounded
  // wrong under the map — a solo instrument and an unaccompanied voice are foreground music, and a
  // bed cannot be something the ear keeps turning towards. The theatre recording stays because it
  // is an ensemble with room around it, which is what a bed is. Their files are not shipped;
  // `encode-ambient-music.mjs` records the sources if they are ever wanted back.
  map: [
    'hanoi-theatre.mp3', 'bamboo-forest.mp3',
    'jade-kings-throne.mp3', 'misty-mountains.mp3',
  ],
};

/** The rest between two pieces — a player putting an instrument down, not a playlist. */
const AMBIENT_GAP_MS = [4000, 9000];

/** Shuffled, and never opening on the piece that just played. */
function shuffled(pool: readonly string[], avoid?: string): string[] {
  const out = [...pool];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (avoid && out.length > 1 && out[0] === avoid) [out[0], out[1]] = [out[1], out[0]];
  return out;
}

export type AmbientScene = 'menu' | 'map' | 'none';

/** FNV-1a, so a battle's key always draws the same track. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

class SoundDirector {
  private ctx?: AudioContext;
  private out?: GainNode;
  private noise?: AudioBuffer;
  private enabled = readEnabled();
  /** Context time of the last voice played — see `claimVoice`. */
  private lastVoiceAt = -1;
  /** The peaceful bed, and which screen asked for it. */
  private ambient?: {
    el: HTMLAudioElement;
    gain: GainNode;
    source: MediaElementAudioSourceNode;
    scene: AmbientScene;
    /** The shuffled running order, and where in it we are. */
    queue: string[];
    at: number;
  };
  /** Pending hand-over to the next piece, so leaving a screen can cancel it. */
  private ambientNext?: number;
  /** Asked for before the first gesture; started when one arrives. See `tap`. */
  private pendingAmbient: AmbientScene = 'none';
  /** The bed under the current fight, if one is playing. */
  private music?: {
    el: HTMLAudioElement;
    gain: GainNode;
    source: MediaElementAudioSourceNode;
    file: string;
  };

  /**
   * **Any touch on the page counts as the gesture, not only a control.**
   *
   * The audio used to wait for an `InkUI` press, which is a narrower thing than it sounds: a
   * player who opens the game and taps the art, drags the map, or presses the one control on the
   * front page that leads straight into a run gets no music and no explanation. The browser only
   * requires *a* gesture, so this takes the first one the document sees.
   *
   * Capture phase, and never cancelled: the handler is idempotent after the first call and costs
   * a comparison per press.
   */
  listenForGestures(): void {
    if (typeof document === 'undefined') return;
    const unlock = (): void => {
      if (!this.enabled) return;
      this.ensure();
      this.startPendingAmbient();
    };
    for (const kind of ['pointerdown', 'touchend', 'keydown']) {
      document.addEventListener(kind, unlock, { capture: true, passive: true });
    }
  }

  /**
   * Built on the first press and never before it. An AudioContext created at load is a context
   * the browser refuses to start, plus a console warning for every attempt to use it.
   */
  private ensure(): boolean {
    if (!this.enabled) return false;
    if (!this.ctx) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.4;
      this.out.connect(this.ctx.destination);
      // One second of noise, generated once: every press excites from a random offset into it.
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) {
          void this.ctx.suspend();
          // Suspending silences the graph but the element plays on underneath it, so a fight
          // picked up after a minute away would resume a minute further into the track.
          this.music?.el.pause();
          this.ambient?.el.pause();
        } else if (this.enabled) {
          void this.ctx.resume();
          void this.music?.el.play().catch(() => { /* nothing to do about a refusal */ });
          if (!this.music) void this.ambient?.el.play().catch(() => { /* refused */ });
        }
      });
    }
    /**
     * **`resume()` is a promise, and the bed was being started before it kept it.**
     *
     * A context built inside a user gesture is `running` in desktop Chrome but `suspended` on
     * iOS and in any browser that has not decided yet — and `resume()` resolves a tick or two
     * later. `ambientMusic` refuses to start against a context that is not running, so the press
     * that unlocked the audio was exactly the press that could not start the music: the menu
     * stayed silent, and so did the map, until the player happened to press something else.
     *
     * Reported as *"I can not hear any sound in main menu and map gameplay"* — and invisible to
     * the harness, which launches Chromium with `--autoplay-policy=no-user-gesture-required`,
     * where a fresh context is `running` on the first line. The check below now runs again on the
     * other side of the promise.
     */
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().then(() => this.startPendingAmbient());
    }
    return true;
  }

  /** Starts whatever screen asked for a bed while there was no context to play it into. */
  private startPendingAmbient(): void {
    if (!this.enabled || this.ambient || this.pendingAmbient === 'none') return;
    this.ambientMusic(this.pendingAmbient);
  }

  /**
   * A control was pressed. Two or three quick ripples of banded noise — a sheet moved, not a click.
   *
   * Called from every InkUI press path, so it is also the gesture that unlocks the audio context.
   */
  tap(): void {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    const dest = this.out;
    if (!ctx || !dest) return;
    // The gesture the autoplay policy was waiting for. A screen that asked for a bed before the
    // player had touched anything — the menu, every time — gets it now.
    this.startPendingAmbient();

    const when = ctx.currentTime;
    if (!this.claimVoice(when)) return;
    const ripples = 2 + (Math.random() < 0.5 ? 1 : 0);
    // A different sheet every time: the band moves about a third of an octave either way.
    this.rustle(when, {
      centre: 1500 + Math.random() * 900,
      q: 0.7,
      ripples,
      peak: 0.5,
      // Each ripple is quieter than the last — a sheet settling, not three equal taps.
      fade: 0.25,
      up: () => 0.012 + Math.random() * 0.02,
      down: () => 0.02 + Math.random() * 0.03,
    });
  }

  /**
   * A card was taken. The same paper, cut stiffer.
   *
   * Reported as *"some cards click do not have sound — not find a sound feel like you select
   * card"*, which was two faults in one sentence: the card components (`optionCard`, `CardFan`,
   * `CardStack`) never went through `InkUI`, so they were silent; and a card is not a page, so
   * lending them the desk rustle would have answered only half of it.
   *
   * What separates the two voices is what separates the objects. A sheet of paper is limp and
   * settles over three soft ripples; a card is stiff, leaves the stack in **one** motion, and
   * snaps — so this is a single ripple, a faster attack, a tighter band an octave up, and a short
   * body thump underneath for the weight of the stock. It is deliberately a shade quieter than
   * the button: a card press is usually the second half of a gesture the player already heard the
   * start of (raise, then take).
   */
  card(): void {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    if (!ctx) return;

    const when = ctx.currentTime;
    if (!this.claimVoice(when)) return;
    this.rustle(when, {
      centre: 2600 + Math.random() * 900,
      q: 1.6,
      ripples: 1,
      peak: 0.42,
      fade: 0,
      up: () => 0.004,
      down: () => 0.05 + Math.random() * 0.02,
    });

    // The stock's own weight: a short low knock under the snap, well below the band above so the
    // two read as one object rather than two sounds.
    this.knock(when, 190, 120, 0.12);
  }

  /**
   * A lane on the action bar — each one a different thing being opened.
   *
   * The bar builds its own buttons rather than going through `InkUI` (it needs the glyph above
   * the label, which `InkUI.button` sets beside it), so all six lanes were **silent**, which is
   * what the report pointed at.
   *
   * They could all have taken the ordinary press rustle. They do not, because these six are the
   * only controls in the game the player presses hundreds of times a run, and they are already
   * distinguishable by glyph, label and position — so the ear can carry the same information the
   * eye does, and a lane opened by muscle memory confirms itself without being looked at. Every
   * voice stays inside the one material this interface is made of: paper, in the room where the
   * paper lives.
   *
   *   build      thick plans unrolled — the lowest, heaviest sheet, with a wooden knock
   *   heroes     a portrait card flicked out of a stack — the brightest and shortest
   *   court      a memorial scroll unrolling — the longest, four ripples
   *   army       a muster roll — stiff paper over the knock of a drum skin
   *   affairs    a letter from another court — the softest, slowest, quietest
   *   chronicle  a book — the cover, then the pages, a beat apart
   *
   * Anything not on this table (pause, the run menu, `battle`) takes the ordinary press.
   */
  lane(action: string): void {
    const shape = LANE_VOICES[action];
    if (!shape) { this.tap(); return; }
    if (!this.ensure()) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const when = ctx.currentTime;
    if (!this.claimVoice(when)) return;

    this.rustle(when, shape.paper);
    if (shape.knock) this.knock(when, shape.knock.from, shape.knock.to, shape.knock.level);
    // The book's second half: the cover, then the pages. Past the de-dupe by design — this is
    // one sound in two parts, not two sounds.
    if (shape.second) this.rustle(when + shape.second.after, shape.second.paper);
  }

  /** A short low thump: the weight of stock, a drum skin, a plank. */
  private knock(when: number, from: number, to: number, level: number): void {
    const ctx = this.ctx;
    const dest = this.out;
    if (!ctx || !dest) return;
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(from, when);
    body.frequency.exponentialRampToValueAtTime(to, when + 0.05);
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, when);
    env.gain.exponentialRampToValueAtTime(0.0005, when + 0.07);
    body.connect(env); env.connect(dest);
    body.start(when); body.stop(when + 0.1);
  }

  /**
   * The peaceful bed: the front page, and the map a run is played on.
   *
   * Quieter than the fight (`AMBIENT_LEVEL` sits under the battle floor), because this is the
   * music a player hears for most of an hour and the map is where they read. It is asked for by
   * the scene, so a scene change is the only thing that can change it.
   *
   * **A fight silences it rather than stopping it.** The battle bed and this one must never play
   * together — two pieces of music at once is noise, not layering — so `battleMusic` ducks this
   * to nothing and pauses it, and `stopBattleMusic` gives it back when the field is left. That is
   * cheaper and kinder than tearing the element down and reloading it at every fight.
   *
   * Before the first gesture there is no audio context to play into, so the request waits in
   * `pendingAmbient` and the first press starts it — the menu asks on `create`, long before the
   * player has touched anything.
   */
  ambientMusic(scene: AmbientScene): void {
    this.pendingAmbient = scene;
    if (!this.enabled) return;
    if (scene === 'none') { this.stopAmbient(); return; }
    // Do not build a context for the menu's request; wait for the press that is coming anyway.
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.ambient?.scene === scene) return;
    this.stopAmbient();

    const ctx = this.ctx;
    const queue = shuffled(AMBIENT_MUSIC[scene]);
    const el = new Audio(`${import.meta.env.BASE_URL}audio/ambient/${queue[0]}`);
    // **Not looped — sequenced.** Each piece plays once and hands over to the next after a short
    // rest, and when the set is exhausted it is reshuffled. The element is reused rather than
    // rebuilt: a `MediaElementAudioSourceNode` may only ever adopt one element, so the graph is
    // built once here and every later piece is just a new `src` on the same element.
    el.loop = false;
    el.preload = 'auto';
    el.addEventListener('ended', () => this.advanceAmbient());
    const gain = ctx.createGain();
    // Assigned, never scheduled — see the note in `battleMusic`.
    gain.gain.value = 0.0001;
    let source: MediaElementAudioSourceNode;
    try {
      source = ctx.createMediaElementSource(el);
    } catch {
      return;
    }
    source.connect(gain);
    gain.connect(ctx.destination);
    this.ambient = { el, gain, source, scene, queue, at: 0 };
    // A fight already playing keeps the room: the peaceful bed stays silent until it ends.
    if (!this.music) {
      void el.play().catch(() => { /* autoplay refused */ });
      gain.gain.linearRampToValueAtTime(AMBIENT_LEVEL, ctx.currentTime + 2.5);
    }
  }

  /**
   * One piece has finished: rest a moment, then play the next.
   *
   * The rest is the point — pieces butted together read as a playlist, and a few seconds of the
   * map's own quiet between them reads as a room where somebody is playing. A fight that starts
   * during the rest simply finds nothing to duck, and the hand-over is cancelled when the screen
   * is left.
   */
  private advanceAmbient(): void {
    const ambient = this.ambient;
    if (!ambient || this.ambientNext !== undefined) return;
    const [low, high] = AMBIENT_GAP_MS;
    this.ambientNext = window.setTimeout(() => {
      this.ambientNext = undefined;
      const live = this.ambient;
      // Left the screen, or a fight took the room while we were resting.
      if (!live || live !== ambient || this.music) return;
      live.at += 1;
      if (live.at >= live.queue.length) {
        live.queue = shuffled(AMBIENT_MUSIC[live.scene as 'menu' | 'map'], live.queue[live.at - 1]);
        live.at = 0;
      }
      live.el.src = `${import.meta.env.BASE_URL}audio/ambient/${live.queue[live.at]}`;
      void live.el.play().catch(() => { /* autoplay refused */ });
    }, low + Math.random() * (high - low));
  }

  /** Fades the peaceful bed down and lets it go. */
  private stopAmbient(): void {
    if (this.ambientNext !== undefined) {
      window.clearTimeout(this.ambientNext);
      this.ambientNext = undefined;
    }
    const ambient = this.ambient;
    this.ambient = undefined;
    if (!ambient) return;
    const ctx = this.ctx;
    if (!ctx) { ambient.el.pause(); return; }
    ambient.gain.gain.cancelScheduledValues(ctx.currentTime);
    ambient.gain.gain.setValueAtTime(Math.max(0.0001, ambient.gain.gain.value), ctx.currentTime);
    ambient.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    window.setTimeout(() => {
      ambient.el.pause();
      ambient.el.src = '';
      try { ambient.source.disconnect(); ambient.gain.disconnect(); } catch { /* context gone */ }
    }, 700);
  }

  /** Silences the peaceful bed for the duration of a fight, or gives it back. */
  private duckAmbient(quiet: boolean): void {
    const ambient = this.ambient;
    const ctx = this.ctx;
    if (!ambient || !ctx) return;
    ambient.gain.gain.cancelScheduledValues(ctx.currentTime);
    ambient.gain.gain.setValueAtTime(Math.max(0.0001, ambient.gain.gain.value), ctx.currentTime);
    if (quiet) {
      ambient.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      window.setTimeout(() => { if (this.ambient === ambient && this.music) ambient.el.pause(); }, 900);
    } else {
      // A piece that ran out under the fight is over; take the next one rather than replaying
      // its last moment.
      if (ambient.el.ended) this.advanceAmbient();
      else void ambient.el.play().catch(() => { /* autoplay refused */ });
      ambient.gain.gain.linearRampToValueAtTime(AMBIENT_LEVEL, ctx.currentTime + 2);
    }
  }

  /**
   * The bed under a fight, and the loudest music the game plays.
   *
   * **Very quiet by instruction, and quiet by design.** It plays at three to nine percent — under
   * the drums of the fight rather than over them, the way a film scores a battle it still wants
   * you to hear. `intensity` (0–1, the size of the field) walks it across that band: a skirmish
   * is almost subliminal, twenty thousand men is merely present. Even the top of the range is
   * well below the press effects, which peak at 0.5.
   *
   * Five tracks by Scott Buckley, CC-BY 4.0 — the credit is on the licence page, and it must
   * stay there for as long as these files ship. The epic pair is held back for the fields that
   * earn it (see `BATTLE_MUSIC`), which is the same >10,000-a-side line the mode already draws.
   *
   * Streamed through an `<audio>` element rather than decoded into a buffer: these are three and
   * four minutes long, and `decodeAudioData` on the pair would hold ~80 MB of PCM on a phone to
   * play something at five percent. The element streams, and `createMediaElementSource` still
   * gives the gain node the fade needs.
   */
  battleMusic(trackKey: string, epic: boolean, intensity: number): void {
    if (!this.enabled || !this.ensure()) return;
    const ctx = this.ctx;
    if (!ctx) return;

    const pool = epic ? BATTLE_MUSIC.epic : BATTLE_MUSIC.ordinary;
    // The same fight always draws the same track: a field re-entered is the field you left, and
    // a bed that reshuffles every time the screen opens is a bed the player notices.
    const file = pool[hash(trackKey) % pool.length];

    if (this.music?.file === file) {
      this.setBattleIntensity(intensity);
      return;
    }
    this.stopBattleMusic();

    const el = new Audio(`${import.meta.env.BASE_URL}audio/battle/${file}`);
    el.loop = true;
    el.preload = 'auto';
    const gain = ctx.createGain();
    /**
     * Assigned, not scheduled — and the difference was a bug the harness caught.
     *
     * `setValueAtTime(0.0001, now)` schedules an event *at* now, and `setBattleIntensity` opens
     * with `cancelScheduledValues(now)`, which threw that event away and left the parameter at
     * its default of **1**. Every fight therefore opened at full volume and slid down to five
     * percent over the next second — the one thing "very very small" forbids. Measured at 0.72
     * a quarter-second into a skirmish. A plain assignment is the intrinsic value: there is no
     * event to cancel, and the ramp starts from silence.
     */
    gain.gain.value = 0.0001;
    let source: MediaElementAudioSourceNode;
    try {
      source = ctx.createMediaElementSource(el);
    } catch {
      // An element may only be adopted by one context, ever. Nothing to recover: stay silent.
      return;
    }
    source.connect(gain);
    gain.connect(ctx.destination);
    this.music = { el, gain, source, file };
    // One bed at a time: the peaceful one goes quiet for as long as the fight lasts.
    this.duckAmbient(true);
    // A fight is entered by pressing something, so the context is unlocked — but a rejected
    // play() must not take the screen down with it.
    void el.play().catch(() => { /* autoplay refused; the fight is not worse for it */ });
    this.setBattleIntensity(intensity);
  }

  /** Walks the bed's volume to match the size of the field. Cheap; called every beat. */
  setBattleIntensity(intensity: number): void {
    const music = this.music;
    const ctx = this.ctx;
    if (!music || !ctx) return;
    const level = MUSIC_MIN + (MUSIC_MAX - MUSIC_MIN) * Math.min(1, Math.max(0, intensity));
    // Ramped, not set: a beat that doubles the headcount must not step the volume.
    music.gain.gain.cancelScheduledValues(ctx.currentTime);
    music.gain.gain.setValueAtTime(Math.max(0.0001, music.gain.gain.value), ctx.currentTime);
    music.gain.gain.linearRampToValueAtTime(Math.max(0.0001, level), ctx.currentTime + 1.2);
  }

  /**
   * The fight is left, so the music leaves with it — the instruction was *stop if users leave*.
   *
   * Faded rather than cut, then paused and dropped. The element is released because a page that
   * opens twenty fights should not hold twenty `<audio>` elements, and each one can only ever
   * belong to one audio context anyway.
   */
  stopBattleMusic(): void {
    const music = this.music;
    this.music = undefined;
    // The map is still underneath the fight that just ended.
    this.duckAmbient(false);
    if (!music) return;
    const ctx = this.ctx;
    if (!ctx) { music.el.pause(); return; }
    const end = ctx.currentTime + 0.45;
    music.gain.gain.cancelScheduledValues(ctx.currentTime);
    music.gain.gain.setValueAtTime(Math.max(0.0001, music.gain.gain.value), ctx.currentTime);
    music.gain.gain.exponentialRampToValueAtTime(0.0001, end);
    window.setTimeout(() => {
      music.el.pause();
      music.el.src = '';
      try { music.source.disconnect(); music.gain.disconnect(); } catch { /* context gone */ }
    }, 550);
  }

  /**
   * One gesture, one sound.
   *
   * The silent-card report was answered by wiring a dozen bespoke surfaces, and the failure
   * mode on the other side of that is two of them firing for the same finger — a lane row
   * inside a card, a button that commits a choice — which does not read as two sounds but as
   * one muddy one. Anything within 70 ms of the last voice is that, so it is dropped. The
   * window is under the fastest deliberate double-tap (`DOUBLE_TAP_MS` is 300 in `CardFan`),
   * so a player drumming on the interface still hears every press they meant to make.
   */
  private claimVoice(when: number): boolean {
    if (when - this.lastVoiceAt < 0.07) return false;
    this.lastVoiceAt = when;
    return true;
  }

  /**
   * The shared paper graph: banded noise under a ripple envelope.
   *
   * Both voices are the same three nodes with different numbers, so they live in one place — a
   * second hand-built noise chain is how two sounds drift into two unrelated sounds.
   */
  private rustle(when: number, shape: PaperShape): void {
    const ctx = this.ctx;
    const dest = this.out;
    const buffer = this.noise;
    if (!ctx || !dest || !buffer) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = shape.centre;
    band.Q.value = shape.q;
    // Nothing below the paper: the low end of white noise is a rumble, not a rustle.
    const floor = ctx.createBiquadFilter();
    floor.type = 'highpass';
    floor.frequency.value = 600;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    let t = when;
    for (let i = 0; i < shape.ripples; i += 1) {
      const up = shape.up();
      const down = shape.down();
      env.gain.linearRampToValueAtTime(shape.peak * (1 - i * shape.fade), t + up);
      env.gain.exponentialRampToValueAtTime(shape.peak * 0.15, t + up + down);
      t += up + down;
    }
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);

    src.connect(band); band.connect(floor); floor.connect(env); env.connect(dest);
    src.start(when, Math.random() * 0.5);
    src.stop(t + 0.1);
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: value })); } catch { /* full quota */ }
    if (!value) { this.stopBattleMusic(); this.stopAmbient(); }
    else if (this.pendingAmbient !== 'none') this.ambientMusic(this.pendingAmbient);
    if (!this.ctx) return;
    if (value) void this.ctx.resume();
    else void this.ctx.suspend();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** For harnesses: no sound is provable from a screenshot. */
  debug(): {
    enabled: boolean; context: string; music: string; musicGain: number;
    ambient: string; ambientGain: number; ambientFile: string; ambientQueue: number;
    ambientAt: number;
  } {
    return {
      enabled: this.enabled,
      context: this.ctx?.state ?? 'none',
      music: this.music?.file ?? 'none',
      ambient: this.ambient?.scene ?? 'none',
      ambientFile: this.ambient?.queue[this.ambient.at] ?? 'none',
      // Where the piece has got to, which is the only way a harness can tell a bed that is
      // playing from one that is merely loaded.
      ambientAt: Number((this.ambient?.el.currentTime ?? 0).toFixed(1)),
      ambientQueue: this.ambient?.queue.length ?? 0,
      ambientGain: Number((this.ambient?.gain.gain.value ?? 0).toFixed(4)),
      musicGain: Number((this.music?.gain.gain.value ?? 0).toFixed(4)),
    };
  }
}

export const soundDirector = new SoundDirector();
// The page itself is the unlock, from the moment the module loads.
soundDirector.listenForGestures();
