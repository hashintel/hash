import { brunchActorKeyStorageKey } from "@hashintel/brunch-agent";

type ActorKeyStorage = Pick<Storage, "getItem" | "setItem">;

export const getOrCreateBrunchActorKey = (
  storage: ActorKeyStorage = window.localStorage,
  createActorKey: () => string = () => crypto.randomUUID(),
): string => {
  let existingActorKey: string | null = null;
  try {
    existingActorKey = storage.getItem(brunchActorKeyStorageKey);
  } catch {
    // An unavailable browser store yields an ephemeral actor key.
  }
  if (existingActorKey) {
    return existingActorKey;
  }

  const actorKey = createActorKey();
  try {
    storage.setItem(brunchActorKeyStorageKey, actorKey);
  } catch {
    // The generated actor key remains valid for this page load.
  }
  return actorKey;
};
