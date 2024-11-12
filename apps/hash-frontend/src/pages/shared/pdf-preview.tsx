import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Outline, Page, pdfjs, Thumbnail } from "react-pdf";
import { Box, Stack, useTheme } from "@mui/material";

const pdfOptions = { cMapUrl: "/pdf-cmaps" };

type PdfViewerProps = {};

const showThumbnails = true;
const showZoom = true;

const thumbnailWidth = 150;
const horizontalGap = 16;
const containerPadding = 16;
const thumbnailXPadding = 16;

const pageOptions = { className: "react-pdf-page" };

export const PdfViewer = ({ url }: { url: string }) => {
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = dynamic(
      import("pdfjs-dist/build/pdf.worker.min.mjs"),
      { ssr: false },
    ).toString();
  });

  const [totalPages, setTotalPages] = useState<number>();
  const [selectedPageNumber, setSelectedPageNumber] = useState<number>(1);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setTotalPages(numPages);
  };

  const theme = useTheme();

  const pageOptions = useMemo(() => ({ className: "react-pdf-page" }), []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>();

  useLayoutEffect(() => {
    // Get the width of the component once it's rendered
    if (containerRef.current) {
      const container = containerRef.current;
      requestAnimationFrame(() => {
        setContainerHeight(container.offsetHeight);
      });
    }
  }, [containerRef]);

  const pageWidth = `calc(100% - ${thumbnailWidth}px - ${horizontalGap}px - ${thumbnailXPadding * 2}px)`;

  return (
    <Stack
      direction="row"
      ref={containerRef}
      sx={({ palette }) => ({
        background: palette.gray[90],
        border: `1px solid ${palette.gray[30]}`,
        borderRadius: 2,
        p: `${containerPadding}px`,
        height: 600,
        width: "100%",
      })}
    >
      <Document
        className="react-pdf-document"
        file={url}
        onLoadSuccess={onDocumentLoadSuccess}
        options={pdfOptions}
      >
        <Stack
          direction="row"
          gap={`${horizontalGap}px`}
          sx={{ width: "100%" }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              height: "100%",
              width: "100%",
            }}
          >
            <Page
              loading={
                <Box
                  sx={{
                    background: ({ palette }) => palette.common.white,
                    height: containerHeight,
                  }}
                />
              }
              pageNumber={selectedPageNumber}
              renderTextLayer
              {...pageOptions}
              scale={1}
              height={
                Math.min(containerHeight ?? 0, 600) - containerPadding * 2
              }
            />
          </Box>
          {showThumbnails && totalPages !== undefined && (
            <Stack
              gap={3}
              sx={{
                maxHeight: containerHeight - containerPadding * 2,
                overflowY: "auto",
                px: `${thumbnailXPadding}px`,
                py: "6px",
              }}
            >
              {Array.from({ length: totalPages }, (_, i) => (
                <Box
                  key={i}
                  sx={({ palette }) => ({
                    outlineStyle: "solid",
                    outlineOffset: 2,
                    outlineWidth: 4,
                    outlineColor:
                      i + 1 === selectedPageNumber
                        ? palette.blue[70]
                        : "transparent",
                  })}
                >
                  <Thumbnail
                    pageNumber={i + 1}
                    width={thumbnailWidth}
                    {...pageOptions}
                    onItemClick={({ pageNumber }) =>
                      setSelectedPageNumber(pageNumber)
                    }
                    // onMouseEnter={() => setSelectedPageNumber(i + 1)}
                  />
                </Box>
              ))}
            </Stack>
          )}
        </Stack>
      </Document>
      <p>
        Page {selectedPageNumber} of {totalPages}
      </p>
    </Stack>
  );
};
