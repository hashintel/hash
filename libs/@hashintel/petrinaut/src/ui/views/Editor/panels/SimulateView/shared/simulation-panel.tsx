import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useSimulationWorkspaceContainer } from "../../../shared/simulation-workspace-context";
import {
  PanelBody,
  PanelFooter,
  PanelHeader,
} from "./simulation-panel/panel-chrome";
import { PanelContent } from "./simulation-panel/panel-content";
import {
  PanelExitingContext,
  panelExitDuration,
  type SimulationPanelProps,
} from "./simulation-panel/panel-context";
import { useAnimationsEnabled } from "./use-animations-enabled";

export const SimulationPanel = (props: SimulationPanelProps) => {
  const container = useSimulationWorkspaceContainer();
  if (container === null) {
    return null;
  }
  const panel = <PanelContent {...props} />;
  return container === undefined ? panel : createPortal(panel, container);
};

SimulationPanel.Header = PanelHeader;
SimulationPanel.Body = PanelBody;
SimulationPanel.Footer = PanelFooter;

export const SimulationPanelPresence = ({
  children,
}: {
  children: ReactNode;
}) => {
  const animate = useAnimationsEnabled();
  const [retained, setRetained] = useState(children);
  const present =
    children !== null && children !== undefined && children !== false;
  if (present && retained !== children) {
    setRetained(children);
  }
  useEffect(() => {
    if (present || retained === null) {
      return;
    }
    const timer = setTimeout(
      () => setRetained(null),
      animate ? panelExitDuration : 0,
    );
    return () => clearTimeout(timer);
  }, [present, retained, animate]);
  return (
    <PanelExitingContext value={!present}>
      {present ? children : animate ? retained : null}
    </PanelExitingContext>
  );
};
