/**
 * The Parameters band of a connected study's drawer: a title row with the
 * help tooltip and the navigator's status line, then the parameter controls.
 * It holds still above the plots; the drawer keeps it out of the scrolling
 * region, so there is no section body beneath it.
 */
import { HelpTooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { optimizationBooleanIdentifiers } from "../../../../../../../react/optimizations/surface-grid";
import {
  OptimizationNavigator,
  OptimizationNavigatorStatus,
} from "./optimization-navigator";

import type {
  ConnectedStudyState,
  OptimizationNavigation,
  OptimizationRecord,
} from "../../../../../../../react/optimizations/context";

const bandStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingTop: "3",
  paddingBottom: "2",
  flexShrink: "0",
});

const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});

const headerLeftStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const titleStyle = css({
  fontWeight: "semibold",
  fontSize: "sm",
  lineHeight: "[14px]",
  color: "neutral.fg.body",
});

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
  <div className={bandStyle}>
    <div className={headerRowStyle}>
      <div className={headerLeftStyle}>
        <span className={titleStyle}>Parameters</span>
        <HelpTooltip content={PARAMETERS_HELP} />
      </div>
      <OptimizationNavigatorStatus
        navigation={connected.navigation}
        selection={connected.selection}
        running={running}
        onNavigationChange={onNavigationChange}
      />
    </div>
    <OptimizationNavigator
      axes={optimization.axes}
      booleanParameters={optimizationBooleanIdentifiers(optimization.input)}
      navigation={connected.navigation}
      running={running}
      onNavigationChange={onNavigationChange}
    />
  </div>
);
