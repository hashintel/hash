import { clipboardGeometry } from "./library-geometry/clipboard";
import { fileArchiveGeometry } from "./library-geometry/file-archive";
import { fileAudioGeometry } from "./library-geometry/file-audio";
import { fileBoxGeometry } from "./library-geometry/file-box";
import { fileCodeGeometry } from "./library-geometry/file-code";
import { fileContractGeometry } from "./library-geometry/file-contract";
import { fileDocumentGeometry } from "./library-geometry/file-document";
import { fileEditGeometry } from "./library-geometry/file-edit";
import { fileExportGeometry } from "./library-geometry/file-export";
import { fileImageGeometry } from "./library-geometry/file-image";
import { fileInvoiceGeometry } from "./library-geometry/file-invoice";
import { fileInvoiceDollarGeometry } from "./library-geometry/file-invoice-dollar";
import { filePdfGeometry } from "./library-geometry/file-pdf";
import { filePlusGeometry } from "./library-geometry/file-plus";
import { filePresentationGeometry } from "./library-geometry/file-presentation";
import { fileTextGeometry } from "./library-geometry/file-text";
import { fileVideoGeometry } from "./library-geometry/file-video";
import { filesGeometry } from "./library-geometry/files";
import { folderGeometry } from "./library-geometry/folder";
import { memoInfoGeometry } from "./library-geometry/memo-info";
import { notePlusGeometry } from "./library-geometry/note-plus";
import { noteStickyGeometry } from "./library-geometry/note-sticky";

export const libraryGeometry = {
  clipboard: clipboardGeometry,
  memoInfo: memoInfoGeometry,
  notePlus: notePlusGeometry,
  noteSticky: noteStickyGeometry,
  folder: folderGeometry,
  files: filesGeometry,
  fileExport: fileExportGeometry,
  fileEdit: fileEditGeometry,
  filePlus: filePlusGeometry,
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
