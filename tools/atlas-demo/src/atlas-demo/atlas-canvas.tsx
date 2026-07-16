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

import { ATLAS_WORLD_SIZE, type AtlasSession } from "../atlas-client";
import {
  AtlasFieldEffect,
  AtlasFieldLayer,
  createAtlasFieldRenderState,
} from "../atlas-field";
import {
  AtlasFrontier,
  atlasFitZoom,
  type AtlasFrontierSnapshot,
} from "../atlas-frontier";
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

const fittedCamera = ({ width, height }: CanvasSize): AtlasCameraState => ({
  maxZoom: 8,
  minZoom: -16,
  target: [ATLAS_WORLD_SIZE / 2, ATLAS_WORLD_SIZE / 2, 0],
  zoom: atlasFitZoom(width, height),
});

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const firstFailure = (
  snapshot: AtlasFrontierSnapshot,
): AtlasFrontierSnapshot["failures"][number] | undefined =>
  snapshot.failures[0];

/** Interactive deck.gl surface for one immutable Atlas session. */
export const AtlasCanvas = ({ onReload, session }: AtlasCanvasProps) => {
  const [canvasSize, setCanvasSize] = useState(initialCanvasSize);
  const [camera, setCamera] = useState<AtlasCameraState>(() =>
    fittedCamera(initialCanvasSize()),
  );
  const [debugFraming, setDebugFraming] = useState(false);
  const [gpuError, setGpuError] = useState<string>();

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
        targetZoom: 0,
      }),
    [handleGpuError, renderState],
  );
  useEffect(() => {
    fieldEffect.setProps({
      activeTiles: snapshot.activeTiles,
      onError: handleGpuError,
      renderState,
      targetZoom: snapshot.targetZoom,
    });
  }, [
    fieldEffect,
    handleGpuError,
    renderState,
    snapshot.activeTiles,
    snapshot.targetZoom,
  ]);

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
    const fieldLayer = new AtlasFieldLayer({
      id: "atlas-field-composite",
      opacity: 1,
      renderState,
    });
    if (!debugFraming) {
      return [fieldLayer];
    }
    return [fieldLayer, ...createAtlasDebugLayers(snapshot.debugTiles)];
  }, [debugFraming, renderState, snapshot.debugTiles]);

  const resetView = useCallback(() => {
    setCamera(fittedCamera(canvasSize));
  }, [canvasSize]);

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
        debugFraming={debugFraming}
        gpuError={gpuError}
        onDebugFramingChange={setDebugFraming}
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
