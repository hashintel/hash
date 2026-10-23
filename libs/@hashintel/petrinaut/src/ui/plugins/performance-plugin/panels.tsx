/**
 * @layerRoot ui.plugins.performance
 * @role Default performance panels consuming the read-only Plugin API
 */
import { useLayoutEffect, useRef } from "react";
import { RiCloseLine } from "react-icons/ri";

import { css } from "@hashintel/ds-helpers/css";

import {
  useStore,
  type PluginPerformance,
  type PluginPerformanceSnapshot,
} from "../../plugin";

const fpsColor = (fps: number) =>
  fps >= 50 ? "#3fb950" : fps >= 30 ? "#e3b341" : "#f85149";

const closeStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  borderRadius: "[6px]",
  cursor: "pointer",
  flexShrink: 0,
  _hover: { background: "[rgba(128, 128, 128, 0.18)]" },
  _focusVisible: { outline: "[2px solid #6b8aff]", outlineOffset: "[2px]" },
});

const FpsHistory = ({
  frames,
}: {
  frames: PluginPerformanceSnapshot["frames"];
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    const ratio = window.devicePixelRatio;
    canvas.width = 190 * ratio;
    canvas.height = 46 * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, 190, 46);
    for (let column = 0; column < 24; column++) {
      const sample = frames[frames.length - 24 + column];
      const filled =
        sample === undefined ? 0 : Math.min(6, Math.round(sample.fps / 10));
      for (let row = 0; row < 6; row++) {
        context.fillStyle =
          sample !== undefined && row < filled
            ? fpsColor(sample.fps)
            : "rgba(255,255,255,0.10)";
        context.fillRect(column * 8, 46 - (row + 1) * 8 + 2, 6, 6);
      }
    }
  }, [frames]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={css({ display: "block", width: "[190px]", height: "[46px]" })}
    />
  );
};

const FpsPanel = ({
  snapshot,
  onClose,
}: {
  snapshot: PluginPerformanceSnapshot;
  onClose: () => void;
}) => {
  const fps = snapshot.frames.at(-1)?.fps;
  return (
    <section
      aria-label="Browser FPS"
      className={css({
        pointerEvents: "auto",
        width: "[222px]",
        padding: "[12px 15px]",
        borderRadius: "[18px]",
        background: "[rgba(24,26,32,0.92)]",
        color: "[#f6f7f9]",
        border: "[1px solid rgba(255,255,255,0.10)]",
        boxShadow: "[0 6px 18px rgba(0,0,0,0.18)]",
        display: "flex",
        flexDirection: "column",
        gap: "[8px]",
      })}
    >
      <div
        className={css({ display: "flex", alignItems: "center", gap: "[6px]" })}
      >
        <span
          className={css({
            fontSize: "[22px]",
            lineHeight: "[1]",
            fontWeight: "semibold",
            fontVariantNumeric: "tabular-nums",
          })}
          style={{
            color: fps !== undefined && fps < 50 ? fpsColor(fps) : undefined,
          }}
        >
          {snapshot.hidden
            ? "Paused"
            : fps === undefined
              ? "–"
              : Math.round(fps)}
        </span>
        <span
          className={css({
            fontSize: "[11px]",
            color: "[rgba(255,255,255,0.65)]",
            flex: "1",
          })}
        >
          browser FPS
        </span>
        <button
          type="button"
          aria-label="Hide FPS counter"
          onClick={onClose}
          className={closeStyle}
        >
          <RiCloseLine />
        </button>
      </div>
      <FpsHistory frames={snapshot.frames} />
    </section>
  );
};

const InformationPanel = ({
  snapshot,
  showFps,
  setShowFps,
  onClose,
}: {
  snapshot: PluginPerformanceSnapshot;
  showFps: boolean;
  setShowFps: (value: boolean) => void;
  onClose: () => void;
}) => {
  const latest = snapshot.frames.at(-1);
  return (
    <section
      aria-label="Performance information"
      className={css({
        pointerEvents: "auto",
        width: "[390px]",
        maxWidth: "[100%]",
        padding: "[12px]",
        borderRadius: "[12px]",
        background: "[#fff]",
        color: "[#252833]",
        border: "[1px solid #dce0e6]",
        boxShadow: "[0 6px 18px rgba(0,0,0,0.12)]",
        fontSize: "[11px]",
        lineHeight: "[1.5]",
      })}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "[8px]",
          marginBottom: "[8px]",
        })}
      >
        <h2
          className={css({
            fontSize: "[12px]",
            fontWeight: "semibold",
            flex: "1",
          })}
        >
          Performance
        </h2>
        <label
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "[5px]",
            cursor: "pointer",
          })}
        >
          <input
            type="checkbox"
            checked={showFps}
            onChange={(event) => setShowFps(event.target.checked)}
          />{" "}
          FPS counter
        </label>
        <button
          type="button"
          aria-label="Hide performance information"
          onClick={onClose}
          className={closeStyle}
        >
          <RiCloseLine />
        </button>
      </div>
      <div
        className={css({
          display: "flex",
          flexWrap: "wrap",
          columnGap: "[12px]",
          color: "[#596170]",
          marginBottom: "[8px]",
          fontVariantNumeric: "tabular-nums",
        })}
      >
        <span>
          Longest frame gap:{" "}
          <strong>
            {latest === undefined
              ? "–"
              : `${latest.longestFrameMs.toFixed(1)} ms`}
          </strong>
        </span>
        <span title="Measured synchronous collection and notification time in the preceding sample; excludes later rendering and browser work.">
          Collector: <strong>{snapshot.observerMs.toFixed(2)} ms</strong>
        </span>
      </div>
      <div className={css({ maxHeight: "[180px]", overflowY: "auto" })}>
        <table
          className={css({
            width: "[100%]",
            fontVariantNumeric: "tabular-nums",
            "& th, & td": {
              padding: "[4px 5px]",
              textAlign: "right",
              borderBottom: "[1px solid #eef0f3]",
            },
            "& th:first-child, & td:first-child": { textAlign: "left" },
            "& th": { color: "[#596170]", fontWeight: "medium" },
          })}
        >
          <thead>
            <tr>
              <th scope="col">Plugin</th>
              <th
                scope="col"
                title="Elapsed time from host creation to first contribution publication, including scheduling and waits."
              >
                First publish
              </th>
              <th
                scope="col"
                title="Average contribution publications per second during observation."
              >
                Publ./s
              </th>
              <th
                scope="col"
                title="Total React render milliseconds associated with committed updates during observation. Requires a profiling build."
              >
                React ms
              </th>
            </tr>
          </thead>
          <tbody>
            {snapshot.plugins.map((plugin) => (
              <tr key={plugin.id}>
                <td
                  title={`${plugin.id} · ${plugin.profiledCommits} profiled commits`}
                >
                  {plugin.name}
                </td>
                <td>
                  {plugin.firstPublicationMs === null
                    ? "Pending"
                    : `${plugin.firstPublicationMs.toFixed(1)} ms`}
                </td>
                <td>{plugin.publicationsPerSecond.toFixed(1)}</td>
                <td>
                  {plugin.renderMs === null ? "–" : plugin.renderMs.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {snapshot.plugins.length === 0 && (
        <p>
          {snapshot.hidden
            ? "Paused while this tab is hidden."
            : "Waiting for the first sample…"}
        </p>
      )}
      {snapshot.omittedPlugins > 0 && (
        <p>{snapshot.omittedPlugins} more plugins omitted.</p>
      )}
      <p className={css({ marginTop: "[8px]", color: "[#596170]" })}>
        {snapshot.reactProfiling === "observed"
          ? "React profiling callbacks received."
          : "React timings unavailable until profiling callbacks arrive. Standard production builds disable them."}
      </p>
      <details
        className={css({
          marginTop: "[6px]",
          color: "[#596170]",
          "& summary": { cursor: "pointer" },
          "& p": { marginTop: "[6px]" },
        })}
      >
        <summary>What these measurements mean</summary>
        <p>
          FPS counts browser animation callbacks. Gaps can include work anywhere
          on the page. The history keeps 24 samples, about six seconds; stalls
          extend that time.
        </p>
        <p>
          First publish is elapsed startup time, including scheduling and waits.
          Publications count changes sent by a plugin hook. Descendant updates
          can happen separately.
        </p>
        <p>
          React milliseconds measure render work associated with commits. They
          exclude commit-phase work, layout and paint. Component invocations and
          wasted renders are not measured.
        </p>
        <p>
          React Compiler can reuse output and calculations. Frequent updates
          alone do not prove a problem. This monitor includes its own activity;
          compare the same interaction with it off and on.
        </p>
        <p>
          Counts restart when monitoring resumes. Collector time covers
          synchronous sampling and listener delivery; later panel rendering and
          React profiling overhead add further cost.
        </p>
      </details>
    </section>
  );
};

export const PerformancePanels = ({
  performance,
  showFps,
  showInformation,
  setShowFps,
  hideInformation,
}: {
  performance: PluginPerformance;
  showFps: boolean;
  showInformation: boolean;
  setShowFps: (value: boolean) => void;
  hideInformation: () => void;
}) => {
  const snapshot = useStore(performance.snapshot);
  return (
    <div
      className={css({
        position: "absolute",
        left: "[16px]",
        bottom: "[16px]",
        zIndex: "banner",
        maxWidth: "[calc(100% - 32px)]",
        maxHeight: "[calc(100% - 80px)]",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "[8px]",
        pointerEvents: "none",
      })}
    >
      {showInformation && (
        <InformationPanel
          snapshot={snapshot}
          showFps={showFps}
          setShowFps={setShowFps}
          onClose={hideInformation}
        />
      )}
      {showFps && (
        <FpsPanel snapshot={snapshot} onClose={() => setShowFps(false)} />
      )}
    </div>
  );
};
