import { brunchOwnerKeyStorageKey } from "@hashintel/brunch-agent";

type OwnerKeyStorage = Pick<Storage, "getItem" | "setItem">;

export const getOrCreateBrunchOwnerKey = (
  storage: OwnerKeyStorage = window.localStorage,
  createOwnerKey: () => string = () => crypto.randomUUID(),
): string => {
  let existingOwnerKey: string | null = null;
  try {
    existingOwnerKey = storage.getItem(brunchOwnerKeyStorageKey);
  } catch {
    // An unavailable browser store yields an ephemeral owner key.
  }
  if (existingOwnerKey) {
    return existingOwnerKey;
  }

  const ownerKey = createOwnerKey();
  try {
    storage.setItem(brunchOwnerKeyStorageKey, ownerKey);
  } catch {
    // The generated owner key remains valid for this page load.
  }
  return ownerKey;
};
