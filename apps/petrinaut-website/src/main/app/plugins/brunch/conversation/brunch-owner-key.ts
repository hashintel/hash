const ownerKeyStorageKey = "brunch-principal-v1";

type OwnerKeyStorage = Pick<Storage, "getItem" | "setItem">;

export const getOrCreateBrunchOwnerKey = (
  storage: OwnerKeyStorage = window.localStorage,
  createOwnerKey: () => string = () => crypto.randomUUID(),
): string => {
  let existingOwnerKey: string | null = null;
  try {
    existingOwnerKey = storage.getItem(ownerKeyStorageKey);
  } catch {
    // An unavailable browser store yields an ephemeral owner key.
  }
  if (existingOwnerKey) {
    return existingOwnerKey;
  }

  const ownerKey = createOwnerKey();
  try {
    storage.setItem(ownerKeyStorageKey, ownerKey);
  } catch {
    // The generated owner key remains valid for this page load.
  }
  return ownerKey;
};
