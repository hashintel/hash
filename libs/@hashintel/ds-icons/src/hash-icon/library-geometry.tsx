import { fileArchiveGeometry } from "./library-geometry/file-archive";
import { fileAudioGeometry } from "./library-geometry/file-audio";
import { fileBoxGeometry } from "./library-geometry/file-box";
import { fileCodeGeometry } from "./library-geometry/file-code";
import { fileContractGeometry } from "./library-geometry/file-contract";
import { fileDocumentGeometry } from "./library-geometry/file-document";
import { fileImageGeometry } from "./library-geometry/file-image";
import { fileInvoiceGeometry } from "./library-geometry/file-invoice";
import { fileInvoiceDollarGeometry } from "./library-geometry/file-invoice-dollar";
import { filePdfGeometry } from "./library-geometry/file-pdf";
import { filePresentationGeometry } from "./library-geometry/file-presentation";
import { fileTextGeometry } from "./library-geometry/file-text";
import { fileVideoGeometry } from "./library-geometry/file-video";

export const libraryGeometry = {
  fileInvoiceDollar: fileInvoiceDollarGeometry,
  fileBox: fileBoxGeometry,
  fileImage: fileImageGeometry,
  fileVideo: fileVideoGeometry,
  fileAudio: fileAudioGeometry,
  filePdf: filePdfGeometry,
  filePresentation: filePresentationGeometry,
  fileContract: fileContractGeometry,
  fileInvoice: fileInvoiceGeometry,
  fileText: fileTextGeometry,
  fileDocument: fileDocumentGeometry,
  fileCode: fileCodeGeometry,
  fileArchive: fileArchiveGeometry,
} as const;
