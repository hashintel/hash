/**
 * The Parameters band of a connected study: the collapsible frame band with
 * the help tooltip and the navigator's status line in its title row, then the
 * parameter controls across the body.
 */
import { optimizationBooleanIdentifiers } from "../../../../../../../react/optimizations/surface-grid";
import { FrameBand } from "../../shared/drawer-frame";
import {
  OptimizationNavigator,
  OptimizationNavigatorStatus,
} from "./optimization-navigator";

import type {
  ConnectedStudyState,
  OptimizationNavigation,
  OptimizationRecord,
} from "../../../../../../../react/optimizations/context";

const PARAMETERS_HELP =
  "The chart beside the surface shows the objective at this point. While the study runs and Follow steps is on, the point follows each step as it is evaluated and the controls only show it; turn Follow steps off, or wait for the study to finish, to move them and look elsewhere.";

export const NavigatorBand = ({
  optimization,
  connected,
  running,
  onNavigationChange,
}: {
  optimization: Pick<OptimizationRecord, "input" | "axes">;
  connected: ConnectedStudyState;
  /** Whether the study still evaluates steps the navigation can follow. */
  running: boolean;
  onNavigationChange: (patch: Partial<OptimizationNavigation>) => void;
}) => (
  <FrameBand
    title="Parameters"
    help={PARAMETERS_HELP}
    collapsible
    trailing={
      <OptimizationNavigatorStatus
        navigation={connected.navigation}
        selection={connected.selection}
        running={running}
        onNavigationChange={onNavigationChange}
      />
    }
  >
    <OptimizationNavigator
      axes={optimization.axes}
      booleanParameters={optimizationBooleanIdentifiers(optimization.input)}
      navigation={connected.navigation}
      running={running}
      onNavigationChange={onNavigationChange}
    />
  </FrameBand>
);
