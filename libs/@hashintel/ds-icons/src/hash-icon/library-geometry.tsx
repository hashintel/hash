import { archiveGeometry } from "./library-geometry/archive";
import { bookGeometry } from "./library-geometry/book";
import { bookOpenGeometry } from "./library-geometry/book-open";
import { booksGeometry } from "./library-geometry/books";
import { calendarCheckGeometry } from "./library-geometry/calendar-check";
import { calendarDayGeometry } from "./library-geometry/calendar-day";
import { calendarDaysGeometry } from "./library-geometry/calendar-days";
import { calendarWeekGeometry } from "./library-geometry/calendar-week";
import { clipboardGeometry } from "./library-geometry/clipboard";
import { clipboardCheckGeometry } from "./library-geometry/clipboard-check";
import { clipboardListGeometry } from "./library-geometry/clipboard-list";
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
import { handwrittenDocsGeometry } from "./library-geometry/handwritten-docs";
import { memoInfoGeometry } from "./library-geometry/memo-info";
import { newspaperGeometry } from "./library-geometry/newspaper";
import { notePlusGeometry } from "./library-geometry/note-plus";
import { noteStickyGeometry } from "./library-geometry/note-sticky";

export const libraryGeometry = {
  calendarCheck: calendarCheckGeometry,
  calendarDays: calendarDaysGeometry,
  calendarWeek: calendarWeekGeometry,
  calendarDay: calendarDayGeometry,
  handwrittenDocs: handwrittenDocsGeometry,
  newspaper: newspaperGeometry,
  books: booksGeometry,
  bookOpen: bookOpenGeometry,
  book: bookGeometry,
  archive: archiveGeometry,
  clipboardList: clipboardListGeometry,
  clipboardCheck: clipboardCheckGeometry,
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
