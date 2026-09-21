const principalStorageKey = "brunch-principal-v1";

interface PrincipalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const getOrCreateBrunchPrincipal = (
  storage: PrincipalStorage = window.localStorage,
  createPrincipal: () => string = () => crypto.randomUUID(),
): string => {
  let existingPrincipal: string | null = null;
  try {
    existingPrincipal = storage.getItem(principalStorageKey);
  } catch {
    // An unavailable browser store yields an ephemeral principal.
  }
  if (existingPrincipal) {
    return existingPrincipal;
  }

  const principal = createPrincipal();
  try {
    storage.setItem(principalStorageKey, principal);
  } catch {
    // The generated principal remains valid for this page load.
  }
  return principal;
};
