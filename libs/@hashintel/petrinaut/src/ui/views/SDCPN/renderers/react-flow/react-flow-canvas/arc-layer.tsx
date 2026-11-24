import { useStore, useStoreApi } from "@xyflow/react";
import { use, useEffect, useLayoutEffect, useRef } from "react";

import { useAnimationsEnabled } from "../../../../shared/use-animations-enabled";
import { useArcLayerInput } from "./arc-layer-context";
import { ArcItem } from "./arc-layer/arc-item";
import { ArcRunStrokes } from "./arc-layer/arc-run-strokes";
import { pulseHolderOf } from "./arc-layer/pulse-holder";
import { useArcGestures } from "./arc-layer/use-arc-gestures";
import { useArcLayerModel } from "./arc-layer/use-arc-layer-model";
import { usePortEnds } from "./arc-layer/use-port-ends";
import { ArcPulsesContext } from "./arc-pulses";

/**
 * Every arc of the net in one `svg`, as the one edge of React Flow's type
 * `arcs`: arc-layer.mdx. The scene comes by context, not by the edge's props.
 *
 * The items, the runs, the merged strokes of a run and the arcs that draw
 * their own are memoised by hand: the layer renders on every frame of a drag,
 * and the compiler does not skip the items of a list whose parent renders.
 * An arc or a run that draws the same is the same object.
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
  // goes.
  useLayoutEffect(() => {
    arcPulses.show({
      arcs: shapes,
      holderOf: (index) => {
        const shape = shapes[index];
        return shape ? pulseHolderOf(runsRef.current, shape, index) : null;
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
