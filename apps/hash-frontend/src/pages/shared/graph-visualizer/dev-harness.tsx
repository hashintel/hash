/**
 * Dev harness for {@link EntityGraphVisualizer}: renders the visualizer against a synthetic
 * fixture driven by UI knobs, so the visualizer can be iterated on without navigating to the
 * entities page and creating real entities.
 *
 * Two feed modes:
 * - all-at-once: every fixture entity is handed to the visualizer immediately.
 * - streaming: entities are revealed in chunks over time (and `rootEntityIds` grows alongside), to
 * reproduce the incremental/absorb path (warm re-settling, hub-labels during load).
 */
import { Box } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LoadingSpinner } from "@hashintel/design-system";

import { VizConfigPanel } from "./components/dev-harness-config-panel";
import { ControlsPanel } from "./components/dev-harness-controls-panel";
import { defaultVizConfig } from "./config";
import { generateGraphFixture } from "./dev-harness/generate-fixture";
import { EntityGraphVisualizer } from "./entity-graph-visualizer";

import type { HarnessKnobs } from "./components/dev-harness-controls-panel";
import type { VizConfig } from "./config";
import type { GraphFixture } from "./dev-harness/generate-fixture";
import type { Scene } from "./render/scene";
import type { LayerKind } from "./render/scene/layer-kinds";
import type { WorkerHandle } from "./render/worker-connection";
import type { EntityId } from "@blockprotocol/type-system";

/** Render-bench capture length. Long enough for ~10 deck metric samples. */
const RENDER_BENCH_DURATION_MS = 10_000;
/** Cadence of the scripted camera sweep during the bench. */
const RENDER_BENCH_SWEEP_INTERVAL_MS = 90;
/** Per-step zoom amplitude of the sweep sinusoid. */
const RENDER_BENCH_SWEEP_ZOOM_STEP = 0.12;
/**
 * Wait for the fit-to-content transition (240 ms) before a sweep capture
 * starts, so the fit animation itself is not measured.
 */
const RENDER_BENCH_FIT_SETTLE_MS = 400;

const DEFAULT_KNOBS: HarnessKnobs = {
  entityCount: 200,
  entityTypeCount: 4,
  linkDensity: 1.2,
  rootFraction: 0.7,
  hubCount: 4,
  stream: false,
  chunkSize: 10,
  intervalMs: 150,
};

/** How much of the fixture is currently revealed to the visualizer. */
interface FeedState {
  /** Count of node entities revealed; roots grow with this count when streaming. */
  readonly revealedNodes: number;
  /** Count of link entities revealed. */
  readonly revealedLinks: number;
}

export const DevHarness = () => {
  const [knobs, setKnobs] = useState<HarnessKnobs>(DEFAULT_KNOBS);
  const [seed, setSeed] = useState(1);

  // The full worker config, driven by the config panel's knobs. The revision
  // counter keys the visualizer: ingest is additive, so each applied config
  // change remounts it (fresh worker, re-init with the new config, re-ingest).
  const [layoutConfig, setLayoutConfig] = useState<VizConfig>(defaultVizConfig);
  const [configRevision, setConfigRevision] = useState(0);
  const handleApplyConfig = useCallback((next: VizConfig) => {
    setLayoutConfig(next);
    setConfigRevision((previous) => previous + 1);
  }, []);

  // The fixture is regenerated only when a fixture-shaping knob (or seed) changes; the streaming
  // knobs (chunk size, interval) drive the feed, not the fixture.
  const fixture = useMemo<GraphFixture>(
    () =>
      generateGraphFixture({
        entityCount: knobs.entityCount,
        entityTypeCount: knobs.entityTypeCount,
        linkDensity: knobs.linkDensity,
        rootFraction: knobs.rootFraction,
        hubCount: knobs.hubCount,
        seed,
      }),
    [
      knobs.entityCount,
      knobs.entityTypeCount,
      knobs.linkDensity,
      knobs.rootFraction,
      knobs.hubCount,
      seed,
    ],
  );

  // Separate nodes from links so streaming can reveal nodes first, then their links, and grow the
  // root set against the revealed nodes (links are never roots).
  const { nodes, links, nodeIdOrder } = useMemo(() => {
    const nodeList = fixture.entities.filter(
      (entity) => entity.linkData === undefined,
    );
    const linkList = fixture.entities.filter(
      (entity) => entity.linkData !== undefined,
    );
    return {
      nodes: nodeList,
      links: linkList,
      nodeIdOrder: nodeList.map((entity) => entity.metadata.recordId.entityId),
    };
  }, [fixture]);

  const [feed, setFeed] = useState<FeedState>({
    revealedNodes: 0,
    revealedLinks: 0,
  });

  // Reset the feed whenever the fixture or feed mode changes: all-at-once reveals everything,
  // streaming starts from zero and grows via the interval below.
  useEffect(() => {
    if (knobs.stream) {
      setFeed({ revealedNodes: 0, revealedLinks: 0 });
    } else {
      setFeed({ revealedNodes: nodes.length, revealedLinks: links.length });
    }
  }, [knobs.stream, nodes.length, links.length]);

  // Keep the latest chunk size in a ref so the interval reads it without re-subscribing each change.
  const chunkSizeRef = useRef(knobs.chunkSize);
  chunkSizeRef.current = knobs.chunkSize;

  // Streaming reveal: every `intervalMs`, reveal another chunk of nodes (then links once nodes are
  // exhausted), until the whole fixture is shown. Re-armed on fixture / interval / mode change.
  useEffect(() => {
    if (!knobs.stream) {
      return;
    }
    const handle = setInterval(() => {
      setFeed((previous) => {
        const chunk = chunkSizeRef.current;
        if (previous.revealedNodes < nodes.length) {
          return {
            ...previous,
            revealedNodes: Math.min(
              nodes.length,
              previous.revealedNodes + chunk,
            ),
          };
        }
        if (previous.revealedLinks < links.length) {
          return {
            ...previous,
            revealedLinks: Math.min(
              links.length,
              previous.revealedLinks + chunk,
            ),
          };
        }
        return previous;
      });
    }, knobs.intervalMs);
    return () => {
      clearInterval(handle);
    };
  }, [knobs.stream, knobs.intervalMs, nodes.length, links.length]);

  // The entities + roots actually handed to the visualizer this render, sliced to the revealed
  // counts. The visualizer's ingest is additive (it only sends the delta), so growing these arrays
  // reproduces the incremental absorb path.
  const { visibleEntities, visibleRootIds } = useMemo(() => {
    const revealedNodes = nodes.slice(0, feed.revealedNodes);
    const revealedLinks = links.slice(0, feed.revealedLinks);
    const revealedNodeIds = new Set(nodeIdOrder.slice(0, feed.revealedNodes));
    const roots = fixture.rootEntityIds.filter((id) => revealedNodeIds.has(id));
    const safeRoots =
      roots.length > 0
        ? roots
        : revealedNodes
            .slice(0, 1)
            .map((entity) => entity.metadata.recordId.entityId);
    return {
      visibleEntities: [...revealedNodes, ...revealedLinks],
      visibleRootIds: safeRoots,
    };
  }, [nodes, links, nodeIdOrder, feed, fixture.rootEntityIds]);

  const handleRegenerate = useCallback(() => {
    setSeed((previous) => previous + 1);
  }, []);

  // Debug hook: exposes the live worker handle so Capture can download a replayable
  // layout fixture (positions, radii, edges, Louvain communities).
  const workerHandleRef = useRef<WorkerHandle | undefined>(undefined);
  const handleWorkerHandle = useCallback((handle: WorkerHandle | undefined) => {
    workerHandleRef.current = handle;
  }, []);
  const handleCaptureFixture = useCallback(() => {
    void workerHandleRef.current?.captureLayoutFixture().then((captured) => {
      if (!captured) {
        // eslint-disable-next-line no-console -- dev harness affordance
        console.warn(
          "capture-layout-fixture: no flat-tier layout live (hierarchical mode or empty graph)",
        );
        return;
      }
      const json = JSON.stringify(captured);
      // eslint-disable-next-line no-console -- dev harness affordance (console-copyable)
      console.log("capture-layout-fixture JSON (also downloaded):", json);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `graph-fixture-${captured.nodes.length}n-${captured.edges.length}e.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }, []);

  // render-bench hook: the visualizer surfaces its Scene here so the bench button can
  // capture deck stats + layer-push timings under a scripted zoom sweep. The report JSON
  // lands in the console; the summary line shows fps | frame p95/hitches | attrs ms/s |
  // rebuild p95. Key fields: frames.p95Ms/hitchCount (rAF cadence -- felt smoothness),
  // rebuild.p95Ms (main-thread layer rebuild), deck.updateAttributesTime (Deck's
  // deferred attribute regen), deck.fps/cpuTimePerFrame. Compare runs only at matching
  // zoom envelopes; settled vs under-load sweeps measure different things.
  const sceneRef = useRef<Scene | null>(null);
  // GPU-cost bisection state: kinds currently hidden from every render pass.
  // Kept in a ref too so a scene remount re-applies the selection.
  const [hiddenLayerKinds, setHiddenLayerKinds] = useState<
    readonly LayerKind[]
  >([]);
  const hiddenLayerKindsRef = useRef(hiddenLayerKinds);
  const handleSceneReady = useCallback((scene: Scene | null) => {
    sceneRef.current = scene;
    scene?.setHiddenLayerKinds(hiddenLayerKindsRef.current);
  }, []);
  const handleToggleLayerKind = useCallback((kind: LayerKind) => {
    setHiddenLayerKinds((current) => {
      const next = current.includes(kind)
        ? current.filter((hidden) => hidden !== kind)
        : [...current, kind];
      hiddenLayerKindsRef.current = next;
      sceneRef.current?.setHiddenLayerKinds(next);
      return next;
    });
  }, []);
  const [renderBenchStatus, setRenderBenchStatus] = useState<string>();
  const benchTimersRef = useRef<{
    fit?: number;
    sweep?: number;
    stop?: number;
  }>({});
  useEffect(
    () => () => {
      window.clearTimeout(benchTimersRef.current.fit);
      window.clearInterval(benchTimersRef.current.sweep);
      window.clearTimeout(benchTimersRef.current.stop);
    },
    [],
  );
  const runRenderBench = useCallback((sweep: boolean) => {
    const scene = sceneRef.current;
    if (!scene || scene.renderCapturing) {
      return;
    }
    // Reports are compared across bisection runs, so each one is labelled
    // with the layer kinds hidden while it was captured.
    const hiddenLabel =
      hiddenLayerKindsRef.current.length === 0
        ? "all layers"
        : `hidden: ${[...hiddenLayerKindsRef.current].sort().join("+")}`;
    setRenderBenchStatus(
      `capturing ${RENDER_BENCH_DURATION_MS / 1000}s (${sweep ? "zoom sweep" : "pinned camera"}, ${hiddenLabel})...`,
    );
    const beginCapture = () => {
      const liveScene = sceneRef.current;
      if (!liveScene || liveScene.renderCapturing) {
        return;
      }
      liveScene.startRenderCapture();
      const benchStart = performance.now();
      if (sweep) {
        benchTimersRef.current.sweep = window.setInterval(() => {
          // Slow zoom oscillation: crosses LOD/label buckets both ways, exercising
          // layer rebuilds the way interactive use does, but reproducibly.
          const phase = (performance.now() - benchStart) / 700;
          sceneRef.current?.zoomBy(
            Math.sin(phase) * RENDER_BENCH_SWEEP_ZOOM_STEP,
          );
        }, RENDER_BENCH_SWEEP_INTERVAL_MS);
      }
      benchTimersRef.current.stop = window.setTimeout(() => {
        window.clearInterval(benchTimersRef.current.sweep);
        const stopScene = sceneRef.current;
        if (!stopScene) {
          setRenderBenchStatus("scene remounted mid-capture; rerun");
          return;
        }
        const report = stopScene.stopRenderCapture();
        if (sweep) {
          // A pinned capture keeps the camera the user framed; only the sweep
          // needs to restore the view it disturbed.
          stopScene.fitToContent();
        }
        // eslint-disable-next-line no-console -- dev harness affordance (console-copyable)
        console.log(
          `render-bench report (${sweep ? "sweep" : "pinned"}, ${hiddenLabel}):`,
          JSON.stringify(report, null, 2),
        );
        const gpuSummary = report.gpu.available
          ? `gpu p95 ${report.gpu.p95Ms.toFixed(1)}ms max ${report.gpu.maxMs.toFixed(0)}ms (${report.gpu.samples}x)`
          : "gpu n/a";
        setRenderBenchStatus(
          `${hiddenLabel} | fps ${report.deck.fps.toFixed(0)} | frame p95 ${report.frames.p95Ms.toFixed(1)}ms, ` +
            `${report.frames.hitchCount} hitch${report.frames.hitchCount === 1 ? "" : "es"} (max ${report.frames.maxMs.toFixed(0)}ms) | ` +
            `${gpuSummary} | ` +
            `attrs ${report.deck.updateAttributesTime.toFixed(1)}ms/s | ` +
            `rebuild p95 ${report.rebuild.p95Ms.toFixed(2)}ms (${report.rebuild.count}x) | ` +
            `zoom ${report.camera.initialZoom.toFixed(1)} [${report.camera.minZoom.toFixed(1)}..${report.camera.maxZoom.toFixed(1)}]`,
        );
      }, RENDER_BENCH_DURATION_MS);
    };
    if (sweep) {
      // Every sweep starts from the same data-derived anchor (after its
      // 240 ms transition settles): the largest bubble, framed to fill the
      // view. That keeps the zoom envelope deterministic -- bisection runs
      // (hide one kind, re-run) compare like with like -- AND parks the
      // sweep on the fill-heaviest region, so the zoom-in crest dives into
      // the big bubble instead of whatever happened to sit at the viewport
      // centre. (Fit-to-content alone was deterministic but zoomed into
      // the graph's midpoint, missing an off-centre worst case.) A pinned
      // capture keeps the camera exactly as the user framed it.
      scene.frameLargestBubble();
      benchTimersRef.current.fit = window.setTimeout(
        beginCapture,
        RENDER_BENCH_FIT_SETTLE_MS,
      );
    } else {
      beginCapture();
    }
  }, []);
  const handleRunRenderBench = useCallback(
    () => runRenderBench(true),
    [runRenderBench],
  );
  // Pinned variant: no scripted camera. Zoom/frame the worst case first, then
  // capture -- isolates fill-rate cost at that exact viewport from the
  // rebuild/LOD churn a sweep adds (see PERFORMANCE.md section 7.1).
  const handleRunRenderBenchPinned = useCallback(
    () => runRenderBench(false),
    [runRenderBench],
  );

  // Frontier expand fetches against the live API; with synthetic ids that fetch no-ops (the dev
  // entities do not exist server-side), so clicking a frontier node simply logs and does nothing
  // further -- that is expected here.
  const handleEntityClick = useCallback((entityId: EntityId) => {
    // eslint-disable-next-line no-console -- dev harness affordance
    console.log("dev-harness onEntityClick", entityId);
  }, []);

  const handleOpenLinkTable = useCallback(
    (linkEntityIds: readonly EntityId[]) => {
      // eslint-disable-next-line no-console -- dev harness affordance
      console.log("dev-harness onOpenLinkTable", linkEntityIds);
    },
    [],
  );

  // Remount the visualizer (fresh worker, cleared graph) whenever the fixture identity, feed mode,
  // or applied config changes. Ingest is additive, so without a remount a regenerated fixture would
  // pile its entities onto the previous graph instead of replacing it -- so the key must include
  // every fixture-shaping knob, not just seed/stream (changing any of these sliders regenerates the
  // fixture too).
  const visualizerKey = [
    seed,
    knobs.entityCount,
    knobs.entityTypeCount,
    knobs.linkDensity,
    knobs.rootFraction,
    knobs.hubCount,
    knobs.stream,
    configRevision,
  ].join(":");

  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
      <ControlsPanel
        knobs={knobs}
        onChange={setKnobs}
        onRegenerate={handleRegenerate}
        onCaptureFixture={handleCaptureFixture}
        onRunRenderBench={handleRunRenderBench}
        onRunRenderBenchPinned={handleRunRenderBenchPinned}
        hiddenLayerKinds={hiddenLayerKinds}
        onToggleLayerKind={handleToggleLayerKind}
        renderBenchStatus={renderBenchStatus}
        streamedCount={visibleEntities.length}
        totalCount={fixture.entities.length}
        seed={seed}
      />
      <VizConfigPanel value={layoutConfig} onApply={handleApplyConfig} />
      <EntityGraphVisualizer
        key={visualizerKey}
        config={layoutConfig}
        entities={visibleEntities}
        rootEntityIds={visibleRootIds}
        closedMultiEntityTypesRootMap={fixture.closedMultiEntityTypesRootMap}
        definitions={fixture.definitions}
        loadingComponent={<LoadingSpinner size={42} />}
        onEntityClick={handleEntityClick}
        onOpenLinkTable={handleOpenLinkTable}
        onWorkerHandle={handleWorkerHandle}
        onSceneReady={handleSceneReady}
      />
    </Box>
  );
};
