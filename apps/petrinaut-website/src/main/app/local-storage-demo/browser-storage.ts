export const readBrowserStorage = (
  storage: Storage,
  key: string,
): string | null => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export const writeBrowserStorage = (
  storage: Storage,
  key: string,
  value: string,
): void => {
  try {
    storage.setItem(key, value);
  } catch {
    // Browser persistence is best-effort when storage is unavailable or full.
  }
};

export const removeBrowserStorage = (storage: Storage, key: string): void => {
  try {
    storage.removeItem(key);
  } catch {
    // Browser persistence is best-effort when storage is unavailable.
  }
};
