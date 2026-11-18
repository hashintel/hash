import { fileArchiveGeometry } from "./library-geometry/file-archive";
import { fileCodeGeometry } from "./library-geometry/file-code";
import { fileDocumentGeometry } from "./library-geometry/file-document";
import { fileTextGeometry } from "./library-geometry/file-text";

export const libraryGeometry = {
  fileText: fileTextGeometry,
  fileDocument: fileDocumentGeometry,
  fileCode: fileCodeGeometry,
  fileArchive: fileArchiveGeometry,
} as const;
