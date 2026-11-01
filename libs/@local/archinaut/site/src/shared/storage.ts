/**
 * `localStorage` for the reader's preferences. Private browsing denies the
 * store, so a read it refuses is a miss and a write it refuses is dropped;
 * the control still works for the session either way.
 */

export const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeStored = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Denied; see above.
  }
};
