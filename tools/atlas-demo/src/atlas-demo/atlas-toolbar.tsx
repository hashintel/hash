import type { AtlasSession } from "../atlas-client";
import type { AtlasFrontierSnapshot } from "../atlas-frontier";

const integerFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

interface AtlasToolbarProps {
  readonly debugFraming: boolean;
  readonly gpuError?: string;
  readonly onDebugFramingChange: (enabled: boolean) => void;
  readonly onReload: () => void;
  readonly onResetView: () => void;
  readonly onRetryTiles: () => void;
  readonly session: AtlasSession;
  readonly snapshot: AtlasFrontierSnapshot;
}

const connectionState = (
  snapshot: AtlasFrontierSnapshot,
  gpuError?: string,
): {
  readonly label: string;
  readonly state: "error" | "loading" | "ready";
} => {
  if (gpuError !== undefined || snapshot.phase === "error") {
    return { label: "Attention required", state: "error" };
  }
  if (snapshot.activeTiles.length === 0) {
    return { label: "Loading root", state: "loading" };
  }
  if (snapshot.phase === "loading") {
    return {
      label: `Refining z${snapshot.targetZoom}`,
      state: "loading",
    };
  }
  return { label: `Ready at z${snapshot.targetZoom}`, state: "ready" };
};

/** Compact engineering controls and live Atlas readouts. */
export const AtlasToolbar = ({
  debugFraming,
  gpuError,
  onDebugFramingChange,
  onReload,
  onResetView,
  onRetryTiles,
  session,
  snapshot,
}: AtlasToolbarProps) => {
  const connection = connectionState(snapshot, gpuError);

  return (
    <header className="atlas-toolbar" aria-label="Atlas field controls">
      <div className="atlas-title-group">
        <h1 className="atlas-title">Atlas tile field</h1>
        <span className="atlas-subtitle">ATLTILE2 / total</span>
      </div>

      <dl className="atlas-readouts">
        <div className="atlas-readout">
          <dt>Connection</dt>
          <dd>
            <span className="atlas-state" data-state={connection.state}>
              {connection.label}
            </span>
          </dd>
        </div>
        <div className="atlas-readout">
          <dt>Generation / variant</dt>
          <dd title={`${session.generation} / ${session.variant}`}>
            {session.generation.slice(0, 8)} / {session.variant}
          </dd>
        </div>
        <div className="atlas-readout">
          <dt>Active / cached tiles</dt>
          <dd>
            {integerFormat.format(snapshot.activeTiles.length)} /{" "}
            {integerFormat.format(snapshot.cache.tileCount)}
          </dd>
        </div>
        <div className="atlas-readout">
          <dt>Delivered points</dt>
          <dd>{integerFormat.format(snapshot.deliveredPointCount)}</dd>
        </div>
      </dl>

      <div className="atlas-controls">
        <label className="atlas-toggle">
          <input
            type="checkbox"
            checked={debugFraming}
            onChange={(event) =>
              onDebugFramingChange(event.currentTarget.checked)
            }
          />
          <span>Tile frames</span>
        </label>
        {snapshot.failures.length > 0 ? (
          <button type="button" onClick={onRetryTiles}>
            Retry tiles
          </button>
        ) : null}
        <button type="button" onClick={onResetView}>
          Reset view
        </button>
        <button type="button" onClick={onReload}>
          Reload
        </button>
      </div>
    </header>
  );
};
