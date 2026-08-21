import type { CaptureStore } from "@hashintel/brunch-agent";
import type { SessionLogRead } from "@hashintel/brunch-agent/storage";

type ArchiveWriter = (read: SessionLogRead) => Promise<void>;

const archiveWriters = new WeakMap<CaptureStore, ArchiveWriter>();

export const registerArchiveWriter = (
  store: CaptureStore,
  writer: ArchiveWriter,
): void => {
  archiveWriters.set(store, writer);
};

export const archiveThroughBinding = async (
  store: CaptureStore,
  read: SessionLogRead,
): Promise<void> => {
  const writer = archiveWriters.get(store);
  if (!writer) {
    throw new TypeError(
      "The supplied capture store has no binding-owned session-log writer.",
    );
  }
  await writer(read);
};
