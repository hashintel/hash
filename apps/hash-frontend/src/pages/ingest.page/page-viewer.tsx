/**
 * Page viewer: continuous-scroll PDF page images with bbox overlay highlights.
 *
 * Renders all pages in a vertically scrolling container. Exposes a
 * `scrollToPage` imperative handle for programmatic navigation.
 */
import { Box, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";

import { bboxToPercentage } from "./bbox-transform";
import type { Block, PageImageManifest } from "./types";

export interface PageViewerHandle {
  scrollToPage: (pageNumber: number) => void;
}

interface PageViewerProps {
  pageImages: PageImageManifest[];
  blocks: Block[];
  highlightedBlockIds: string[];
}

// ---------------------------------------------------------------------------
// Single page with bbox overlays (defined first for no-use-before-define)
// ---------------------------------------------------------------------------

const PageWithOverlays: FunctionComponent<{
  pageImage: PageImageManifest;
  totalPages: number;
  highlightedBlocks: Block[];
  setRef: (el: HTMLDivElement | null) => void;
}> = ({ pageImage, totalPages, highlightedBlocks, setRef }) => (
  <Box ref={setRef} sx={{ width: "100%", maxWidth: 900 }}>
    <Typography
      variant="microText"
      sx={{
        color: "gray.50",
        mb: 0.5,
        textAlign: "center",
      }}
    >
      Page {pageImage.pageNumber} of {totalPages}
    </Typography>
    <Box sx={{ position: "relative", lineHeight: 0 }}>
      <img
        src={pageImage.imageUrl}
        alt={`Page ${pageImage.pageNumber}`}
        style={{
          width: "100%",
          height: "auto",
          border: "1px solid",
          borderColor: "rgba(0, 0, 0, 0.12)",
          borderRadius: "4px",
        }}
      />

      {highlightedBlocks.map((block) => {
        const anchor = block.anchors.find(
          (anc) => anc.page === pageImage.pageNumber,
        );
        if (!anchor) {
          return null;
        }

        const pct = bboxToPercentage(
          anchor.bbox,
          pageImage.pdfPageWidth,
          pageImage.pdfPageHeight,
          pageImage.bboxOrigin,
        );

        return (
          <Box
            key={block.blockId}
            title={`[${block.kind}] ${block.text.substring(0, 80)}`}
            sx={{
              position: "absolute",
              left: `${pct.left}%`,
              top: `${pct.top}%`,
              width: `${pct.width}%`,
              height: `${pct.height}%`,
              border: "2px solid rgba(59, 130, 246, 0.7)",
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              pointerEvents: "none",
              boxSizing: "border-box",
              borderRadius: "2px",
            }}
          />
        );
      })}
    </Box>
  </Box>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const PageViewer = forwardRef<PageViewerHandle, PageViewerProps>(
  ({ pageImages, blocks, highlightedBlockIds }, ref) => {
    const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    const setPageRef = useCallback(
      (pageNumber: number, el: HTMLDivElement | null) => {
        if (el) {
          pageRefs.current.set(pageNumber, el);
        } else {
          pageRefs.current.delete(pageNumber);
        }
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        scrollToPage(pageNumber: number) {
          const el = pageRefs.current.get(pageNumber);
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
        },
      }),
      [],
    );

    const sortedPages = useMemo(
      () => [...pageImages].sort((a, b) => a.pageNumber - b.pageNumber),
      [pageImages],
    );

    const highlightedBlocksByPage = useMemo(() => {
      if (highlightedBlockIds.length === 0) {
        return new Map<number, Block[]>();
      }
      const map = new Map<number, Block[]>();
      for (const block of blocks) {
        if (!highlightedBlockIds.includes(block.blockId)) {
          continue;
        }
        for (const anchor of block.anchors) {
          const existing = map.get(anchor.page) ?? [];
          existing.push(block);
          map.set(anchor.page, existing);
        }
      }
      return map;
    }, [blocks, highlightedBlockIds]);

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          alignItems: "center",
        }}
      >
        {sortedPages.map((pageImage) => (
          <PageWithOverlays
            key={pageImage.pageNumber}
            pageImage={pageImage}
            totalPages={sortedPages.length}
            highlightedBlocks={
              highlightedBlocksByPage.get(pageImage.pageNumber) ?? []
            }
            setRef={(el) => setPageRef(pageImage.pageNumber, el)}
          />
        ))}
      </Box>
    );
  },
);
