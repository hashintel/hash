/**
 * Binding-side storage implementation support.
 *
 * This subpath is not part of the plugin SDK. It exposes the substrate-neutral
 * archive reducer/parser used by binding implementations; the actual write
 * capability remains private to each binding.
 */
export {
  archiveSessionLogRead,
  createEmptySessionLogArchive,
  parseSessionLogArchive,
  readArchivedEntryRange,
  type ArchivedSessionLog,
  type ArchivedSessionRead,
  type SessionLogArchive,
  type SessionLogEntrySnapshot,
  type SessionLogRead,
} from "./session-log";
