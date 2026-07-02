/**
 * Dev harness for {@link EntityGraphVisualizerV2}: renders the visualizer against a synthetic
 * fixture driven by UI knobs, so the visualizer can be iterated on without navigating to the
 * entities page and creating real entities.
 *
 * Two feed modes:
 * - all-at-once: every fixture entity is handed to the visualizer immediately.
 * - streaming: entities are revealed in chunks over time (and `rootEntityIds` grows alongside), to
 *   reproduce the incremental/absorb path (FA2 settling, hub-labels during load).
 */
import { Box } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LoadingSpinner } from "@hashintel/design-system";

import { ControlsPanel } from "./components/dev-harness-controls-panel";
import { defaultVizConfig } from "./config";
import { generateGraphFixture } from "./dev-harness/generate-fixture";
import { EntityGraphVisualizerV2 } from "./entity-graph-visualizer";

import type { HarnessKnobs } from "./components/dev-harness-controls-panel";
import type { VizConfig } from "./config";
import type { GraphFixture } from "./dev-harness/generate-fixture";
import type { Scene } from "./render/scene";
import type { WorkerHandle } from "./render/worker-connection";
import type { EntityId } from "@blockprotocol/type-system";

/** Render-bench capture length. Long enough for ~10 deck metric samples. */
const RENDER_BENCH_DURATION_MS = 10_000;
/** Cadence of the scripted camera sweep during the bench. */
const RENDER_BENCH_SWEEP_INTERVAL_MS = 90;
/** Per-step zoom amplitude of the sweep sinusoid. */
const RENDER_BENCH_SWEEP_ZOOM_STEP = 0.12;

const DEFAULT_KNOBS: HarnessKnobs = {
  entityCount: 200,
  entityTypeCount: 4,
  linkDensity: 1.2,
  rootFraction: 0.7,
  hubCount: 4,
  // Stress baseline matching the StressLayout production defaults, so the initial view equals it.
  stressEngine: "stress",
  stressCommunityCohesion: 0.02,
  stressCommunitySeparation: 0.08,
  stressDegreeRepulsion: 0.02,
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

  // CAPTURE-LIVE-FIXTURE hook: the visualizer surfaces its worker handle here so the
  // capture button can serialize the LIVE layout graph (positions, radii, edges,
  // Louvain communities) to a JSON download + console copy. Replay it in benches or
  // tests via `forceGraphFromCapturedFixture` (worker/bench-fixtures.ts).
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

  // RENDER-BENCH hook: the visualizer surfaces its Scene here so the bench button can
  // capture deck stats + layer-push timings under a scripted zoom sweep. The report JSON
  // lands in the console; the summary line shows in the panel. See PERFORMANCE.md
  // ("Render benchmark") for how to read it and the budgets to hold.
  const sceneRef = useRef<Scene | null>(null);
  const handleSceneReady = useCallback((scene: Scene | null) => {
    sceneRef.current = scene;
  }, []);
  const [renderBenchStatus, setRenderBenchStatus] = useState<string>();
  const benchTimersRef = useRef<{ sweep?: number; stop?: number }>({});
  useEffect(
    () => () => {
      window.clearInterval(benchTimersRef.current.sweep);
      window.clearTimeout(benchTimersRef.current.stop);
    },
    [],
  );
  const handleRunRenderBench = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || scene.renderCapturing) {
      return;
    }
    setRenderBenchStatus(
      `capturing ${RENDER_BENCH_DURATION_MS / 1000}s (zoom sweep)...`,
    );
    scene.startRenderCapture();
    const benchStart = performance.now();
    benchTimersRef.current.sweep = window.setInterval(() => {
      // Slow zoom oscillation: crosses LOD/label buckets both ways, exercising
      // layer rebuilds the way interactive use does, but reproducibly.
      const phase = (performance.now() - benchStart) / 700;
      sceneRef.current?.zoomBy(Math.sin(phase) * RENDER_BENCH_SWEEP_ZOOM_STEP);
    }, RENDER_BENCH_SWEEP_INTERVAL_MS);
    benchTimersRef.current.stop = window.setTimeout(() => {
      window.clearInterval(benchTimersRef.current.sweep);
      const liveScene = sceneRef.current;
      if (!liveScene) {
        setRenderBenchStatus("scene remounted mid-capture; rerun");
        return;
      }
      const report = liveScene.stopRenderCapture();
      liveScene.fitToContent();
      // eslint-disable-next-line no-console -- dev harness affordance (console-copyable)
      console.log("render-bench report:", JSON.stringify(report, null, 2));
      setRenderBenchStatus(
        `fps ${report.deck.fps.toFixed(0)} | cpu/frame ${report.deck.cpuTimePerFrame.toFixed(1)}ms | ` +
          `push p95 ${report.layerPush.p95Ms.toFixed(2)}ms (${report.layerPush.count} pushes)`,
      );
    }, RENDER_BENCH_DURATION_MS);
  }, []);

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

  // Remount the visualizer (fresh worker, cleared graph) whenever the fixture identity or feed mode
  // changes. Ingest is additive, so without a remount a regenerated fixture would pile its entities
  // onto the previous graph instead of replacing it -- so the key must include EVERY fixture-shaping
  // knob, not just seed/stream (changing any of these sliders regenerates the fixture too).
  const visualizerKey = [
    seed,
    knobs.entityCount,
    knobs.entityTypeCount,
    knobs.linkDensity,
    knobs.rootFraction,
    knobs.hubCount,
    knobs.stressEngine,
    knobs.stressCommunityCohesion,
    knobs.stressCommunitySeparation,
    knobs.stressDegreeRepulsion,
    knobs.stream,
  ].join(":");

  // Default scale/cluster config plus the stress force overrides from the knobs. A change to any
  // stress knob also changes the key above, so the worker remounts and re-inits with the new forces.
  const layoutConfig = useMemo<VizConfig>(
    () => ({
      ...defaultVizConfig,
      stress: {
        engine: knobs.stressEngine,
        communityCohesion: knobs.stressCommunityCohesion,
        communitySeparation: knobs.stressCommunitySeparation,
        degreeRepulsion: knobs.stressDegreeRepulsion,
      },
    }),
    [
      knobs.stressEngine,
      knobs.stressCommunityCohesion,
      knobs.stressCommunitySeparation,
      knobs.stressDegreeRepulsion,
    ],
  );

  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
      <ControlsPanel
        knobs={knobs}
        onChange={setKnobs}
        onRegenerate={handleRegenerate}
        onCaptureFixture={handleCaptureFixture}
        onRunRenderBench={handleRunRenderBench}
        renderBenchStatus={renderBenchStatus}
        streamedCount={visibleEntities.length}
        totalCount={fixture.entities.length}
        seed={seed}
      />
      <EntityGraphVisualizerV2
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
