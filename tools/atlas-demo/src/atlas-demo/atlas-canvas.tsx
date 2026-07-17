import {
  OrthographicView,
  type Layer,
  type OrthographicViewState,
  type ViewStateChangeParameters,
} from "@deck.gl/core";
/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The interactive field needs a focus target for keyboard pan and zoom. */
import DeckGL from "@deck.gl/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import {
  ATLAS_WORLD_SIZE,
  fetchAtlasContours,
  fetchAtlasFlows,
  isAbortError,
  type AtlasSession,
  type DecodedAtlasContours,
  type DecodedAtlasFlows,
} from "../atlas-client";
import {
  AtlasFieldEffect,
  AtlasFieldLayer,
  atlasFieldBounds,
  createAtlasFieldRenderState,
  createAtlasStarLayer,
  type AtlasFieldBounds,
} from "../atlas-field";
import {
  AtlasFrontier,
  atlasFitZoom,
  type AtlasFrontierSnapshot,
} from "../atlas-frontier";
import {
  createAtlasContourLayer,
  createAtlasFlowLayer,
} from "../atlas-overlays";
import { AtlasNotice, atlasErrorCopy } from "./atlas-notice";
import { AtlasToolbar } from "./atlas-toolbar";
import { createAtlasDebugLayers } from "./debug-layers";

interface AtlasCanvasProps {
  readonly onReload: () => void;
  readonly session: AtlasSession;
}

interface CanvasSize {
  readonly height: number;
  readonly width: number;
}

interface AtlasCameraState extends OrthographicViewState {
  readonly maxZoom: number;
  readonly minZoom: number;
  readonly target: [number, number, number];
  readonly zoom: number;
}

const initialCanvasSize = (): CanvasSize => ({
  height: Math.max(window.innerHeight, 1),
  width: Math.max(window.innerWidth, 1),
});

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const dataFitPadding = 0.12;

const fittedCamera = (
  { width, height }: CanvasSize,
  bounds?: AtlasFieldBounds,
): AtlasCameraState => {
  if (bounds === undefined) {
    return {
      maxZoom: 8,
      minZoom: -16,
      target: [ATLAS_WORLD_SIZE / 2, ATLAS_WORLD_SIZE / 2, 0],
      zoom: atlasFitZoom(width, height),
    };
  }

  const spanX = Math.max(bounds.maximumX - bounds.minimumX, 1);
  const spanY = Math.max(bounds.maximumY - bounds.minimumY, 1);
  const availableWidth = width * (1 - dataFitPadding * 2);
  const availableHeight = height * (1 - dataFitPadding * 2);
  return {
    maxZoom: 8,
    minZoom: -16,
    target: [
      (bounds.minimumX + bounds.maximumX) / 2,
      (bounds.minimumY + bounds.maximumY) / 2,
      0,
    ],
    zoom: clamp(
      Math.log2(Math.min(availableWidth / spanX, availableHeight / spanY)),
      -16,
      8,
    ),
  };
};

const firstFailure = (
  snapshot: AtlasFrontierSnapshot,
): AtlasFrontierSnapshot["failures"][number] | undefined =>
  snapshot.failures[0];

const kibibyteFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const overlaySummary = (
  count: number,
  unit: string,
  byteLength: number,
): string =>
  `${count} ${unit} \u00b7 ${kibibyteFormat.format(byteLength / 1024)} KiB`;

/** Interactive deck.gl surface for one immutable Atlas session. */
export const AtlasCanvas = ({ onReload, session }: AtlasCanvasProps) => {
  const [canvasSize, setCanvasSize] = useState(initialCanvasSize);
  const [camera, setCamera] = useState<AtlasCameraState>(() =>
    fittedCamera(initialCanvasSize()),
  );
  const [dataBounds, setDataBounds] = useState<AtlasFieldBounds>();
  const [autoFitPending, setAutoFitPending] = useState(true);
  const [debugFraming, setDebugFraming] = useState(false);
  const [gpuError, setGpuError] = useState<string>();
  const [showContours, setShowContours] = useState(false);
  const [showFlows, setShowFlows] = useState(false);
  // Overlay payloads are keyed by generation: a reloaded session simply
  // stops matching, so stale overlays vanish without an imperative reset.
  const [contourState, setContourState] = useState<{
    readonly data: DecodedAtlasContours;
    readonly generation: string;
  }>();
  const [flowState, setFlowState] = useState<{
    readonly data: DecodedAtlasFlows;
    readonly generation: string;
  }>();
  const [overlayError, setOverlayError] = useState<string>();
  const contourData =
    contourState?.generation === session.generation
      ? contourState.data
      : undefined;
  const flowData =
    flowState?.generation === session.generation ? flowState.data : undefined;

  const frontier = useMemo(() => new AtlasFrontier(session), [session]);
  useEffect(
    () => () => {
      frontier.dispose();
    },
    [frontier],
  );
  const snapshot = useSyncExternalStore(
    frontier.subscribe,
    frontier.getSnapshot,
    frontier.getSnapshot,
  );

  useEffect(() => {
    if (!showContours || contourData !== undefined) {
      return;
    }
    const controller = new AbortController();
    fetchAtlasContours(session, controller.signal).then(
      (data) => {
        setContourState({ data, generation: session.generation });
      },
      (error: unknown) => {
        if (!isAbortError(error)) {
          setOverlayError(
            error instanceof Error ? error.message : String(error),
          );
          setShowContours(false);
        }
      },
    );
    return () => {
      controller.abort();
    };
  }, [contourData, session, showContours]);

  useEffect(() => {
    if (!showFlows || flowData !== undefined) {
      return;
    }
    const controller = new AbortController();
    fetchAtlasFlows(session, controller.signal).then(
      (data) => {
        setFlowState({ data, generation: session.generation });
      },
      (error: unknown) => {
        if (!isAbortError(error)) {
          setOverlayError(
            error instanceof Error ? error.message : String(error),
          );
          setShowFlows(false);
        }
      },
    );
    return () => {
      controller.abort();
    };
  }, [flowData, session, showFlows]);

  useEffect(() => {
    frontier.setView({
      height: canvasSize.height,
      targetX: camera.target[0],
      targetY: camera.target[1],
      width: canvasSize.width,
      zoom: camera.zoom,
    });
  }, [camera, canvasSize, frontier]);

  const renderState = useMemo(() => createAtlasFieldRenderState(), []);
  const handleGpuError = useCallback((message: string) => {
    setGpuError(message);
  }, []);
  const fieldEffect = useMemo(
    () =>
      new AtlasFieldEffect({
        activeTiles: [],
        onError: handleGpuError,
        renderState,
      }),
    [handleGpuError, renderState],
  );
  useEffect(() => {
    fieldEffect.setProps({
      activeTiles: snapshot.activeTiles,
      onError: handleGpuError,
      renderState,
    });
  }, [fieldEffect, handleGpuError, renderState, snapshot.activeTiles]);

  useEffect(() => {
    if (!autoFitPending || snapshot.phase !== "ready") {
      return;
    }
    const discoveredBounds = atlasFieldBounds(snapshot.activeTiles);
    if (discoveredBounds === undefined) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      setDataBounds(discoveredBounds);
      setCamera(fittedCamera(canvasSize, discoveredBounds));
      setAutoFitPending(false);
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [autoFitPending, canvasSize, snapshot.activeTiles, snapshot.phase]);

  const view = useMemo(
    () =>
      new OrthographicView({
        controller: { keyboard: false },
        flipY: false,
        id: "atlas",
      }),
    [],
  );
  const effects = useMemo(() => [fieldEffect], [fieldEffect]);
  const layers = useMemo((): Layer[] => {
    // The field layer is the density instrument: it composites the linear
    // per-record represented-mass accumulation (tone-mapped once, after
    // accumulation). The additive starfield above it carries the crisp
    // per-point evidence. Neither alone reads as both texture and mass.
    // Overlays draw between them: contour outlines trace the analytic
    // topology and bundled flows ride the same merge-tree hierarchy.
    const fieldLayer = new AtlasFieldLayer({
      id: "atlas-field-composite",
      opacity: 1,
      renderState,
    });
    const starLayer = createAtlasStarLayer(snapshot.activeTiles);
    const stack: Layer[] = [fieldLayer];
    if (showContours && contourData !== undefined) {
      stack.push(createAtlasContourLayer(contourData));
    }
    if (showFlows && flowData !== undefined) {
      stack.push(createAtlasFlowLayer(flowData));
    }
    stack.push(starLayer);
    if (debugFraming) {
      stack.push(...createAtlasDebugLayers(snapshot.debugTiles));
    }
    return stack;
  }, [
    contourData,
    debugFraming,
    flowData,
    renderState,
    showContours,
    showFlows,
    snapshot.activeTiles,
    snapshot.debugTiles,
  ]);

  const resetView = useCallback(() => {
    setCamera(fittedCamera(canvasSize, dataBounds));
  }, [canvasSize, dataBounds]);

  const handleResize = useCallback(
    ({ width, height }: { width: number; height: number }) => {
      // Deck can report a 1px bootstrap canvas before layout settles. Ignore
      // that transient size so frontier selection uses meaningful dimensions.
      if (width < 64 || height < 64) {
        return;
      }
      const nextSize = { width, height };
      setCanvasSize((currentSize) =>
        currentSize.width === width && currentSize.height === height
          ? currentSize
          : nextSize,
      );
    },
    [],
  );

  const handleViewStateChange = useCallback(
    ({ viewState }: ViewStateChangeParameters<OrthographicViewState>) => {
      setAutoFitPending(false);
      setCamera((currentCamera) => {
        const target = viewState.target ?? currentCamera.target;
        const zoom =
          typeof viewState.zoom === "number"
            ? viewState.zoom
            : currentCamera.zoom;
        return {
          ...currentCamera,
          target: [target[0], target[1], 0],
          zoom,
        };
      });
    },
    [],
  );

  const handleCanvasKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const panKeys = new Set([
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
      ]);
      const zoomIn = event.key === "+" || event.key === "=";
      const zoomOut = event.key === "-" || event.key === "_";
      if (
        !panKeys.has(event.key) &&
        !zoomIn &&
        !zoomOut &&
        event.key !== "Home"
      ) {
        return;
      }
      event.preventDefault();

      if (event.key === "Home") {
        resetView();
        return;
      }
      setCamera((currentCamera) => {
        if (zoomIn || zoomOut) {
          return {
            ...currentCamera,
            zoom: clamp(
              currentCamera.zoom + (zoomIn ? 1 : -1),
              currentCamera.minZoom,
              currentCamera.maxZoom,
            ),
          };
        }

        const worldPerPixel = 2 ** -currentCamera.zoom;
        const panStep =
          Math.min(canvasSize.width, canvasSize.height) * 0.12 * worldPerPixel;
        const horizontalDirection =
          event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        const verticalDirection =
          event.key === "ArrowDown" ? -1 : event.key === "ArrowUp" ? 1 : 0;
        return {
          ...currentCamera,
          target: [
            clamp(
              currentCamera.target[0] + horizontalDirection * panStep,
              0,
              ATLAS_WORLD_SIZE,
            ),
            clamp(
              currentCamera.target[1] + verticalDirection * panStep,
              0,
              ATLAS_WORLD_SIZE,
            ),
            0,
          ],
        };
      });
    },
    [canvasSize, resetView],
  );

  const failedTile = firstFailure(snapshot);
  const errorCopy =
    failedTile === undefined ? undefined : atlasErrorCopy(failedTile.error);
  const liveSummary =
    `${snapshot.phase}. ${snapshot.activeTiles.length} active tiles, ` +
    `${snapshot.cache.tileCount} cached tiles, ` +
    `${snapshot.deliveredPointCount} delivered points.`;

  return (
    <main className="atlas-demo">
      <AtlasToolbar
        contourOverlay={{
          enabled: showContours,
          summary:
            contourData === undefined
              ? undefined
              : overlaySummary(
                  contourData.contours.length,
                  "rings",
                  contourData.byteLength,
                ),
        }}
        debugFraming={debugFraming}
        flowOverlay={{
          enabled: showFlows,
          summary:
            flowData === undefined
              ? undefined
              : overlaySummary(
                  flowData.flows.length,
                  "pairs",
                  flowData.byteLength,
                ),
        }}
        gpuError={gpuError}
        onContourOverlayChange={setShowContours}
        onDebugFramingChange={setDebugFraming}
        onFlowOverlayChange={setShowFlows}
        onReload={onReload}
        onResetView={resetView}
        onRetryTiles={() => frontier.retryFailed()}
        session={session}
        snapshot={snapshot}
      />

      <section
        className="atlas-canvas"
        tabIndex={0}
        aria-label="Interactive Atlas total-density field"
        aria-describedby="atlas-canvas-instructions"
        onKeyDown={handleCanvasKeyDown}
      >
        <DeckGL
          effects={effects}
          getCursor={({ isDragging }) => (isDragging ? "grabbing" : "grab")}
          layers={layers}
          onResize={handleResize}
          onViewStateChange={handleViewStateChange}
          touchAction="none"
          viewState={camera}
          views={view}
        />
      </section>

      <p id="atlas-canvas-instructions" className="sr-only">
        Drag or use the arrow keys to pan. Scroll or use plus and minus to zoom.
        Press Home to reset the complete Atlas square.
      </p>
      <p className="sr-only" aria-live="polite">
        {liveSummary}
      </p>

      {overlayError === undefined ? null : (
        <AtlasNotice
          title="Overlay unavailable"
          detail={overlayError}
          actions={
            <button
              type="button"
              onClick={() => {
                setOverlayError(undefined);
              }}
            >
              Dismiss
            </button>
          }
        >
          The analytic overlay request failed; the tile field remains live.
        </AtlasNotice>
      )}

      {gpuError === undefined ? null : (
        <AtlasNotice
          title="GPU field rendering unavailable"
          detail={gpuError}
          actions={
            <button type="button" onClick={onReload}>
              Retry renderer
            </button>
          }
        >
          Use a WebGL2 browser and GPU with blendable 16-bit float render
          targets.
        </AtlasNotice>
      )}

      {gpuError === undefined &&
      failedTile !== undefined &&
      errorCopy !== undefined ? (
        <AtlasNotice
          title={errorCopy.title}
          detail={failedTile.error.message}
          actions={
            <>
              <button type="button" onClick={() => frontier.retryFailed()}>
                Retry tile requests
              </button>
              <button type="button" onClick={onReload}>
                Reload generation
              </button>
            </>
          }
        >
          {errorCopy.body}
        </AtlasNotice>
      ) : null}

      {gpuError === undefined &&
      failedTile === undefined &&
      snapshot.activeTiles.length === 0 &&
      snapshot.phase === "loading" ? (
        <AtlasNotice title="Loading root tile">
          Establishing the first mass-preserving field before progressive
          refinement begins.
        </AtlasNotice>
      ) : null}

      {gpuError === undefined &&
      failedTile === undefined &&
      snapshot.phase === "ready" &&
      snapshot.deliveredPointCount === 0 ? (
        <AtlasNotice title="Empty Atlas field">
          The visible frontier is complete but contains no delivered
          representatives. Pan, zoom out, or inspect the active generation.
        </AtlasNotice>
      ) : null}

      {debugFraming ? (
        <aside className="atlas-debug-legend" aria-label="Tile frame legend">
          <span className="atlas-legend-item" data-state="active">
            <span className="atlas-legend-mark" aria-hidden="true" />
            A active
          </span>
          <span className="atlas-legend-item" data-state="loading">
            <span className="atlas-legend-mark" aria-hidden="true" />
            L loading
          </span>
          <span className="atlas-legend-item" data-state="queued">
            <span className="atlas-legend-mark" aria-hidden="true" />
            Q queued
          </span>
        </aside>
      ) : null}

      <p className="atlas-footnote" aria-hidden="true">
        Drag to pan · scroll or +/− to zoom · arrows pan · Home resets
      </p>
    </main>
  );
};
