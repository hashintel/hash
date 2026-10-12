import "@stll/folio-react/standalone.css";
import { CircularProgress } from "@mui/material";
import { DocxEditor, hashFolioAIBlockText } from "@stll/folio-react";
import { getFolioMessages } from "@stll/folio-react/messages";
import escapeRegExp from "lodash/escapeRegExp";
import { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { IntlProvider } from "use-intl";

import type { DocxEditorRef, FolioAIEditSnapshot } from "@stll/folio-react";
import type { Ref } from "react";

/**
 * What `DocxPreview` can ask of the engine that draws the document. Nothing
 * outside this file depends on the engine itself.
 */
export type DocxDocumentControls = {
  goToPage: (pageNumber: number) => void;
  zoomBy: (step: number) => void;
  /** Finds every hit of `text` and returns how many there are. */
  search: (text: string, ignoreCase: boolean) => number;
  showHit: (index: number) => void;
};

export type DocxDocumentPages = { current: number; total: number };

type SearchHit = Parameters<DocxEditorRef["showInDocument"]>[0];

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
  const searchResult = useRef<{
    hits: SearchHit[];
    snapshot: FolioAIEditSnapshot | null;
  }>({ hits: [], snapshot: null });

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
      search: (text, ignoreCase) => {
        const editor = editorRef.current;
        if (!editor || !text) {
          searchResult.current = { hits: [], snapshot: null };
          return 0;
        }

        /** folio creates its editor view lazily and has no snapshot before it. */
        editor.ensureEditorView({ focus: false });
        const snapshot = editor.createAIEditSnapshot();
        const pattern = new RegExp(escapeRegExp(text), ignoreCase ? "gi" : "g");

        const hits = (snapshot?.blocks ?? [])
          .filter((block) => block.kind !== "diagnostic")
          .flatMap((block) =>
            [...block.text.matchAll(pattern)].map((match): SearchHit => {
              const startOffset = match.index;
              const endOffset = startOffset + match[0].length;
              return {
                type: "textRange",
                story: "main",
                blockId: block.id,
                startOffset,
                endOffset,
                selectedTextHash: hashFolioAIBlockText(
                  block.text.slice(startOffset, endOffset),
                ),
              };
            }),
          );

        searchResult.current = { hits, snapshot };
        return hits.length;
      },
      showHit: (index) => {
        const { hits, snapshot } = searchResult.current;
        const hit = hits[index];
        if (hit) {
          editorRef.current?.showInDocument(hit, snapshot ?? undefined);
        }
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
        keyboardShortcuts="none"
        loadingIndicator={failed ? null : <CircularProgress />}
        onError={onError}
        onScrollTopChange={reportPages}
        readOnly
        style={{ height: "100%" }}
      />
    </IntlProvider>
  );
};
