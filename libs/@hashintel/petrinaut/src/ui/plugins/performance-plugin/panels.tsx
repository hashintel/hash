/**
 * @layerRoot ui.plugins.performance
 * @role Collapsible performance monitor consuming the read-only Plugin API
 */
import {
  use,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import { css } from "@hashintel/ds-helpers/css";
import { ChevronDownIcon, CloseIcon } from "@hashintel/ds-icons";

import { UserSettingsContext } from "../../../react";
import {
  useStore,
  type PluginPerformance,
  type PluginPerformanceSnapshot,
} from "../../plugin";
import { Collapse, Disclosure } from "./panels/collapse";
import { useMonitorDrag } from "./panels/use-monitor-drag";

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

const subscribeToReducedMotion = (notify: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverReducedMotion = () => false;

const PerformanceDetails = ({
  snapshot,
  animate,
}: {
  snapshot: PluginPerformanceSnapshot;
  animate: boolean;
}) => {
  const latest = snapshot.frames.at(-1);
  return (
    <>
      <Disclosure title="Frame timing" animate={animate} initiallyOpen>
        <dl
          className={css({
            display: "grid",
            gridTemplateColumns: "[1fr auto]",
            gap: "[6px 12px]",
            "& dd": { color: "[#f6f7f9]", fontVariantNumeric: "tabular-nums" },
          })}
        >
          <dt>Longest frame gap</dt>
          <dd>
            {latest === undefined
              ? "–"
              : `${latest.longestFrameMs.toFixed(1)} ms`}
          </dd>
          <dt title="Measured synchronous collection and notification time in the preceding sample; excludes later rendering and browser work.">
            Collector · previous sample
          </dt>
          <dd>{snapshot.observerMs.toFixed(2)} ms</dd>
        </dl>
      </Disclosure>
      <Disclosure title="Plugin activity" animate={animate} initiallyOpen>
        <div className={css({ maxHeight: "[180px]", overflow: "auto" })}>
          <table
            className={css({
              width: "[100%]",
              fontVariantNumeric: "tabular-nums",
              "& td:not(:first-child)": { whiteSpace: "nowrap" },
              "& th, & td": {
                padding: "[4px 5px]",
                textAlign: "right",
                borderBottom: "[1px solid rgba(255,255,255,0.08)]",
              },
              "& th:first-child, & td:first-child": { textAlign: "left" },
              "& th": { color: "[#aeb7c6]", fontWeight: "medium" },
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
                    {plugin.renderMs === null
                      ? "–"
                      : plugin.renderMs.toFixed(1)}
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
        <p className={css({ marginTop: "[8px]", color: "[#aeb7c6]" })}>
          {snapshot.reactProfiling === "observed"
            ? "React profiling callbacks received."
            : "React timings unavailable until profiling callbacks arrive. Standard production builds disable them."}
        </p>
      </Disclosure>
      <Disclosure title="What these measurements mean" animate={animate}>
        <div className={css({ "& p + p": { marginTop: "[8px]" } })}>
          <p>
            FPS counts browser animation callbacks. Gaps can include work
            anywhere on the page. The history keeps 24 samples, about six
            seconds; stalls extend that time.
          </p>
          <p>
            First publish is elapsed startup time, including scheduling and
            waits. Publications count changes sent by a plugin hook. Descendant
            updates can happen separately.
          </p>
          <p>
            React milliseconds measure render work associated with commits. They
            exclude commit-phase work, layout and paint. Component invocations
            and wasted renders are not measured.
          </p>
          <p>
            React Compiler can reuse output and calculations. Frequent updates
            alone do not prove a problem. This monitor includes its own
            activity; compare the same interaction with it off and on.
          </p>
          <p>
            Counts restart when monitoring resumes. Collector time covers
            synchronous sampling and listener delivery; later monitor rendering
            and React profiling overhead add further cost.
          </p>
        </div>
      </Disclosure>
    </>
  );
};

export const PerformanceMonitor = ({
  performance,
  expanded,
  setExpanded,
  onClose,
}: {
  performance: PluginPerformance;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  onClose: () => void;
}) => {
  const { showAnimations } = use(UserSettingsContext);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    prefersReducedMotion,
    serverReducedMotion,
  );
  const animate = showAnimations && !reducedMotion;
  const { panelRef, dragging, position, expandedWidth, handleProps } =
    useMonitorDrag(() => setExpanded(!expanded));
  const snapshot = useStore(performance.snapshot);
  const detailsId = useId();
  const fps = snapshot.frames.at(-1)?.fps;
  return (
    <section
      aria-label="Performance monitor"
      ref={panelRef}
      data-animated={animate || undefined}
      data-dragging={dragging || undefined}
      className={css({
        position: "absolute",
        zIndex: "banner",
        maxWidth: "[calc(100% - 32px)]",
        maxHeight: "[calc(100% - 80px)]",
        overflowY: "auto",
        padding: "[12px 15px]",
        borderRadius: "[18px]",
        background: "[#181a20]",
        color: "[#f6f7f9]",
        colorScheme: "dark",
        border: "[1px solid rgba(255,255,255,0.10)]",
        boxShadow: "[0 6px 18px rgba(0,0,0,0.18)]",
        pointerEvents: "auto",
        "&[data-animated]:not([data-dragging])": {
          transition:
            "[width 220ms cubic-bezier(0.2, 0, 0, 1), left 220ms ease, bottom 220ms ease]",
        },
      })}
      style={{ ...position, width: expanded ? expandedWidth : 222 }}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "[6px]",
          marginBottom: "[8px]",
        })}
      >
        <button
          type="button"
          aria-label={
            expanded
              ? "Collapse performance details"
              : "Expand performance details"
          }
          aria-expanded={expanded}
          aria-controls={detailsId}
          {...handleProps}
          title="Drag to move; click to expand or collapse. Arrow keys move the focused header."
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "[6px]",
            flex: "1",
            minWidth: "[0]",
            textAlign: "left",
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
            "[data-dragging] &": { cursor: "grabbing" },
            borderRadius: "[6px]",
            _hover: { color: "[#fff]", background: "[rgba(255,255,255,0.06)]" },
            _focusVisible: {
              outline: "[2px solid #6b8aff]",
              outlineOffset: "[3px]",
            },
          })}
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
              color: "[#aeb7c6]",
              flex: "1",
            })}
          >
            browser FPS
          </span>
          <span
            className={css({ display: "flex" })}
            style={{
              transform: expanded ? "rotate(180deg)" : undefined,
              transition: animate ? "transform 220ms ease" : undefined,
            }}
          >
            <ChevronDownIcon size={16} />
          </span>
        </button>
        <button
          type="button"
          aria-label="Hide performance monitor"
          onClick={onClose}
          className={closeStyle}
        >
          <CloseIcon size={16} />
        </button>
      </div>
      <FpsHistory frames={snapshot.frames} />
      <Collapse id={detailsId} open={expanded} animate={animate}>
        <div
          className={css({
            fontSize: "[11px]",
            lineHeight: "[1.5]",
            color: "[#aeb7c6]",
          })}
          style={{ width: expandedWidth - 32 }}
        >
          <PerformanceDetails snapshot={snapshot} animate={animate} />
        </div>
      </Collapse>
    </section>
  );
};
