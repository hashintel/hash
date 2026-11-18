import { fileArchiveGeometry } from "./library-geometry/file-archive";
import { fileCodeGeometry } from "./library-geometry/file-code";
import { fileDocumentGeometry } from "./library-geometry/file-document";

export const libraryGeometry = {
  fileDocument: fileDocumentGeometry,
  fileCode: fileCodeGeometry,
  fileArchive: fileArchiveGeometry,
} as const;
