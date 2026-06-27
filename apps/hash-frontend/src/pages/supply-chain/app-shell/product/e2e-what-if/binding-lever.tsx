import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { formatNumber } from "../../../shared/cost";
import {
  capCheckpointsFor,
  defaultCapDays,
  formatNextBottleneck,
  isCapActive,
  meanObservedCapReduction,
  type LeverDefinition,
} from "../whatif";

import type { GraphData } from "../../../shared/types";

const card = css({
  bg: "bgSolid.min",
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  p: "3",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const headRow = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "2",
});
const headMain = css({ minW: "0", flex: "1" });
const leverLabel = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const metaRow = css({
  textStyle: "xs",
  color: "fg.subtle",
  mt: "0.5",
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
});
const drillButton = css({
  color: "fg.subtle",
  flexShrink: 0,
  cursor: "pointer",
  _hover: { color: "fg.heading" },
});
const sliderStack = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});
const checkpointRow = css({
  display: "grid",
  gridTemplateColumns: "[repeat(6, minmax(0, 1fr))]",
  gap: "1",
});
const checkpointButtonBase = css({
  px: "1.5",
  py: "1",
  borderRadius: "md",
  borderWidth: "1px",
  borderStyle: "solid",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.5",
  minW: "0",
  transition: "colors",
});
const checkpointButtonActive = css({
  bg: "bgSolid.min",
  borderColor: "fg.muted",
  color: "fg.heading",
});
const checkpointButtonInactive = css({
  bg: "bg.subtle",
  borderColor: "bd.subtle",
  color: "fg.subtle",
  _hover: { color: "fg.muted", borderColor: "bd.subtle" },
});
const checkpointLabel = css({
  textStyle: "xxs",
  fontWeight: "medium",
  lineHeight: "none",
});
const checkpointValue = css({
  textStyle: "xxs",
  fontVariantNumeric: "tabular-nums",
  lineHeight: "none",
});
const pastBottleneck = css({
  color: "status.error.fg.body",
  textStyle: "xxs",
  flexShrink: 0,
});
const effectiveRow = css({ textStyle: "xxs", color: "fg.subtle" });
const staleRecipeBadge = css({
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "sm",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "status.warning.bd.subtle",
  bg: "status.warning.bg.subtle",
  color: "status.warning.fg.body",
  px: "1",
  py: "[1px]",
  textStyle: "xxs",
  fontWeight: "medium",
  cursor: "help",
});

interface BindingLeverProps {
  lever: LeverDefinition;
  /** Current cap in days. Missing/Max means uncapped. */
  capDays?: number;
  onChange: (v: number) => void;
  onDrill: () => void;
  nodes: GraphData["nodes"];
}

export const BindingLever = ({
  lever,
  capDays,
  onChange,
  onDrill,
  nodes,
}: BindingLeverProps) => {
  const node = nodes.find((count) => count.id === lever.stepId);
  const selectedCap = capDays ?? defaultCapDays(lever);
  const activeCap = isCapActive(lever, selectedCap);
  const tailReduction = activeCap
    ? meanObservedCapReduction(node, selectedCap)
    : 0;
  const beyondNextBottleneck =
    activeCap &&
    lever.nextBottleneckDays != null &&
    lever.nextBottleneckDays > 0 &&
    tailReduction > lever.nextBottleneckDays;
  const shortenedCount = activeCap
    ? (node?.observations ?? []).filter(
        (observation) =>
          typeof observation.value === "number" &&
          Number.isFinite(observation.value) &&
          observation.value > selectedCap,
      ).length
    : 0;
  const observedCount = node?.observations?.length ?? 0;

  const checkpoints = capCheckpointsFor(lever);
  const selectedCheckpoint = !activeCap
    ? checkpoints.find((column) => column.key === "max")
    : checkpoints.find(
        (column) =>
          column.key !== "max" && Math.abs(column.capDays - selectedCap) < 0.5,
      );

  return (
    <div className={card}>
      <div className={headRow}>
        <div className={headMain}>
          <div className={leverLabel} title={lever.label}>
            {lever.label}
          </div>
          <div className={metaRow}>
            <span title="Node-level median across all observations in the time window (matches the step card)">
              {formatNumber(lever.median, { maximumFractionDigits: 0 })}d median
              {" / "}
              {formatNumber(lever.mean, { maximumFractionDigits: 0 })}d mean
            </span>
            {lever.inCurrentRecipe === false && (
              <span
                className={staleRecipeBadge}
                title="This step appears in historical batches but is not reachable in the current BOM/recipe. Capping it may have no impact on future batches unless the old recipe is used again."
              >
                Not in current recipe
              </span>
            )}
            {lever.nextBottleneckDays != null &&
              lever.nextBottleneckDays > 0 &&
              (() => {
                const nb = formatNextBottleneck(lever.nextBottleneckChains);
                const daysText = `${formatNumber(lever.nextBottleneckDays, { maximumFractionDigits: 0 })}d to next bottleneck`;
                if (!nb) {
                  return <span>{daysText}</span>;
                }
                // Tooltip carries the full top-3 breakdown for inspection;
                // visible text is the compact confident/mixed form.
                const tooltip = lever.nextBottleneckChains
                  ?.map(
                    (column) =>
                      `${column.label} (${Math.round(column.share * 100)}%)`,
                  )
                  .join(" / ");
                return (
                  <span title={tooltip ?? undefined}>
                    {daysText} ({nb.text})
                  </span>
                );
              })()}
          </div>
        </div>
        <button
          type="button"
          onClick={onDrill}
          className={drillButton}
          title="Open step detail"
          aria-label="Open step detail"
        >
          <Icon name="externalLink" size="xs" />
        </button>
      </div>

      <div className={sliderStack}>
        <div className={checkpointRow}>
          {checkpoints.map((checkpoint) => {
            const selected = checkpoint.key === selectedCheckpoint?.key;
            return (
              <button
                key={checkpoint.key}
                type="button"
                className={cx(
                  checkpointButtonBase,
                  selected ? checkpointButtonActive : checkpointButtonInactive,
                )}
                onClick={() => onChange(checkpoint.capDays)}
                title={
                  checkpoint.key === "max"
                    ? "Uncapped baseline: no durations are shortened"
                    : checkpoint.key === "zero"
                      ? "Exclude this step from the simulated timeline by capping it at 0d"
                      : `Cap durations above ${formatNumber(checkpoint.capDays, { maximumFractionDigits: 0 })}d`
                }
                aria-pressed={selected}
              >
                <span className={checkpointLabel}>{checkpoint.label}</span>
                <span className={checkpointValue}>
                  {formatNumber(checkpoint.capDays, {
                    maximumFractionDigits: 0,
                  })}
                  d
                </span>
              </button>
            );
          })}
        </div>

        <div className={effectiveRow}>
          {activeCap
            ? selectedCheckpoint?.key === "zero"
              ? "Step is excluded from the simulated timeline"
              : `Durations above ${formatNumber(selectedCap, { maximumFractionDigits: 0 })}d are capped`
            : "Max selected -- no cap applied"}
          {activeCap && observedCount > 0 && (
            <>
              {" · "}
              {formatNumber(shortenedCount)} / {formatNumber(observedCount)}{" "}
              observations shortened
            </>
          )}
          {beyondNextBottleneck && (
            <>
              {" · "}
              <span className={pastBottleneck}>past next bottleneck</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
