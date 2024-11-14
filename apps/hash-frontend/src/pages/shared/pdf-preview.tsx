import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

import {
  ArrowDownLeftAndArrowUpRightToCenterIcon,
  ArrowRightIconRegular,
  ArrowUpRightAndArrowDownLeftFromCenterIcon,
  MagnifyingGlassMinusIconLight,
  MagnifyingGlassPlusIconLight,
} from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";
import dynamic from "next/dynamic";
import { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useState } from "react";
import { FullScreen, useFullScreenHandle } from "react-full-screen";
import { Document, Page, pdfjs } from "react-pdf";
import type {
  CustomTextRenderer,
  OnDocumentLoadSuccess,
} from "react-pdf/dist/cjs/shared/types";

import { GrayToBlueIconButton } from "./gray-to-blue-icon-button";
import {
  a4Ratio,
  thumbnailWidth,
  thumbnailXPadding,
  thumbnailYPadding,
} from "./pdf-preview/dimensions";
import { PageThumbnail } from "./pdf-preview/page-thumbnail";
import { PdfPreviewSkeleton } from "./pdf-preview/pdf-preview-skeleton";
import { useElementBorderBoxSize } from "./use-element-dimensions";
import {
  PdfSearch,
  SearchHit,
  SearchHitsByPageNumber,
} from "./pdf-preview/pdf-search";

/**
 * Highlights search hits within the text representing a line on the page.
 * @param text - The text content of the line
 * @param textItemIndex - The index of this TextItem in its page.
 * @param searchHits - An array of occurrences spanning across TextItems.
 * @returns The text with relevant parts wrapped in <mark> tags.
 */
const highlightOccurrencesInTextItem = (
  text: string,
  rowIndex: number,
  searchHits: SearchHit[],
) => {
  let textWithHighlights = "";
  let nextStartingCharacterIndex = 0;

  // Filter occurrences that intersect with this TextItem
  const relevantOccurrences = searchHits.filter(({ start, end }) => {
    return (
      (start.rowIndex < rowIndex && end.rowIndex >= rowIndex) || // Starts before and ends in or after
      (start.rowIndex === rowIndex && start.characterIndex < text.length) // Starts within
    );
  });

  // Sort occurrences by starting position within this TextItem
  relevantOccurrences.sort(
    (a, b) =>
      (a.start.rowIndex === rowIndex ? a.start.characterIndex : 0) -
      (b.start.rowIndex === rowIndex ? b.start.characterIndex : 0),
  );

  for (const { start, end } of relevantOccurrences) {
    const startCharIndex =
      start.rowIndex === rowIndex ? start.characterIndex : 0;
    const endCharIndex =
      end.rowIndex === rowIndex ? end.characterIndex : text.length - 1;

    // Append any unhighlighted text between the lastIndex and this occurrence
    textWithHighlights += text.slice(
      nextStartingCharacterIndex,
      startCharIndex,
    );

    // Wrap the relevant part in <mark> tags
    textWithHighlights += `<mark style="position: relative; bottom:1px;">${text.slice(startCharIndex, endCharIndex + 1)}</mark>`;

    // Update nextStartingCharacterIndex to continue after the current occurrence
    nextStartingCharacterIndex = endCharIndex + 1;
  }

  // Append any remaining text after the last occurrence
  textWithHighlights += text.slice(nextStartingCharacterIndex);

  return textWithHighlights;
};

const pdfOptions = {
  cMapUrl: "/pdf-cmaps",
  withCredentials: false,
};

type PdfViewerProps = {
  showSearch: boolean;
  setShowSearch: (showSearch: boolean) => void;
  showThumbnails: boolean;
  url: string;
};

export const PdfPreview = ({
  showSearch,
  setShowSearch,
  showThumbnails,
  url: initialUrl,
}: PdfViewerProps) => {
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = dynamic(
      // @ts-expect-error -- no types for this import
      // eslint-disable-next-line import/no-extraneous-dependencies
      import("pdfjs-dist/build/pdf.worker.min.mjs"),
      { ssr: false },
    ).toString();
  });

  const [url, setUrl] = useState("");

  useEffect(() => {
    /**
     * The API normally handles file downloads by:
     * 1. Accepting a request with a cookie
     * 2. Checking if the authenticated user can access the file
     * 3. Automatically redirecting the request to a presigned URL to fetch the file
     *
     * This doesn't work for JS fetch because the request to the redirected URL will have origin: null,
     * which the object storage's CORS headers don't permit (at least in our deployed configuration).
     * So we instead ask the API for the presigned URL only, and pass that to react-pdf.
     */
    void fetch(`${initialUrl}?urlOnly=true`, { credentials: "include" })
      .then((resp) => resp.json())
      .then((response) => {
        setUrl(response.url);
      });
  }, [initialUrl]);

  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(
    null,
  );
  const [scale, setScale] = useState(1);
  const [totalPages, setTotalPages] = useState<number>();
  const [selectedPageNumber, setSelectedPageNumber] = useState<number>(1);
  const [searchHits, setSearchHits] = useState<SearchHitsByPageNumber>({});

  const onDocumentLoadSuccess: OnDocumentLoadSuccess = async (docProxy) => {
    setTotalPages(docProxy.numPages);
    setDocumentProxy(docProxy);

    const page = await docProxy.getPage(3);
    const textContent = await page.getTextContent();
    console.log(textContent);
  };

  const textRenderer: CustomTextRenderer = useCallback(
    (textItem) => {
      const relevantSearchHits = searchHits[textItem.pageNumber] ?? [];
      return highlightOccurrencesInTextItem(
        textItem.str,
        textItem.itemIndex,
        relevantSearchHits,
      );
    },
    [searchHits],
  );

  const { ref: entireContainerRef, dimensions: entireContainerDimensions } =
    useElementBorderBoxSize<HTMLDivElement>();

  const {
    ref: thumbnailContainerRef,
    dimensions: thumbnailContainerDimensions,
  } = useElementBorderBoxSize<HTMLDivElement>();

  /**
   * Default to an A4-sized page – will adjust via event handler on the page once it's loaded
   */
  const [pageWidthHeightRatio, setPageWidthHeightRatio] = useState(a4Ratio);

  const pageContainerWidth =
    (entireContainerDimensions?.width ?? 0) -
    (showThumbnails ? (thumbnailContainerDimensions?.width ?? 0) : 0);

  const fullPageHeight = pageContainerWidth * pageWidthHeightRatio;

  const [viewportHeight, setViewportHeight] = useState(
    document.documentElement.clientHeight - 120,
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(document.documentElement.clientHeight);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const fullScreenHandle = useFullScreenHandle();

  const viewportVerticalPadding = fullScreenHandle.active ? 0 : 120;

  const pageContainerHeight =
    fullPageHeight > viewportHeight - viewportVerticalPadding
      ? viewportHeight - viewportVerticalPadding
      : fullPageHeight;

  const pageWidth = Math.ceil(pageContainerHeight / pageWidthHeightRatio);

  const thumbnailContainerSx = {
    maxHeight: pageContainerHeight - 2,
    overflowY: "scroll",
    overflowX: "hidden",
    position: "relative",
    px: `${thumbnailXPadding}px`,
    py: `${thumbnailYPadding}px`,
  };

  return (
    <FullScreen
      className="full-height-and-width-for-react-full-screen"
      handle={fullScreenHandle}
    >
      <Stack
        direction="row"
        ref={entireContainerRef}
        sx={({ palette }) => ({
          background: palette.blue[10],
          border: `1px solid ${palette.gray[30]}`,
          borderRadius: 2,
          height: pageContainerHeight,
          width: "100%",
        })}
      >
        <Box sx={{ position: "absolute", top: 20, right: 20, zIndex: 100 }}>
          <PdfSearch
            closeSearch={() => setShowSearch(false)}
            document={documentProxy}
            setSearchHits={setSearchHits}
            showSearch={showSearch}
          />
        </Box>
        {url ? (
          <Document
            className="react-pdf-document"
            externalLinkTarget="_blank"
            file={url}
            loading={
              <PdfPreviewSkeleton
                pageWidth={pageWidth}
                pageContainerHeight={pageContainerHeight}
                sx={thumbnailContainerSx}
              />
            }
            onLoadSuccess={onDocumentLoadSuccess}
            onItemClick={({ pageNumber }) => setSelectedPageNumber(pageNumber)}
            options={pdfOptions}
          >
            <Stack direction="row" sx={{ width: "100%" }}>
              {showThumbnails && totalPages !== undefined && (
                <Stack
                  gap={2}
                  ref={thumbnailContainerRef}
                  sx={thumbnailContainerSx}
                >
                  {Array.from({ length: totalPages }).map((_item, index) => (
                    <PageThumbnail
                      height={thumbnailWidth * pageWidthHeightRatio}
                      pageNumber={index + 1}
                      /* eslint-disable-next-line react/no-array-index-key */
                      key={index + 1}
                      setSelectedPageNumber={setSelectedPageNumber}
                      selectedPageNumber={selectedPageNumber}
                    />
                  ))}
                  <Stack
                    alignItems="center"
                    sx={{
                      background: "rgba(255, 255, 255, 0.9)",
                      position: "sticky",
                      bottom: 0,
                      margin: "0 auto",
                      width: "fit-content",
                    }}
                  >
                    <Stack direction="row" alignItems="center" gap={1}>
                      <GrayToBlueIconButton
                        onClick={() =>
                          setSelectedPageNumber(selectedPageNumber - 1)
                        }
                      >
                        <ArrowRightIconRegular
                          sx={{ transform: "rotate(180deg)" }}
                        />
                      </GrayToBlueIconButton>
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: ({ palette }) => palette.gray[70],
                        }}
                      >
                        {`${selectedPageNumber} of ${totalPages}`}
                      </Typography>
                      <GrayToBlueIconButton
                        onClick={() =>
                          setSelectedPageNumber(selectedPageNumber + 1)
                        }
                      >
                        <ArrowRightIconRegular />
                      </GrayToBlueIconButton>
                    </Stack>
                  </Stack>
                </Stack>
              )}
              <Stack
                justifyContent="center"
                alignItems="center"
                sx={{
                  overflow: scale > 1 ? "auto" : "hidden",
                  height: pageContainerHeight - 2,
                  width: pageContainerWidth - 2,
                  maxWidth: pageContainerWidth - 2,
                  maxHeight: pageContainerHeight - 2,
                }}
              >
                <Box
                  sx={{
                    background: ({ palette }) => palette.common.white,
                    height: pageContainerHeight * scale - 2,
                    width: pageWidth * scale - 2,
                  }}
                >
                  <Page
                    className="react-pdf-page"
                    customTextRenderer={textRenderer}
                    loading={
                      <Box
                        sx={{
                          background: ({ palette }) => palette.common.white,
                          height: pageContainerHeight,
                          width: pageWidth,
                        }}
                      />
                    }
                    height={pageContainerHeight - 4}
                    onLoadSuccess={({ height, width }) => {
                      setPageWidthHeightRatio(height / width);
                    }}
                    pageNumber={selectedPageNumber}
                    renderTextLayer
                    scale={scale}
                  />
                </Box>
                <Stack
                  alignItems="center"
                  direction="row"
                  gap={1.5}
                  sx={{
                    position: "absolute",
                    bottom: 20,
                    right: 20,
                    zIndex: 20,
                  }}
                >
                  <Stack direction="row" alignItems="center" gap={1}>
                    <GrayToBlueIconButton
                      onClick={() => setScale((prev) => prev - 0.2)}
                    >
                      <MagnifyingGlassMinusIconLight />
                    </GrayToBlueIconButton>
                    <GrayToBlueIconButton
                      onClick={() => setScale((prev) => prev + 0.2)}
                    >
                      <MagnifyingGlassPlusIconLight />
                    </GrayToBlueIconButton>
                    <Typography
                      sx={{
                        fontSize: 12,
                        color: ({ palette }) => palette.gray[70],
                      }}
                    >
                      {Math.round(scale * 100)}%
                    </Typography>
                  </Stack>
                  <GrayToBlueIconButton
                    onClick={
                      fullScreenHandle[
                        fullScreenHandle.active ? "exit" : "enter"
                      ]
                    }
                  >
                    {fullScreenHandle.active ? (
                      <ArrowDownLeftAndArrowUpRightToCenterIcon />
                    ) : (
                      <ArrowUpRightAndArrowDownLeftFromCenterIcon />
                    )}
                  </GrayToBlueIconButton>
                </Stack>
              </Stack>
            </Stack>
          </Document>
        ) : (
          <PdfPreviewSkeleton
            pageWidth={pageWidth}
            pageContainerHeight={pageContainerHeight}
            sx={thumbnailContainerSx}
          />
        )}
      </Stack>
    </FullScreen>
  );
};
