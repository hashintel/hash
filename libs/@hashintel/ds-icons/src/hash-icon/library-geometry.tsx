import { fileArchiveGeometry } from "./library-geometry/file-archive";
import { fileCodeGeometry } from "./library-geometry/file-code";
import { fileContractGeometry } from "./library-geometry/file-contract";
import { fileDocumentGeometry } from "./library-geometry/file-document";
import { fileInvoiceGeometry } from "./library-geometry/file-invoice";
import { filePdfGeometry } from "./library-geometry/file-pdf";
import { filePresentationGeometry } from "./library-geometry/file-presentation";
import { fileTextGeometry } from "./library-geometry/file-text";

export const libraryGeometry = {
  filePdf: filePdfGeometry,
  filePresentation: filePresentationGeometry,
  fileContract: fileContractGeometry,
  fileInvoice: fileInvoiceGeometry,
  fileText: fileTextGeometry,
  fileDocument: fileDocumentGeometry,
  fileCode: fileCodeGeometry,
  fileArchive: fileArchiveGeometry,
} as const;
