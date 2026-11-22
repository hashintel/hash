import { useStore, useStoreApi } from "@xyflow/react";
import { use, useEffect, useLayoutEffect, useRef } from "react";

import { useAnimationsEnabled } from "../../../../shared/use-animations-enabled";
import { useArcLayerInput } from "./arc-layer-context";
import { ArcItem } from "./arc-layer/arc-item";
import { ArcRunStrokes } from "./arc-layer/arc-run-strokes";
import { arcsPerRun } from "./arc-layer/arc-runs";
import { useArcGestures } from "./arc-layer/use-arc-gestures";
import { useArcLayerModel } from "./arc-layer/use-arc-layer-model";
import { usePortEnds } from "./arc-layer/use-port-ends";
import { ArcPulsesContext } from "./arc-pulses";

/**
 * Every arc of the net, drawn in one `svg`: the strokes of the arcs, run by
 * run, and above them one element per arc, which takes the focus and the
 * pointer for it.
 *
 * React Flow renders this as one edge, the first, so the arcs sit where its
 * edges sit: inside the pane, under the fusion links and the nodes, and
 * first in the order of the Tab key. It knows none of the arcs. What it did
 * for each is done here: the curve between the two ends, the element that
 * takes the focus and the pointer, and what a click, a hover and the keys
 * do. The props of the edge are not read: the scene comes by context.
 */
export const ArcLayer: React.FC = () => {
  const { scene, gestures } = useArcLayerInput();
  const store = useStoreApi();
  const arcPulses = use(ArcPulsesContext);
  const describedBy = useStore(
    (state) => `react-flow__edge-desc-${state.rfId}`,
  );
  const portEnds = usePortEnds(scene.arcs);
  const fades = useAnimationsEnabled();
  const { shapes, runs } = useArcLayerModel(scene, portEnds, fades);
  const handlers = useArcGestures(gestures, shapes);
  const runsRef = useRef<SVGGElement>(null);

  // The pulses are drawn outside React, on a firing: they are told which
  // arcs are on the page once the page has them, and where each one's pulse
  // goes. That is in the arc's run, under the arc's line: among the arc's
  // own strokes when it draws them, and under the merged ones otherwise.
  useLayoutEffect(() => {
    arcPulses.show({
      arcs: shapes,
      holderOf: (index) => {
        const shape = shapes[index];
        const run = runsRef.current?.children[Math.floor(index / arcsPerRun)];
        if (!shape || !run) {
          return null;
        }
        if (!shape.alone) {
          return run.firstElementChild;
        }
        const own = Array.from(run.children).find(
          (child) => child.getAttribute("data-arc") === shape.id,
        );
        return own?.querySelector(".arc-pulses") ?? null;
      },
      viewport: () => store.getState(),
    });
  }, [arcPulses, shapes, store]);
  useEffect(() => () => arcPulses.show(null), [arcPulses]);

  return (
    <>
      <g ref={runsRef} className="arc-runs">
        {runs.map((run, index) => (
          // eslint-disable-next-line react/no-array-index-key -- a run is its place among the runs: the arcs that many before it
          <ArcRunStrokes key={index} run={run} />
        ))}
      </g>
      <g className="arc-items" {...handlers}>
        {shapes.map((shape) => (
          <ArcItem
            key={shape.id}
            shape={shape}
            selectable={!gestures.isAddMode}
            describedBy={describedBy}
          />
        ))}
      </g>
    </>
  );
};
