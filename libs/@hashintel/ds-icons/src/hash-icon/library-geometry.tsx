import { fileArchiveGeometry } from "./library-geometry/file-archive";
import { fileCodeGeometry } from "./library-geometry/file-code";

export const libraryGeometry = {
  fileCode: fileCodeGeometry,
  fileArchive: fileArchiveGeometry,
} as const;
