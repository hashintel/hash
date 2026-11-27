import { lazy, Suspense } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { runningComponentOf } from "@hashintel/petrinaut-core";

import {
  useOpenExecutableNet,
  useOpenNetStatePath,
} from "../../../../../../react/document/use-composition-state";
import { useExecutableDefinition } from "../../../../../../react/document/use-executable-definition";
import { VisualizerLoading } from "../../../../../visualizer/visualizer-loading";

const NetStateVisualization = lazy(() =>
  import("../../../../../visualizer/net-state-visualization").then(
    (module) => ({ default: module.NetStateVisualization }),
  ),
);

/**
 * The panel under an instance's ports. It takes no pointer: a press on the
 * picture drags the card, as a press anywhere else on it does.
 */
const panelStyle = css({
  position: "relative",
  flexShrink: "0",
  // Under the ports, whatever rows they take.
  marginTop: "auto",
  overflow: "hidden",
  borderTop: "1px solid",
  borderTopColor: "neutral.s30",
  // The card's own corners: the card does not clip, for its pins.
  borderBottomLeftRadius: "lg",
  borderBottomRightRadius: "lg",
  pointerEvents: "none",
});

/**
 * The picture a component instance shows on its card: the visualizer of the
 * component it runs, drawn over the state of this instance alone. Two
 * instances of one component run the same code and show different tokens.
 */
export const InstanceVisualizer: React.FC<{
  instanceId: string;
  width: number;
  height: number;
}> = ({ instanceId, width, height }) => {
  const definition = useExecutableDefinition();
  const openNet = useOpenExecutableNet();
  // The open net's own state, then this instance inside it. An open
  // component that nothing instantiates has no state to show its instances.
  const openNetPath = useOpenNetStatePath();
  const net = openNet
    ? runningComponentOf(definition, openNet, instanceId)
    : null;

  return (
    <div className={panelStyle} style={{ height }}>
      {net ? (
        <Suspense fallback={<VisualizerLoading />}>
          <NetStateVisualization
            net={net}
            path={openNetPath === null ? null : [...openNetPath, instanceId]}
            // Less the line that parts the panel from the ports.
            size={{ width, height: height - 1 }}
          />
        </Suspense>
      ) : null}
    </div>
  );
};
