import { useStore, useStoreApi } from "@xyflow/react";
import { use, useEffect, useLayoutEffect, useRef } from "react";

import { useArcLayerInput } from "./arc-layer-context";
import { ArcItem } from "./arc-layer/arc-item";
import { useArcGestures } from "./arc-layer/use-arc-gestures";
import { useArcLayerModel } from "./arc-layer/use-arc-layer-model";
import { usePortEnds } from "./arc-layer/use-port-ends";
import { ArcPulsesContext } from "./arc-pulses";

/**
 * Every arc of the net, drawn in one `svg`.
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
  const { shapes } = useArcLayerModel(scene, portEnds);
  const handlers = useArcGestures(gestures, shapes);
  const itemsRef = useRef<SVGGElement>(null);

  // The pulses are drawn outside React, on a firing: they are told which
  // arcs are on the page once the page has them, and where each one's pulse
  // goes.
  useLayoutEffect(() => {
    arcPulses.show({
      arcs: shapes,
      slotOf: (index) =>
        itemsRef.current?.children[index]?.querySelector(".arc-pulses") ?? null,
      viewport: () => store.getState(),
    });
  }, [arcPulses, shapes, store]);
  useEffect(() => () => arcPulses.show(null), [arcPulses]);

  return (
    <g ref={itemsRef} className="arc-items" {...handlers}>
      {shapes.map((shape) => (
        <ArcItem
          key={shape.id}
          shape={shape}
          selectable={!gestures.isAddMode}
          describedBy={describedBy}
        />
      ))}
    </g>
  );
};
