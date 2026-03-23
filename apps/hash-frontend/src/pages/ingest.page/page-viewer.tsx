/**
 * Page viewer: PDF page image with bbox overlay highlights.
 */
import { Box, Stack, Typography } from "@mui/material";
import type { FunctionComponent } from "react";

import { Button } from "../../shared/ui/button";
import { bboxToPercentage } from "./bbox-transform";
import type { Block, PageImageManifest } from "./types";

interface PageViewerProps {
  pageImages: PageImageManifest[];
  blocks: Block[];
  highlightedBlockIds: string[];
  currentPage: number;
  onPageChange: (page: number) => void;
}

export const PageViewer: FunctionComponent<PageViewerProps> = ({
  pageImages,
  blocks,
  highlightedBlockIds,
  currentPage,
  onPageChange,
}) => {
  const totalPages = pageImages.length;
  const pageImage = pageImages.find((img) => img.pageNumber === currentPage);
  if (!pageImage) {
    return null;
  }

  const visibleBlocks =
    highlightedBlockIds.length > 0
      ? blocks.filter(
          (block) =>
            highlightedBlockIds.includes(block.blockId) &&
            block.anchors.some((anchor) => anchor.page === currentPage),
        )
      : [];

  return (
    <Box>
      {/* Page navigation */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ mb: 1, fontSize: "0.875rem" }}
      >
        <Button
          size="small"
          variant="secondary"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
        >
          ← Prev
        </Button>
        <Typography variant="smallTextLabels">
          Page {currentPage} / {totalPages}
        </Typography>
        <Button
          size="small"
          variant="secondary"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
        >
          Next →
        </Button>
        {visibleBlocks.length > 0 && (
          <Typography
            variant="smallTextLabels"
            sx={{ color: "blue.70", ml: 1 }}
          >
            {visibleBlocks.length} highlighted
          </Typography>
        )}
      </Stack>

      {/* Page image with bbox overlays */}
      <Box
        sx={{ position: "relative", display: "inline-block", lineHeight: 0 }}
      >
        <img
          src={pageImage.imageUrl}
          alt={`Page ${currentPage}`}
          style={{
            maxWidth: "100%",
            height: "auto",
            border: "1px solid",
            borderColor: "rgba(0, 0, 0, 0.12)",
          }}
        />

        {visibleBlocks.map((block) => {
          const anchor = block.anchors.find((anc) => anc.page === currentPage);
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
};
