import { useEffect, useEffectEvent, useRef } from "react";

import type { DocxEditorRef } from "@stll/folio-react";
import type { RefObject } from "react";

export type DocxDocumentPages = { current: number; total: number };

/**
 * Reports folio's current page and page count through `onPagesChange`
 * whenever either changes. Returns the reporter for `onScrollTopChange`.
 */
export const useReportedPages = (
  editorRef: RefObject<DocxEditorRef | null>,
  onPagesChange: (pages: DocxDocumentPages) => void,
) => {
  const reportedPages = useRef<DocxDocumentPages>({ current: 0, total: 0 });

  const reportPages = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const pages = {
      current: editor.getCurrentPage(),
      total: editor.getTotalPages(),
    };
    if (
      pages.current !== reportedPages.current.current ||
      pages.total !== reportedPages.current.total
    ) {
      reportedPages.current = pages;
      onPagesChange(pages);
    }
  };

  const pollPages = useEffectEvent(reportPages);

  /** folio has no event for a page change, so the pages are polled. */
  useEffect(() => {
    const interval = setInterval(() => pollPages(), 500);
    return () => clearInterval(interval);
  }, []);

  return reportPages;
};
