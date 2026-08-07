import { Button, Select } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber } from "../../../shared/cost";
import { shortPlantLabel } from "../../../shared/plant-label";
import { useRegistry } from "../../../shared/registry-context";

import type { PipelineSummary } from "../../../shared/types";

interface PipelineHeaderProps {
  summaries: Record<string, PipelineSummary>;
  /** Global batch-trace coverage (fallback when no per-route entry exists). */
  coverage?: { traced: number; total: number };
  /** Per-route coverage keyed by route code; used to scope the count to the
   * selected destination. Falls back to `coverage` when absent. */
  coverageByRoute?: Record<string, { traced: number; total: number }>;
  /** Human label for the active analysis window, e.g. "last 12 months". */
  rangeLabel?: string;
  activeRoute: string;
  onActiveRouteChange: (route: string) => void;
  /** Larger title for the expanded what-if panel. */
  expanded?: boolean;
  /** Match the waterfall's 150px label column so controls sit over the bar track. */
  barAlignedControls?: boolean;
  contentCollapsed?: boolean;
  onContentToggle?: () => void;
  simulatorActive?: boolean;
  onSimulatorToggle?: () => void;
}

const row = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "2",
  minW: "0",
});
const titleGroup = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  minW: "0",
  flexGrow: "1",
  flexShrink: "1",
  flexBasis: "[18rem]",
});
const titleBase = css({ fontWeight: "medium", color: "fg.heading" });
const titleLg = css({ textStyle: "lg" });
const titleMd = css({ textStyle: "base" });
const coverageText = css({
  textStyle: "xs",
  color: "fg.subtle",
  minW: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const controls = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minW: "0",
  maxW: "full",
});
const selectWidth = css({ maxW: "[13rem]", minW: "0" });
const selectWidthExpanded = css({
  maxW: "[min(28rem,48vw)]",
  minW: "0",
});
const singleLabel = css({
  mr: "2",
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.heading",
});
const simulatorActiveIcon = css({
  color: "blue.s90",
});
const barControlsRow = css({
  display: "flex",
  gap: "1",
  alignItems: "center",
  minW: "0",
});
const titleInBarTrack = css({
  flex: "1",
  minW: "0",
  justifyContent: "flex-start",
});

/**
 * Shared header for the end-to-end pipeline (title + coverage + route picker +
 * optional expand/collapse chevron), used by both the collapsed waterfall in
 * `Overview` and the expanded `E2EWhatIf` panel so there is one header
 * implementation rather than two near-identical copies.
 */
export const PipelineHeader = ({
  summaries,
  coverage,
  coverageByRoute,
  rangeLabel,
  activeRoute,
  onActiveRouteChange,
  expanded = false,
  barAlignedControls = false,
  contentCollapsed = false,
  onContentToggle,
  simulatorActive = false,
  onSimulatorToggle,
}: PipelineHeaderProps) => {
  const { sites } = useRegistry();
  const routes = Object.keys(summaries);

  // Resolve a friendly destination name for a route. The route key for
  // non-direct routes is a bare destination-hub code. Prefer a registered
  // site name, then a trimmed form of the summary's resolved label (the
  // generator ships the full plant name; `shortPlantLabel` strips generic
  // corporate boilerplate), and only fall back to the bare code as a last
  // resort.
  const destinationName = (key: string): string => {
    const named = sites.find((step) => step.slug === key)?.name;
    if (named) {
      return named;
    }
    const label = summaries[key]?.label;
    if (label && label.toLowerCase() !== key.toLowerCase()) {
      return shortPlantLabel(key, label);
    }
    return key.toUpperCase();
  };

  // Full, untrimmed destination label (kept in the data) for tooltips.
  const destinationFullLabel = (key: string): string | undefined => {
    if (key === "direct") {
      return undefined;
    }
    const label = summaries[key]?.label;
    return label && label.toLowerCase() !== key.toLowerCase()
      ? label
      : undefined;
  };

  const routeText = (key: string): string => {
    if (key === "direct") {
      return "Direct to customer";
    }
    return `Via ${destinationName(key)}`;
  };

  // Coverage scoped to the selected destination, with a clear window suffix,
  // e.g. "N of M batches to <destination> traced · last 12 months".
  const cov = coverageByRoute?.[activeRoute] ?? coverage;
  const coverageLabel = (() => {
    if (!cov || cov.total <= 0) {
      return null;
    }
    const counts = `${formatNumber(cov.traced)} of ${formatNumber(cov.total)}`;
    const scope =
      activeRoute === "direct"
        ? `${counts} direct-to-customer batches traced`
        : `${counts} batches to ${destinationName(activeRoute)} traced`;
    return rangeLabel ? `${scope} \u00b7 ${rangeLabel}` : scope;
  })();

  const routeControl =
    routes.length > 1 ? (
      <Select
        value={activeRoute}
        onChange={(next) => {
          if (next) {
            onActiveRouteChange(next);
          }
        }}
        items={routes.map((row2) => ({
          value: row2,
          text: routeText(row2),
        }))}
        required
        size="xs"
        width="fitContent"
        className={expanded ? selectWidthExpanded : selectWidth}
        aria-label="Destination route"
      />
    ) : (
      <span className={singleLabel}>{routeText(activeRoute)}</span>
    );

  const simulatorControl = onSimulatorToggle && (
    <Button
      variant="subtle"
      tone="neutral"
      size="xs"
      iconName="sliders"
      onClick={onSimulatorToggle}
      className={simulatorActive ? simulatorActiveIcon : undefined}
      aria-pressed={simulatorActive}
      aria-label={simulatorActive ? "Show pipeline" : "Open simulator"}
    />
  );

  const disclosureControl = onContentToggle && (
    <Button
      variant="subtle"
      tone="neutral"
      size="xs"
      iconName={contentCollapsed ? "chevronDown" : "chevronUp"}
      onClick={onContentToggle}
      aria-label={
        contentCollapsed
          ? "Show end-to-end pipeline"
          : "Hide end-to-end pipeline"
      }
    />
  );

  if (barAlignedControls) {
    return (
      <div className={barControlsRow}>
        <div className={cx(titleGroup, titleInBarTrack)}>
          <h3 className={cx(titleBase, expanded ? titleLg : titleMd)}>
            End-to-End Pipeline
          </h3>
          {coverageLabel && (
            <span
              className={coverageText}
              title={destinationFullLabel(activeRoute)}
            >
              {coverageLabel}
            </span>
          )}
        </div>
        {routeControl}
        {simulatorControl}
        {disclosureControl}
      </div>
    );
  }

  return (
    <div className={row}>
      <div className={titleGroup}>
        <h3 className={cx(titleBase, expanded ? titleLg : titleMd)}>
          End-to-End Pipeline
        </h3>
        {coverageLabel && (
          <span
            className={coverageText}
            title={destinationFullLabel(activeRoute)}
          >
            {coverageLabel}
          </span>
        )}
      </div>
      <div className={controls}>
        {routeControl}
        {simulatorControl}
        {disclosureControl}
      </div>
    </div>
  );
};
