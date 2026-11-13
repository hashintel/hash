/**
 * A certificate's real PDF, shown the way HASH's file preview shows one (apps/hash-frontend/src/pages/shared/
 * pdf-preview.tsx): react-pdf draws the page with its text layer, fit to the stage's width, with zoom at the bottom
 * right and browser full screen of just the preview ("View in fullscreen", react-full-screen; Esc leaves). HASH's
 * component needs MUI and the app's file fetch, so the prototype draws the same parts in Panda; the stage is the Flows
 * grey (neutral.s20) instead of blue[10] (ledger, doc-viewer-hash-preview fh2).
 *
 * MOCK: the files are the demo certificates in public/files (scripts/make-certificate-pdfs.mjs).
 */
import "react-pdf/dist/Page/TextLayer.css";

import { useEffect, useRef, useState } from "react";
import { FullScreen, type FullScreenHandle } from "react-full-screen";
import { Document, Page, pdfjs } from "react-pdf";

import { Button } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/** A4, height over width. */
export const a4Ratio = 1.414285714285714;

export const pdfUrlOf = (fileName: string) =>
  `${import.meta.env.BASE_URL}files/${fileName}`;

type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

const documents = new Map<string, Promise<PdfDocument>>();

const loadDocument = (url: string) => {
  let loading = documents.get(url);
  if (!loading) {
    loading = pdfjs.getDocument(url).promise;
    documents.set(url, loading);
  }
  return loading;
};

/** The first page of a real PDF, drawn at `width` (and the screen's pixel ratio) for a file tile or row. */
export const PdfThumb = ({ url, width }: { url: string; width: number }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void loadDocument(url)
      .then((doc) => doc.getPage(1))
      .then((page) => {
        const target = canvas.current;
        if (cancelled || !target) {
          return;
        }
        const base = page.getViewport({ scale: 1 });
        const pixelRatio = Math.max(window.devicePixelRatio, 2);
        const viewport = page.getViewport({
          scale: (width / base.width) * pixelRatio,
        });
        target.width = Math.round(viewport.width);
        target.height = Math.round(viewport.height);
        const context = target.getContext("2d");
        if (!context) {
          return;
        }
        const rendering = page.render({ canvasContext: context, viewport });
        task = rendering;
        rendering.promise.catch(() => undefined);
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [url, width]);
  return (
    <canvas
      ref={canvas}
      data-pdf-thumb={url}
      style={{ display: "block", width, height: Math.round(width * a4Ratio) }}
    />
  );
};

const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
};

const useViewportHeight = () => {
  const [height, setHeight] = useState(
    document.documentElement.clientHeight,
  );
  useEffect(() => {
    const resize = () => setHeight(document.documentElement.clientHeight);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return height;
};

const stageStyle = css({
  position: "relative",
  width: "[100%]",
  backgroundColor: "neutral.s20",
});

const fullScreenStageStyle = css({
  height: "[100vh]",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
});

const controlsFullScreenStyle = css({
  position: "absolute",
  right: "[20px]",
  bottom: "[20px]",
  zIndex: "[20]",
  marginTop: "[0]",
});

const scrollStyle = css({
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  overflow: "auto",
  maxWidth: "[100%]",
  maxHeight: "[100%]",
});

const paperStyle = css({
  flexShrink: 0,
  backgroundColor: "neutral.bgSolid.min",
  boxShadow: "[0 0 0 1px var(--colors-neutral-a20)]",
  "& .react-pdf__Page__canvas": { display: "block" },
});

/** Under the page in the panel, so they never cover it; over the stage's corner in full screen, as in HASH. */
const controlsStyle = css({
  display: "flex",
  justifyContent: "flex-end",
  marginTop: "3",
  alignItems: "center",
  gap: "2",
  textStyle: "xs",
  color: "neutral.fg.subtle",
  fontVariantNumeric: "tabular-nums",
});

/**
 * The page fit to the stage's width in the panel; in full screen, fit to the screen's height, as HASH's preview does.
 * `handle` comes from the column, whose expand control enters full screen.
 */
export const PdfPreview = ({
  url,
  handle,
}: {
  url: string;
  handle: FullScreenHandle;
}) => {
  const { ref, width } = useWidth();
  const viewportHeight = useViewportHeight();
  const [scale, setScale] = useState(1);
  const full = handle.active;
  // In the panel the stage is the column's width; full screen fits the page's height to the screen, less 24 px a side.
  const pageWidth = full
    ? Math.floor((viewportHeight - 48) / a4Ratio)
    : Math.floor(width);
  return (
    <FullScreen handle={handle} className={css({ width: "[100%]" })}>
      <div
        ref={ref}
        className={stageStyle}
        data-pdf-preview={url}
        data-full-screen={full || undefined}
      >
        <div className={full ? fullScreenStageStyle : undefined}>
          <div
            className={scrollStyle}
            style={full ? { height: viewportHeight - 48 } : undefined}
          >
            {pageWidth > 0 ? (
              <Document
                file={url}
                loading={
                  <div
                    className={paperStyle}
                    style={{
                      width: pageWidth,
                      height: Math.round(pageWidth * a4Ratio),
                    }}
                  />
                }
              >
                <div className={paperStyle}>
                  <Page
                    pageNumber={1}
                    width={pageWidth * scale}
                    renderTextLayer
                    renderAnnotationLayer={false}
                  />
                </div>
              </Document>
            ) : null}
          </div>
        </div>
        <div
          className={cx(controlsStyle, full && controlsFullScreenStyle)}
        >
          <Button
            size="sm"
            variant="subtle"
            tone="neutral"
            iconName="zoomOut"
            aria-label="Zoom out"
            disabled={scale <= 0.4}
            onClick={() => setScale((current) => current - 0.2)}
          />
          <Button
            size="sm"
            variant="subtle"
            tone="neutral"
            iconName="zoomIn"
            aria-label="Zoom in"
            onClick={() => setScale((current) => current + 0.2)}
          />
          <span>{Math.round(scale * 100)}%</span>
          {full ? (
            <Button
              size="sm"
              variant="subtle"
              tone="neutral"
              iconName="collapse"
              aria-label="Exit full screen"
              tooltip="Exit full screen · Esc"
              onClick={() => {
                handle.exit().catch(() => undefined);
              }}
            />
          ) : null}
        </div>
      </div>
    </FullScreen>
  );
};
