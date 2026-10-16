import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import * as Sentry from "@sentry/nextjs";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { FullScreen, useFullScreenHandle } from "react-full-screen";

import {
  ArrowDownLeftAndArrowUpRightToCenterIcon,
  ArrowUpRightAndArrowDownLeftFromCenterIcon,
  MagnifyingGlassMinusLightIcon,
  MagnifyingGlassPlusLightIcon,
} from "@hashintel/design-system";

import { FolioDocument } from "./docx-preview/folio-document";
import { fetchPresignedFileUrl } from "./fetch-presigned-file-url";
import { FilePreviewPageNavigation } from "./file-preview-page-navigation";
import { FilePreviewSearch } from "./file-preview-search";
import { GrayToBlueIconButton } from "./gray-to-blue-icon-button";

import type {
  DocxDocumentControls,
  DocxDocumentPages,
} from "./docx-preview/folio-document";

const zoomStep = 0.2;

type DocxPreviewProps = {
  /**
   * Called when the document cannot be shown at all, so the caller can show
   * the file's icon instead.
   */
  onUnavailable: () => void;
  showSearch: boolean;
  setShowSearch: (showSearch: boolean) => void;
  url: string;
};

export const DocxPreview = ({
  onUnavailable,
  showSearch,
  setShowSearch,
  url,
}: DocxPreviewProps) => {
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<DocxDocumentPages>({
    current: 1,
    total: 0,
  });
  const [zoom, setZoom] = useState(1);
  const [searchHitCount, setSearchHitCount] = useState(0);
  const [selectedSearchHit, setSelectedSearchHit] = useState<number | null>(
    null,
  );

  const controlsRef = useRef<DocxDocumentControls>(null);

  const fullScreenHandle = useFullScreenHandle();

  const [viewportHeight, setViewportHeight] = useState(
    document.documentElement.clientHeight,
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(document.documentElement.clientHeight);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /**
   * An error before any page is laid out means the document cannot be shown.
   * A later one, such as a part folio cannot draw, leaves the pages in place.
   */
  const handleError = (error: unknown) => {
    Sentry.captureException(error);
    if (!controlsRef.current?.hasPages()) {
      onUnavailable();
    }
  };

  const handleDownloadError = useEffectEvent(handleError);

  useEffect(() => {
    let cancelled = false;

    setData(null);

    fetchPresignedFileUrl(url)
      .then((presignedUrl) => fetch(presignedUrl))
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Downloading ${url} failed with HTTP ${response.status}`,
          );
        }
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (!cancelled) {
          setData(buffer);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          handleDownloadError(error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const selectSearchHit = (index: number | null) => {
    setSelectedSearchHit(index);

    if (index !== null) {
      controlsRef.current?.showHit(index);
    }
  };

  const search = (text: string, ignoreCase: boolean) => {
    const hitCount = controlsRef.current?.search(text, ignoreCase) ?? 0;
    setSearchHitCount(hitCount);
    selectSearchHit(hitCount > 0 ? 0 : null);
  };

  const height = fullScreenHandle.active
    ? viewportHeight
    : viewportHeight - 120;

  return (
    <FullScreen
      className="full-height-and-width-for-react-full-screen"
      handle={fullScreenHandle}
    >
      <Box
        sx={({ palette }) => ({
          background: palette.blue[10],
          border: `1px solid ${palette.gray[30]}`,
          borderRadius: 2,
          height,
          overflow: "hidden",
          position: "relative",
          width: "100%",
        })}
      >
        {data ? (
          <Sentry.ErrorBoundary onError={onUnavailable}>
            <FolioDocument
              controlsRef={controlsRef}
              data={data}
              onError={handleError}
              onPagesChange={setPages}
              onZoomChange={setZoom}
            />
          </Sentry.ErrorBoundary>
        ) : (
          <Stack alignItems="center" justifyContent="center" height="100%">
            <CircularProgress />
          </Stack>
        )}
        <Box sx={{ position: "absolute", top: 20, left: 20, zIndex: 100 }}>
          <FilePreviewSearch
            closeSearch={() => setShowSearch(false)}
            onSearch={search}
            onSelectHit={selectSearchHit}
            selectedIndex={selectedSearchHit}
            showSearch={showSearch}
            total={searchHitCount}
          />
        </Box>
        {pages.total > 0 && (
          <>
            <Stack
              direction="row"
              alignItems="center"
              gap={1}
              sx={{
                background: "rgba(255, 255, 255, 0.9)",
                position: "absolute",
                bottom: 20,
                left: 20,
                zIndex: 20,
              }}
            >
              <FilePreviewPageNavigation
                currentPage={pages.current}
                onSelectPage={(pageNumber) =>
                  controlsRef.current?.goToPage(pageNumber)
                }
                totalPages={pages.total}
              />
            </Stack>
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
                  onClick={() => controlsRef.current?.zoomBy(-zoomStep)}
                >
                  <MagnifyingGlassMinusLightIcon />
                </GrayToBlueIconButton>
                <GrayToBlueIconButton
                  aria-label="Zoom in"
                  onClick={() => controlsRef.current?.zoomBy(zoomStep)}
                >
                  <MagnifyingGlassPlusLightIcon />
                </GrayToBlueIconButton>
                <Typography
                  sx={{
                    fontSize: 12,
                    color: ({ palette }) => palette.gray[70],
                  }}
                >
                  {Math.round(zoom * 100)}%
                </Typography>
              </Stack>
              <GrayToBlueIconButton
                aria-label={
                  fullScreenHandle.active ? "Exit full screen" : "Full screen"
                }
                onClick={
                  fullScreenHandle[fullScreenHandle.active ? "exit" : "enter"]
                }
              >
                {fullScreenHandle.active ? (
                  <ArrowDownLeftAndArrowUpRightToCenterIcon />
                ) : (
                  <ArrowUpRightAndArrowDownLeftFromCenterIcon />
                )}
              </GrayToBlueIconButton>
            </Stack>
          </>
        )}
      </Box>
    </FullScreen>
  );
};
