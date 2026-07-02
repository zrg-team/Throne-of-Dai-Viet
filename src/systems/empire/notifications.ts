import type { GameState, Toast } from '../../state/types';

/** How many toasts to keep in the ring buffer; the UI shows the most recent few. */
const MAX_TOASTS = 6;

let toastSeq = 0;

/**
 * Pushes a transient notification onto the empire-mode toast queue. Safe to call
 * from any system; a no-op if the state has no toast buffer (non-empire modes).
 */
export function pushToast(state: GameState, text: string, kind: Toast['kind'] = 'info'): void {
  if (!state.toasts) {
    return;
  }
  toastSeq += 1;
  state.toasts.push({
    id: `toast-${state.turn}-${toastSeq}`,
    text,
    kind,
    createdTurn: state.turn,
  });
  if (state.toasts.length > MAX_TOASTS) {
    state.toasts.splice(0, state.toasts.length - MAX_TOASTS);
  }
}
