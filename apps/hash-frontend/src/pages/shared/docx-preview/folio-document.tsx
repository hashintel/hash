import "@stll/folio-react/standalone.css";
import { Box, CircularProgress } from "@mui/material";
import { DocxEditor } from "@stll/folio-react";
import { getFolioMessages } from "@stll/folio-react/messages";
import clamp from "lodash/clamp";
import { useImperativeHandle, useRef } from "react";
import { IntlProvider } from "use-intl";

import { useReportedPages } from "./folio-document/use-reported-pages";
import { useSearchHits } from "./folio-document/use-search-hits";

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
  /** Finds every hit of `text` and returns how many there are. */
  search: (text: string, ignoreCase: boolean) => number;
  showHit: (index: number) => void;
};

export type { DocxDocumentPages };

type FolioDocumentProps = {
  controlsRef: Ref<DocxDocumentControls>;
  data: ArrayBuffer;
  onError: (error: Error) => void;
  onPagesChange: (pages: DocxDocumentPages) => void;
  onZoomChange: (zoom: number) => void;
};

const folioMessages = getFolioMessages("en");

const minZoom = 0.25;
const maxZoom = 4;

export const FolioDocument = ({
  controlsRef,
  data,
  onError,
  onPagesChange,
  onZoomChange,
}: FolioDocumentProps) => {
  const editorRef = useRef<DocxEditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const reportPages = useReportedPages(editorRef, onPagesChange);
  const { search, showHit } = useSearchHits(editorRef);

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
      search,
      showHit,
    }),
    [onZoomChange, search, showHit],
  );

  return (
    <IntlProvider locale="en" messages={folioMessages}>
      <Box ref={containerRef} sx={{ height: "100%" }}>
        <DocxEditor
          ref={editorRef}
          autoOpenReviewSidebar={false}
          documentBuffer={data}
          enableWheelZoom={false}
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
