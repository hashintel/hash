const principalStorageKey = "brunch-principal-v1";

interface PrincipalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const getOrCreateBrunchPrincipal = (
  storage: PrincipalStorage = window.localStorage,
  createPrincipal: () => string = () => crypto.randomUUID(),
): string => {
  const existing = storage.getItem(principalStorageKey);
  if (existing) {
    return existing;
  }

  const principal = createPrincipal();
  storage.setItem(principalStorageKey, principal);
  return principal;
};
