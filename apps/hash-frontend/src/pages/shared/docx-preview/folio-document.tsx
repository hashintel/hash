import "@stll/folio-react/standalone.css";
import { Box, CircularProgress } from "@mui/material";
import { DocxEditor, hashFolioAIBlockText } from "@stll/folio-react";
import { getFolioMessages } from "@stll/folio-react/messages";
import escapeRegExp from "lodash/escapeRegExp";
import { useCallback, useImperativeHandle, useRef } from "react";
import { IntlProvider } from "use-intl";

import { useReportedPages } from "./folio-document/use-reported-pages";

import type { DocxDocumentPages } from "./folio-document/use-reported-pages";
import type { DocxEditorRef, FolioAIEditSnapshot } from "@stll/folio-react";
import type { Ref } from "react";

/**
 * What `DocxPreview` can ask of the engine that draws the document. Nothing
 * outside this file depends on the engine itself.
 */
export type DocxDocumentControls = {
  /** Whether the engine shows at least one page. */
  hasPages: () => boolean;
  goToPage: (pageNumber: number) => void;
  zoomBy: (step: number) => void;
  /** Finds every hit of `text` and returns how many there are. */
  search: (text: string, ignoreCase: boolean) => number;
  showHit: (index: number) => void;
};

export type { DocxDocumentPages };

type SearchHit = Parameters<DocxEditorRef["showInDocument"]>[0];

type FolioDocumentProps = {
  controlsRef: Ref<DocxDocumentControls>;
  data: ArrayBuffer;
  onError: (error: Error) => void;
  onPagesChange: (pages: DocxDocumentPages) => void;
  onZoomChange: (zoom: number) => void;
};

const folioMessages = getFolioMessages("en");

export const FolioDocument = ({
  controlsRef,
  data,
  onError,
  onPagesChange,
  onZoomChange,
}: FolioDocumentProps) => {
  const editorRef = useRef<DocxEditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchResult = useRef<{
    hits: SearchHit[];
    snapshot: FolioAIEditSnapshot | null;
  }>({ hits: [], snapshot: null });

  const reportPages = useReportedPages(editorRef, onPagesChange);

  /** Collapses the selection `showHit` made, so no earlier hit stays marked. */
  const clearShownHit = useCallback(() => {
    const pagedEditor = editorRef.current?.getEditorRef();
    const selection = pagedEditor?.getState()?.selection;
    if (pagedEditor && selection && !selection.empty) {
      pagedEditor.setSelection(selection.head);
    }
  }, []);

  useImperativeHandle(
    controlsRef,
    () => ({
      /**
       * folio reports one page before it has laid out any, so this looks for
       * a drawn page instead.
       */
      hasPages: () => !!containerRef.current?.querySelector(".layout-page"),
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
          clearShownHit();
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
        if (hits.length === 0) {
          clearShownHit();
        }
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
    [clearShownHit, onZoomChange],
  );

  return (
    <IntlProvider locale="en" messages={folioMessages}>
      <Box ref={containerRef} sx={{ height: "100%" }}>
        <DocxEditor
          ref={editorRef}
          autoOpenReviewSidebar={false}
          documentBuffer={data}
          keyboardShortcuts="none"
          loadingIndicator={<CircularProgress />}
          onError={onError}
          onScrollTopChange={reportPages}
          readOnly
          style={{ height: "100%" }}
        />
      </Box>
    </IntlProvider>
  );
};
