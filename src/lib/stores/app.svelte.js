/**
 * App-level loading state.
 *
 * Persistence is async now (the snapshot is read from disk), so there is a real
 * gap between the UI mounting and the data arriving. Without this the board
 * renders empty for a moment, which reads as "my data is gone" rather than
 * "still loading" - exactly the scare that happened during development.
 */

let ready = $state(false);
let bootError = $state(null);

export const appState = {
  /** True once the snapshot has loaded and every store has hydrated. */
  get ready() {
    return ready;
  },

  /** Set when startup failed, so the splash can say so instead of hanging. */
  get bootError() {
    return bootError;
  },

  setReady(value = true) {
    ready = value;
  },

  setBootError(error) {
    bootError = error;
    // Let the app through anyway: a failed disk read still leaves the
    // localStorage cache usable, and a permanent splash screen helps nobody
    ready = true;
  },
};
