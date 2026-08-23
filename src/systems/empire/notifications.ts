import type { GameEventRef, GameState, NotificationKind, Toast } from '../../state/types';

/** How many toasts to keep in the ring buffer; the UI shows the most recent few. */
const MAX_TOASTS = 6;
/** How many entries the persistent notification log retains (oldest are dropped). */
const MAX_LOG = 100;

let notifSeq = 0;

/**
 * Appends a notification to the persistent event log — the single source of truth
 * behind the notification bell/log. Safe to call from any system or game mode; it
 * lazily creates the log so older saves without the field still work.
 */
export function logEvent(
  state: GameState,
  text: string,
  kind: NotificationKind = 'info',
  ref?: GameEventRef,
): void {
  if (!state.eventLog) {
    state.eventLog = [];
  }
  notifSeq += 1;
  state.eventLog.push({
    id: `event-${state.turn}-${notifSeq}`,
    text,
    kind,
    turn: state.turn,
    read: false,
    ref,
  });
  if (state.eventLog.length > MAX_LOG) {
    state.eventLog.splice(0, state.eventLog.length - MAX_LOG);
  }
}

/**
 * Pushes a transient notification onto the empire-mode toast queue AND records it in
 * the persistent event log. The toast feed shows the newest few for a few ticks; the
 * log keeps the full history. A no-op on the toast side if the state has no toast
 * buffer (non-empire modes), but the log entry is still recorded.
 */
export function pushToast(
  state: GameState,
  text: string,
  kind: Toast['kind'] = 'info',
  ref?: GameEventRef,
): void {
  logEvent(state, text, kind, ref);
  // Notifications live in a single place: the header message strip (latest event) plus
  // the notification bell/log (history). Surfacing the newest toast in the strip keeps
  // it visible without a second floating overlay competing with on-map panels.
  state.message = text;
  if (!state.toasts) {
    return;
  }
  notifSeq += 1;
  state.toasts.push({
    id: `toast-${state.turn}-${notifSeq}`,
    text,
    kind,
    createdTurn: state.turn,
  });
  if (state.toasts.length > MAX_TOASTS) {
    state.toasts.splice(0, state.toasts.length - MAX_TOASTS);
  }
}
