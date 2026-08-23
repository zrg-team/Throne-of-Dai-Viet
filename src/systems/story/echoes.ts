/**
 * What the Chronicle remembers between runs.
 *
 * A hero who quietly left in run three commanding the host that kills you in run five is the whole
 * promise of the feature, and it is the one part of it that cannot live inside a single run's
 * state. Kept deliberately tiny — a bag of `templateId/fragmentId` markers plus the name attached
 * to each — because the point is that a *later* story gets to mention something, not that a run is
 * reconstructed.
 *
 * Stored beside Legacy rather than inside it: Legacy is a currency ledger with its own
 * write-through discipline, and folding narrative state into it would make every story change a
 * save-compatibility question for the meta-progression.
 */

const ECHO_KEY = 'mandate:chronicle:v1';
const MAX_ECHOES = 24;

export interface ChronicleEcho {
  templateId: string;
  fragmentId: string;
  /** Whoever the moment was about, so a later story can say the name aloud. */
  name: string;
  /** Run index, only so the oldest can be dropped first. */
  seq: number;
  /**
   * Set when this was a death the realm enshrined rather than merely a moment worth quoting.
   *
   * A separate store would have been the wrong shape: this ring already exists, already survives
   * a run, already drops its oldest first, and a shrine is exactly the kind of thing a later
   * dynasty should be able to say out loud.
   */
  kind?: 'memorial';
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function getEchoes(): ChronicleEcho[] {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(ECHO_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is ChronicleEcho =>
        Boolean(entry)
        && typeof (entry as ChronicleEcho).templateId === 'string'
        && typeof (entry as ChronicleEcho).fragmentId === 'string')
      .map((entry) => ({
        templateId: entry.templateId,
        fragmentId: entry.fragmentId,
        name: typeof entry.name === 'string' ? entry.name : '',
        seq: Number.isFinite(entry.seq) ? entry.seq : 0,
        kind: entry.kind === 'memorial' ? 'memorial' : undefined,
      }));
  } catch {
    return [];
  }
}

/** Records a moment worth mentioning in a later run. Silently no-ops without storage. */
export function recordEcho(templateId: string, fragmentId: string, name: string, kind?: 'memorial'): void {
  if (!canUseLocalStorage()) return;
  const echoes = getEchoes();
  const seq = echoes.reduce((max, entry) => Math.max(max, entry.seq), 0) + 1;
  echoes.push({ templateId, fragmentId, name, seq, kind });
  // Oldest first, so the runs a player actually remembers are the ones the game does.
  while (echoes.length > MAX_ECHOES) echoes.shift();
  try {
    localStorage.setItem(ECHO_KEY, JSON.stringify(echoes));
  } catch {
    // A full or unavailable store is not worth interrupting a run over.
  }
}

/** The most recent echo of a given moment, if any run ever produced one. */
export function findEcho(templateId: string, fragmentId: string): ChronicleEcho | undefined {
  return getEchoes()
    .filter((entry) => entry.templateId === templateId && entry.fragmentId === fragmentId)
    .sort((a, b) => b.seq - a.seq)[0];
}

/** The dead a previous dynasty put up a shrine to, newest first. */
export function getMemorials(): ChronicleEcho[] {
  return getEchoes().filter((entry) => entry.kind === 'memorial').sort((a, b) => b.seq - a.seq);
}

/** Test seam. */
export function clearEchoes(): void {
  if (canUseLocalStorage()) localStorage.removeItem(ECHO_KEY);
}
