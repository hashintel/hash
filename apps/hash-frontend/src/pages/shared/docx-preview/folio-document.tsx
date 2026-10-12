import "@stll/folio-react/standalone.css";
import { CircularProgress } from "@mui/material";
import { DocxEditor } from "@stll/folio-react";
import { getFolioMessages } from "@stll/folio-react/messages";
import { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { IntlProvider } from "use-intl";

import type { DocxEditorRef } from "@stll/folio-react";
import type { Ref } from "react";

/**
 * What `DocxPreview` can ask of the engine that draws the document. Nothing
 * outside this file depends on the engine itself.
 */
export type DocxDocumentControls = {
  goToPage: (pageNumber: number) => void;
  zoomBy: (step: number) => void;
  openSearch: () => void;
};

export type DocxDocumentPages = { current: number; total: number };

type FolioDocumentProps = {
  controlsRef: Ref<DocxDocumentControls>;
  data: ArrayBuffer;
  failed: boolean;
  onError: (error: Error) => void;
  onPagesChange: (pages: DocxDocumentPages) => void;
  onZoomChange: (zoom: number) => void;
};

const folioMessages = getFolioMessages("en");

export const FolioDocument = ({
  controlsRef,
  data,
  failed,
  onError,
  onPagesChange,
  onZoomChange,
}: FolioDocumentProps) => {
  const editorRef = useRef<DocxEditorRef>(null);
  const reportedPages = useRef<DocxDocumentPages>({ current: 0, total: 0 });

  const reportPages = useCallback(() => {
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
  }, [onPagesChange]);

  /**
   * folio lays pages out in the background and has no event for a finished
   * layout, so the page count is polled.
   */
  useEffect(() => {
    const interval = setInterval(reportPages, 500);
    return () => clearInterval(interval);
  }, [reportPages]);

  useImperativeHandle(
    controlsRef,
    () => ({
      goToPage: (pageNumber) => editorRef.current?.scrollToPage(pageNumber),
      zoomBy: (step) => {
        const editor = editorRef.current;
        if (!editor) {
          return;
        }
        editor.setZoom(editor.getZoom() + step);
        onZoomChange(editor.getZoom());
      },
      openSearch: () => {
        /** Find highlights a hit only once folio's editor view exists. */
        editorRef.current?.getEditorRef()?.ensureView({ focus: false });
        editorRef.current?.openFind();
      },
    }),
    [onZoomChange],
  );

  return (
    <IntlProvider locale="en" messages={folioMessages}>
      <DocxEditor
        ref={editorRef}
        autoOpenReviewSidebar={false}
        documentBuffer={data}
        keyboardShortcuts="editor"
        loadingIndicator={failed ? null : <CircularProgress />}
        onError={onError}
        onScrollTopChange={reportPages}
        readOnly
        style={{ height: "100%" }}
      />
    </IntlProvider>
  );
};
