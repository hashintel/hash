import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { Box, Stack, Typography } from "@mui/material";
import { debounce } from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { FullScreen, useFullScreenHandle } from "react-full-screen";
import { Document, Page, pdfjs } from "react-pdf";

import {
  ArrowDownLeftAndArrowUpRightToCenterIcon,
  ArrowUpRightAndArrowDownLeftFromCenterIcon,
  MagnifyingGlassMinusLightIcon,
  MagnifyingGlassPlusLightIcon,
} from "@hashintel/design-system";
import { typedKeys } from "@local/advanced-types/typed-entries";

import { fetchPresignedFileUrl } from "./fetch-presigned-file-url";
import { FilePreviewPageNavigation } from "./file-preview-page-navigation";
import { FilePreviewSearch } from "./file-preview-search";
import {
  clearSearchHits,
  scrollHitIntoView,
  searchHighlightStyles,
  showSearchHits,
} from "./file-preview-search-highlights";
import { GrayToBlueIconButton } from "./gray-to-blue-icon-button";
import {
  a4Ratio,
  thumbnailWidth,
  thumbnailXPadding,
  thumbnailYPadding,
} from "./pdf-preview/dimensions";
import { PageThumbnail } from "./pdf-preview/page-thumbnail";
import { PdfPreviewSkeleton } from "./pdf-preview/pdf-preview-skeleton";
import {
  type SearchHit,
  type SearchHits,
  usePdfSearch,
} from "./pdf-preview/pdf-search";
import { useElementBorderBoxSize } from "./use-element-dimensions";
import { useFilePreviewMaxHeight } from "./use-file-preview-max-height";

import type {
  DocumentCallback,
  OnDocumentLoadSuccess,
} from "react-pdf/dist/cjs/shared/types.js";

const pdfOptions = {
  cMapUrl: "/pdf-cmaps",
  withCredentials: false,
};

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

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
  const [url, setUrl] = useState("");

  useEffect(() => {
    void fetchPresignedFileUrl(initialUrl).then(setUrl);
  }, [initialUrl]);

  const [documentProxy, setDocumentProxy] = useState<DocumentCallback | null>(
    null,
  );
  const [scale, setScale] = useState(1);
  const [totalPages, setTotalPages] = useState<number>();
  const [selectedPageNumber, setSelectedPageNumber] = useState<number>(1);
  const [searchHits, setSearchHits] = useState<SearchHits>({
    total: 0,
    hitsByPageNumber: {},
  });
  const [selectedSearchHit, setSelectedSearchHit] = useState<SearchHit | null>(
    null,
  );

  const { findSearchHits, createHitRanges } = usePdfSearch(documentProxy);

  const selectSearchHit = (searchHit: SearchHit | null) => {
    setSelectedSearchHit(searchHit);

    if (searchHit) {
      setSelectedPageNumber(searchHit.pageNumber);
    }
  };

  const search = (text: string, ignoreCase: boolean) => {
    if (!text) {
      setSearchHits({ hitsByPageNumber: {}, total: 0 });
      selectSearchHit(null);
      return;
    }

    const hits = findSearchHits(text, ignoreCase);
    setSearchHits(hits);

    const firstPageWithHit = typedKeys(hits.hitsByPageNumber)[0];
    const firstHit = firstPageWithHit
      ? hits.hitsByPageNumber[firstPageWithHit]?.[0]
      : null;

    selectSearchHit(firstHit ?? null);
  };

  const allSearchHits = Object.values(searchHits.hitsByPageNumber).flat();

  const onDocumentLoadSuccess: OnDocumentLoadSuccess = (docProxy) => {
    setTotalPages(docProxy.numPages);
    setDocumentProxy(docProxy);
  };

  const pageRef = useRef<HTMLDivElement>(null);
  const pageScrollContainerRef = useRef<HTMLDivElement>(null);

  const [renderedTextLayer, setRenderedTextLayer] = useState<{
    element: Element;
    pageNumber: number;
  } | null>(null);

  /**
   * react-pdf draws a new text layer for each page and zoom level, which
   * empties the ranges built on the previous one.
   */
  const onRenderTextLayerSuccess = useCallback(() => {
    const pageElement = pageRef.current;
    const textLayer = pageElement?.querySelector(".textLayer");
    if (pageElement && textLayer) {
      setRenderedTextLayer({
        element: textLayer,
        pageNumber: Number(pageElement.dataset.pageNumber),
      });
    }
  }, []);

  useEffect(() => {
    if (!renderedTextLayer?.element.isConnected) {
      return;
    }

    const hitsOnPage =
      searchHits.hitsByPageNumber[renderedTextLayer.pageNumber] ?? [];
    if (hitsOnPage.length === 0) {
      return;
    }

    const hitRanges = createHitRanges(renderedTextLayer.element, hitsOnPage);
    const currentHitRange =
      hitRanges[
        hitsOnPage.findIndex(
          (hit) => hit.indexInAllHits === selectedSearchHit?.indexInAllHits,
        )
      ] ?? null;

    showSearchHits(
      hitRanges.filter((range) => range !== null),
      currentHitRange,
    );

    if (currentHitRange && pageScrollContainerRef.current) {
      scrollHitIntoView(currentHitRange, pageScrollContainerRef.current);
    }

    return clearSearchHits;
  }, [createHitRanges, renderedTextLayer, searchHits, selectedSearchHit]);

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

  const fullScreenHandle = useFullScreenHandle();

  const maxHeight = useFilePreviewMaxHeight(fullScreenHandle.active);

  const pageContainerHeight = Math.ceil(Math.min(fullPageHeight, maxHeight));

  const pageWidth = Math.ceil(pageContainerHeight / pageWidthHeightRatio);

  const thumbnailContainerSx = {
    maxHeight: pageContainerHeight - 2,
    overflowY: "scroll",
    overflowX: "hidden",
    position: "relative",
    px: `${thumbnailXPadding}px`,
    py: `${thumbnailYPadding}px`,
  };

  const setPageWidthHeightRatioDebounced = debounce(
    (height: number, width: number) => {
      setPageWidthHeightRatio(Math.round((height / width) * 100) / 100);
    },
    200,
  );

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
        <Box
          sx={{
            position: "absolute",
            top: 20,
            left:
              20 +
              (showThumbnails
                ? (thumbnailContainerDimensions?.width ??
                  thumbnailWidth + thumbnailXPadding * 2)
                : 0),
            zIndex: 100,
          }}
        >
          <FilePreviewSearch
            closeSearch={() => setShowSearch(false)}
            onSearch={search}
            onSelectHit={(index) => selectSearchHit(allSearchHits[index]!)}
            selectedIndex={selectedSearchHit?.indexInAllHits ?? null}
            showSearch={showSearch}
            total={searchHits.total}
          />
        </Box>
        {url ? (
          <Document
            className="react-pdf-document"
            externalLinkTarget="_blank"
            file={url}
            imageResourcesPath="/pdf-annotations/"
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
                      borderRadius: "4px",
                      position: "sticky",
                      bottom: 0,
                      margin: "0 auto",
                      width: "fit-content",
                    }}
                  >
                    <Stack direction="row" alignItems="center" gap={1}>
                      <FilePreviewPageNavigation
                        currentPage={selectedPageNumber}
                        onSelectPage={setSelectedPageNumber}
                        totalPages={totalPages}
                      />
                    </Stack>
                  </Stack>
                </Stack>
              )}
              <Stack
                direction="row"
                ref={pageScrollContainerRef}
                justifyContent={
                  pageWidth * scale > pageContainerWidth
                    ? "flex-start"
                    : "center"
                }
                alignItems={scale > 1 ? "flex-start" : "center"}
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
                    // Search marks fill the text layer, whose text is
                    // transparent and drawn over the canvas. Multiplying the
                    // layer with the page keeps the canvas glyphs under a mark
                    // dark.
                    "& .textLayer": { mixBlendMode: "multiply" },
                    ...searchHighlightStyles,
                  }}
                >
                  <Page
                    className="react-pdf-page"
                    inputRef={pageRef}
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
                      setPageWidthHeightRatioDebounced(height, width);
                    }}
                    onRenderTextLayerSuccess={onRenderTextLayerSuccess}
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
                      aria-label="Zoom out"
                      onClick={() => setScale((prev) => prev - 0.2)}
                    >
                      <MagnifyingGlassMinusLightIcon />
                    </GrayToBlueIconButton>
                    <GrayToBlueIconButton
                      aria-label="Zoom in"
                      onClick={() => setScale((prev) => prev + 0.2)}
                    >
                      <MagnifyingGlassPlusLightIcon />
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
                    aria-label={
                      fullScreenHandle.active
                        ? "Exit full screen"
                        : "Full screen"
                    }
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
