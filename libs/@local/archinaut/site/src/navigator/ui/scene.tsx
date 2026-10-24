/**
 * The drawing's React side: a canvas the renderer paints, handed a frame
 * whenever the view state changes, and the few controls over it. Layout,
 * emphasis and page links are computed here; motion and pointer work are
 * the renderer's.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  isInterface,
  isLayer,
  shortName,
  summaryOf,
  type GraphNode,
} from "../model/graph";
import { focusLayout } from "../model/layout/focus-layout";
import { mapLayout } from "../model/layout/map-layout";
import { boundsOf, type Box } from "../model/layout/types";
import { pageSlugOf } from "../model/pages";
import {
  domainMembers,
  neighbourhood,
  projectEdges,
  searchMatches,
} from "../model/projections";
import { fitAll, focusOn, select } from "../view-state";
import { useNavigator } from "./navigator-context";
import {
  createRenderer,
  type Frame,
  type Renderer,
  type SceneNode,
} from "./scene/renderer";
import { familyOfNode } from "./scene/theme";

const transportGlyph: Record<string, string> = {
  call: "ƒ",
  postMessage: "⇄",
  "stdio-jsonl": "⌘",
  http: "⌁",
  registration: "⊕",
  "pyodide-fs": "⧉",
};

/** A small region still shows some of its surroundings. */
const minimumRegionWidth = 900;

const widened = (box: Box, width: number): Box => {
  if (box.width >= width) {
    return box;
  }
  const grow = (width - box.width) / 2;
  return {
    x: box.x - grow,
    y: box.y - (grow * box.height) / box.width,
    width,
    height: box.height + (2 * grow * box.height) / box.width,
  };
};

const kindOf = (node: GraphNode): SceneNode["kind"] =>
  isInterface(node) ? "interface" : isLayer(node) ? "layer" : "external";

export const Scene = ({ children }: { children?: React.ReactNode }) => {
  const { index, pages, state, update, open } = useNavigator();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [aspect, setAspect] = useState(16 / 9);

  // The renderer keys its glide on the identity of the frame's nodes, so
  // the layouts stay memoised by hand: a rebuilt map every render would
  // restart the glide every time.
  const edges = useMemo(() => projectEdges(index), [index]);
  const baseLayout = useMemo(() => mapLayout(index, aspect), [index, aspect]);
  const layout = useMemo(
    () =>
      state.mode === "focus" && state.focus !== null
        ? focusLayout(
            index,
            state.focus,
            neighbourhood(index, state.focus, edges),
          )
        : baseLayout,
    [index, state.mode, state.focus, edges, baseLayout],
  );
  const nodes = useMemo(() => {
    const result = new Map<string, SceneNode>();
    for (const [id, box] of layout.nodes) {
      const node = index.nodes.get(id);
      if (node === undefined) {
        continue;
      }
      const slug = pageSlugOf(id);
      result.set(id, {
        ...box,
        id,
        kind: kindOf(node),
        family: familyOfNode(id, kindOf(node)),
        label: isInterface(node)
          ? `${transportGlyph[node.transport] ?? "ƒ"} ${node.name}`
          : shortName(node),
        facts: box.container
          ? null
          : isLayer(node)
            ? `${node.fileCount} files · ${node.lineCount} lines`
            : isInterface(node)
              ? null
              : "outside the codebase",
        tooltip: `${isLayer(node) ? node.id : node.name}\n${summaryOf(node)}`,
        hasPage: slug !== null && pages.has(slug),
      });
    }
    return result;
  }, [layout, index, pages]);

  const region = state.mode === "map" ? state.region : null;
  const regionBox = region === null ? undefined : layout.nodes.get(region);
  const fitTo =
    regionBox === undefined
      ? boundsOf(layout.nodes.values(), 48)
      : widened(boundsOf([regionBox], 60), minimumRegionWidth);
  const fitKey = `${state.mode}:${state.focus ?? ""}:${region ?? ""}`;

  const domain = domainMembers(index, state.tags);
  const matches = searchMatches(index, state.query);
  const members =
    domain === null && matches === null
      ? null
      : new Set(
          [...nodes.keys()].filter(
            (id) =>
              (domain === null || domain.has(id)) &&
              (matches === null || matches.has(id)),
          ),
        );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return undefined;
    }
    const renderer = createRenderer(canvas, {
      onSelect: (id) => update((current) => select(current, id)),
      onActivate: (id) => {
        const slug = pageSlugOf(id);
        if (slug !== null && pages.has(slug)) {
          open(slug);
        } else {
          update((current) => focusOn(current, id));
        }
      },
    });
    rendererRef.current = renderer;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry?.contentRect ?? { width: 0, height: 0 };
      if (width > 0 && height > 0) {
        setAspect(Math.round((width / height) * 4) / 4);
        renderer.resize();
      }
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [update, open, pages]);

  // The frame is the renderer's input; it repaints on its own schedule.
  useEffect(() => {
    const frame: Frame = {
      nodes,
      edges,
      members,
      selected: state.selected,
      focus: state.mode === "focus" ? state.focus : null,
      fitTo,
      fitKey,
    };
    rendererRef.current?.setFrame(frame);
  });

  return (
    <div className="nav-scene">
      <canvas ref={canvasRef} className="nav-canvas" />
      <div className="nav-scene-controls">
        <button
          type="button"
          className="nav-button"
          onClick={() => rendererRef.current?.zoomBy(1.4)}
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="nav-button"
          onClick={() => rendererRef.current?.zoomBy(1 / 1.4)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="nav-button"
          onClick={() => {
            update(fitAll);
            rendererRef.current?.fit();
          }}
          title="Fit the whole map"
        >
          Fit
        </button>
      </div>
      {children}
    </div>
  );
};
