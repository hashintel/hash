import "@stll/folio-react/standalone.css";
import { Box, CircularProgress } from "@mui/material";
import { DocxEditor } from "@stll/folio-react";
import { messages as folioMessages } from "@stll/folio-react/messages/en";
import clamp from "lodash/clamp";
import { useImperativeHandle, useRef } from "react";
import { IntlProvider } from "use-intl";

import { searchMarkColors } from "../file-preview-search-mark-colors";
import {
  searchDocument,
  showSearchHit,
  toSearchResult,
} from "./folio-document/search-hits";
import { useReportedPages } from "./folio-document/use-reported-pages";

import type { DocxSearchResult } from "./folio-document/search-hits";
import type { DocxDocumentPages } from "./folio-document/use-reported-pages";
import type { DocxEditorRef } from "@stll/folio-react";
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
  /**
   * Finds and marks every hit of `text`, and reports them through
   * `onSearchResultChange`.
   */
  search: (text: string, ignoreCase: boolean) => void;
  /** Marks a hit as the current one and scrolls to it. */
  showHit: (index: number) => void;
};

export type { DocxDocumentPages, DocxSearchResult };

type FolioDocumentProps = {
  controlsRef: Ref<DocxDocumentControls>;
  data: ArrayBuffer;
  onError: (error: Error) => void;
  onPagesChange: (pages: DocxDocumentPages) => void;
  onSearchResultChange: (result: DocxSearchResult) => void;
  onZoomChange: (zoom: number) => void;
};

const minZoom = 0.25;
const maxZoom = 4;

export const FolioDocument = ({
  controlsRef,
  data,
  onError,
  onPagesChange,
  onSearchResultChange,
  onZoomChange,
}: FolioDocumentProps) => {
  const editorRef = useRef<DocxEditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const reportPages = useReportedPages(editorRef, onPagesChange);

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
        editor.setZoom(clamp(editor.getZoom() + step, minZoom, maxZoom));
        onZoomChange(editor.getZoom());
      },
      search: (text, ignoreCase) => {
        const editor = editorRef.current;
        if (editor) {
          searchDocument(editor, text, ignoreCase);
        }
      },
      showHit: (index) => {
        const editor = editorRef.current;
        if (editor) {
          showSearchHit(editor, index);
        }
      },
    }),
    [onZoomChange],
  );

  return (
    <IntlProvider locale="en" messages={folioMessages}>
      <Box
        ref={containerRef}
        sx={{
          height: "100%",
          "& .folio-root": {
            "--doc-find-highlight": searchMarkColors.hit,
            "--doc-find-current": searchMarkColors.currentHit,
          },
          // folio draws its search marks over the text. Multiplying them with
          // the page keeps the text under them dark.
          "& [data-folio-find-overlay]": { mixBlendMode: "multiply" },
          // folio rounds each mark's corners and outlines the current hit with
          // inline styles, which only `!important` rules override. The marks
          // are square and fill only, as in the PDF preview.
          "& [data-find-match-index]": {
            borderRadius: "0 !important",
            outline: "none !important",
          },
        }}
      >
        <DocxEditor
          ref={editorRef}
          autoOpenReviewSidebar={false}
          documentBuffer={data}
          enableWheelZoom={false}
          keyboardShortcuts="none"
          loadingIndicator={<CircularProgress />}
          onError={onError}
          onFindResultChange={(result) =>
            onSearchResultChange(toSearchResult(result))
          }
          onScrollTopChange={reportPages}
          readOnly
          style={{ height: "100%" }}
        />
      </Box>
    </IntlProvider>
  );
};
