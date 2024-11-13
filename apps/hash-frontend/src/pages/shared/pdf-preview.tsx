import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Document, Outline, Page, pdfjs, Thumbnail } from "react-pdf";
import { Box, Stack, useTheme } from "@mui/material";
import {
  DashIcon,
  IconButton,
  PlusIcon,
  TextField,
} from "@hashintel/design-system";
import { CustomTextRenderer } from "react-pdf/dist/cjs/shared/types";

const pdfOptions = { cMapUrl: "/pdf-cmaps" };

type PdfViewerProps = {};

const showThumbnails = true;
const showZoom = true;

/** @todo calculate this */
const assumedThumbnailScrollWidth = 16;
const thumbnailWidth = 165;
const thumbnailXPadding = 18;

const letterRatio = 1.2941176470588236;

const pageOptions = { className: "react-pdf-page" };

const highlightPattern = (text: string, pattern: string) => {
  return text.replace(pattern, (value) => `<mark>${value}</mark>`);
};

export const PdfViewer = ({ url }: { url: string }) => {
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = dynamic(
      import("pdfjs-dist/build/pdf.worker.min.mjs"),
      { ssr: false },
    ).toString();
  });

  const [scale, setScale] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [totalPages, setTotalPages] = useState<number>();
  const [selectedPageNumber, setSelectedPageNumber] = useState<number>(1);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setTotalPages(numPages);
  };

  const theme = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>();

  useLayoutEffect(() => {
    // Get the width of the component once it's rendered
    if (containerRef.current) {
      const container = containerRef.current;
      requestAnimationFrame(() => {
        setContainerWidth(container.offsetWidth);
      });
    }
  }, [containerRef]);

  const textRenderer: CustomTextRenderer = useCallback(
    (textItem) => highlightPattern(textItem.str, searchText),
    [searchText],
  );

  const pageWidth =
    (containerWidth ?? 0) -
    assumedThumbnailScrollWidth -
    thumbnailWidth -
    thumbnailXPadding * 2;

  /**
   * Default to a letter-sized page – will adjust via event handler on the page once it's loaded
   */
  const pageHeight = pageWidth * letterRatio;

  return (
    <Box>
      <TextField
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />
      <Stack
        direction="row"
        ref={containerRef}
        sx={({ palette }) => ({
          background: palette.blue[10],
          border: `1px solid ${palette.gray[30]}`,
          borderRadius: 2,
          height: pageHeight,
          width: "60%",
          m: 15,
        })}
      >
        <Document
          className="react-pdf-document"
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          options={pdfOptions}
        >
          <Stack direction="row" sx={{ width: "100%" }}>
            {totalPages !== undefined && (
              <Stack
                gap={2}
                sx={{
                  minWidth:
                    thumbnailWidth +
                    thumbnailXPadding * 2 +
                    assumedThumbnailScrollWidth,
                  maxHeight: pageHeight,
                  overflowY: "scroll",
                  px: `${thumbnailXPadding}px`,
                  py: 2,
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
                          ? palette.blue[20]
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
            <Stack
              justifyContent="center"
              alignItems="center"
              sx={{
                overflow: "hidden",
                position: "relative",
                width: pageWidth,
              }}
            >
              <Page
                customTextRenderer={textRenderer}
                loading={
                  <Box
                    sx={{
                      background: ({ palette }) => palette.common.white,
                      height: pageHeight,
                    }}
                  />
                }
                pageNumber={selectedPageNumber}
                renderTextLayer
                {...pageOptions}
                scale={scale}
                width={pageWidth}
              />
              <Stack
                direction="row"
                sx={{ position: "absolute", bottom: 20, right: 20, zIndex: 20 }}
              >
                <IconButton onClick={() => setScale((prev) => prev - 0.2)}>
                  <DashIcon />
                </IconButton>
                <IconButton onClick={() => setScale((prev) => prev + 0.2)}>
                  <PlusIcon />
                </IconButton>
              </Stack>
            </Stack>
          </Stack>
        </Document>
        <p>
          Page {selectedPageNumber} of {totalPages}
        </p>
      </Stack>
    </Box>
  );
};
