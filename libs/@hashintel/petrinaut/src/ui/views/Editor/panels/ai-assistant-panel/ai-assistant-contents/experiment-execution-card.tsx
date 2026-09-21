import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type {
  PetrinautExperimentProgress,
  PetrinautExperimentRequest,
  PetrinautExperimentResult,
} from "@hashintel/petrinaut-core";

export type ExperimentExecutionCardProps = {
  /** The approved canonical request, absent while a tool has yet to supply it or failed without one. */
  request?: PetrinautExperimentRequest;
  active: boolean;
  progress?: PetrinautExperimentProgress;
  result?: PetrinautExperimentResult;
  error?: string;
  onCancel?: () => void;
  /** Supply only while the caller can open the experiment's record. */
  onViewExperiment?: () => void;
};

const cardStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: "2.5",
  padding: "2.5",
  borderRadius: "xl",
  border: "[1px solid]",
  borderColor: "blue.a30",
  backgroundColor: "blue.s10",
  backgroundImage:
    "[linear-gradient(135deg, var(--colors-blue-a10), transparent 70%)]",
  fontSize: "sm",
  color: "neutral.s90",
  transition: "[border-color 200ms ease, box-shadow 200ms ease]",
  "&[data-pending=true]": {
    boxShadow:
      "[0 0 0 1px var(--colors-blue-a15), 0 0 14px var(--colors-blue-a20)]",
  },
  "&[data-tone=optimization]": {
    borderColor: "purple.a30",
    backgroundColor: "purple.s10",
    backgroundImage:
      "[linear-gradient(135deg, var(--colors-purple-a10), transparent 70%)]",
    boxShadow: "[0 2px 12px var(--colors-purple-a10)]",
  },
  "&[data-tone=optimization][data-pending=true]::after": {
    content: '""',
    position: "absolute",
    inset: "[0]",
    borderRadius: "[inherit]",
    pointerEvents: "none",
    boxShadow:
      "[0 0 0 1px var(--colors-purple-a30), 0 0 14px var(--colors-purple-a20)]",
    animationName: "[petrinautOptimizingGlow]",
    animationDuration: "[2.8s]",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "[infinite]",
  },
  "@media (prefers-reduced-motion: reduce)": {
    transition: "[none]",
    "&[data-tone=optimization][data-pending=true]::after": {
      animationName: "[none]",
      boxShadow:
        "[0 0 0 1px var(--colors-purple-a15), 0 0 14px var(--colors-purple-a20)]",
    },
  },
});

const headerStyle = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "2",
});
const iconStyle = css({
  display: "grid",
  placeItems: "center",
  width: "[28px]",
  height: "[28px]",
  marginTop: "0.5",
  flexShrink: "0",
  borderRadius: "lg",
  color: "blue.s100",
  backgroundColor: "blue.a15",
  "[data-tone=optimization] &": {
    color: "purple.s100",
    backgroundColor: "purple.a15",
  },
});
const kindStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "blue.s100",
  lineHeight: "[16px]",
  "[data-tone=optimization] &": { color: "purple.s100" },
});
const titleStyle = css({
  display: "block",
  fontSize: "sm",
  fontWeight: "semibold",
  lineHeight: "[20px]",
  color: "neutral.s120",
  overflowWrap: "anywhere",
});
const metadataStyle = css({
  display: "flex",
  alignItems: "center",
  columnGap: "1.5",
  flexWrap: "wrap",
  "& > :not(:first-child)::before": {
    content: '"·"',
    marginRight: "1.5",
    color: "neutral.s60",
  },
});
const statusStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  width: "[fit-content]",
  padding: "[2px 6px]",
  flexShrink: "0",
  marginTop: "0.5",
  borderRadius: "full",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[14px]",
  color: "blue.s110",
  backgroundColor: "blue.a10",
  "&[data-status=pending]": {
    "[data-tone=optimization] &": {
      color: "purple.s110",
      backgroundColor: "purple.a10",
    },
  },
  "&[data-status=complete]": {
    color: "green.s110",
    backgroundColor: "green.a10",
  },
  "&[data-status=error]": { color: "red.s110", backgroundColor: "red.a10" },
  "&[data-status=cancelled]": {
    color: "neutral.s90",
    backgroundColor: "neutral.a10",
  },
});
const statusDotStyle = css({
  width: "[5px]",
  height: "[5px]",
  borderRadius: "full",
  backgroundColor: "[currentColor]",
  animationName: "pulse",
  animationDuration: "[1.6s]",
  animationTimingFunction: "ease-in-out",
  animationIterationCount: "[infinite]",
  "@media (prefers-reduced-motion: reduce)": { animationName: "[none]" },
});
const detailStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  fontVariantNumeric: "tabular-nums",
  overflowWrap: "anywhere",
});
const progressTrackStyle = css({
  height: "[5px]",
  borderRadius: "full",
  overflow: "hidden",
  backgroundColor: "blue.a15",
  "[data-tone=optimization] &": { backgroundColor: "purple.a15" },
});
const progressFillStyle = css({
  height: "[100%]",
  borderRadius: "full",
  backgroundColor: "blue.s90",
  transition: "[width 280ms ease-out]",
  "[data-tone=optimization] &": { backgroundColor: "purple.s90" },
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
});
const metricsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  columnGap: "4",
  rowGap: "2",
  flex: "[1 1 100px]",
  minWidth: "[0]",
  margin: "0",
});
const metricStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "[0]",
  overflowWrap: "anywhere",
  "& > dt": { fontSize: "xs", color: "neutral.s90", lineHeight: "[16px]" },
  "& > dd": {
    margin: "0",
    fontSize: "lg",
    lineHeight: "[24px]",
    fontWeight: "semibold",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "[-0.02em]",
    color: "neutral.s120",
  },
});
const actionsStyle = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "2",
  marginLeft: "[auto]",
});

/** Execution presentation only; callers own execution, records and navigation. */
export const ExperimentExecutionCard = ({
  request,
  active,
  progress,
  result,
  error: errorText,
  onCancel,
  onViewExperiment,
}: ExperimentExecutionCardProps) => {
  const name = result?.name ?? progress?.name ?? request?.name ?? "Experiment";
  const pending = active && !result && !errorText;
  const optimization =
    request?.execution.mode === "optimize" ||
    result?.optimization !== undefined ||
    progress?.phase === "optimizing" ||
    progress?.phase === "refining";
  const statusKind = errorText
    ? "error"
    : (result?.status ?? (pending ? "pending" : "unavailable"));
  const status = errorText
    ? "Failed"
    : result
      ? { complete: "Finished", cancelled: "Cancelled", error: "Failed" }[
          result.status
        ]
      : !pending
        ? "Not running"
        : progress?.phase === "optimizing"
          ? "Optimizing"
          : progress?.phase === "refining"
            ? "Refining"
            : progress?.phase === "running"
              ? "Running"
              : "Validating";
  const progressValue = progress
    ? Math.min(progress.runsTarget, Math.max(0, progress.runsCompleted))
    : 0;
  const progressPercent =
    progress && progress.runsTarget > 0
      ? (progressValue / progress.runsTarget) * 100
      : 0;
  const available = onViewExperiment !== undefined;

  return (
    <section
      aria-label={`Experiment: ${name}`}
      aria-busy={pending}
      data-tone={optimization ? "optimization" : "simulation"}
      data-pending={pending}
      className={cardStyle}
    >
      <div className={headerStyle}>
        <span aria-hidden="true" className={iconStyle}>
          <Icon name={optimization ? "sparkles" : "flask"} size="sm" />
        </span>
        <div className={css({ minWidth: "[0]", flex: "1" })}>
          <strong className={titleStyle}>{name}</strong>
          <div className={metadataStyle}>
            <span className={kindStyle}>
              {optimization ? "Optimization" : "Simulation"}
            </span>
            {(result || pending) && (
              <span className={detailStyle}>
                {result
                  ? `${result.runsCompleted} runs`
                  : progress
                    ? `${progress.runsCompleted} of ${progress.runsTarget} runs`
                    : "Checking the model"}
              </span>
            )}
          </div>
        </div>
        <div
          role="status"
          aria-live="polite"
          className={statusStyle}
          data-status={statusKind}
        >
          {pending ? (
            <span aria-hidden="true" className={statusDotStyle} />
          ) : (
            <Icon
              name={
                statusKind === "complete"
                  ? "check"
                  : statusKind === "error"
                    ? "error"
                    : "stop"
              }
              size="xs"
            />
          )}
          {status}
        </div>
      </div>
      {progress && pending && (
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "1.5",
          })}
        >
          <div
            role="progressbar"
            aria-label="Experiment runs"
            aria-valuemin={0}
            aria-valuemax={progress.runsTarget}
            aria-valuenow={progressValue}
            aria-valuetext={`${progress.runsCompleted} of ${progress.runsTarget} runs`}
            className={progressTrackStyle}
          >
            <div
              key={`${progress.phase}-${progress.step ?? 0}`}
              className={progressFillStyle}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {progress.phase === "optimizing" &&
            progress.step !== undefined &&
            progress.steps !== undefined && (
              <span className={detailStyle}>
                Step {progress.step} of {progress.steps}
              </span>
            )}
          {progress.phase === "refining" && (
            <span className={detailStyle}>Refining the best result</span>
          )}
        </div>
      )}
      {!pending && !result && !errorText && (
        <p className={detailStyle}>
          No result is available for this request. Ask the assistant to run a
          new experiment.
        </p>
      )}
      {(result?.message ?? errorText) && (
        <p
          className={css({
            margin: "0",
            fontSize: "xs",
            overflowWrap: "anywhere",
            lineHeight: "[18px]",
          })}
        >
          {result?.message ?? errorText}
        </p>
      )}
      {result?.metrics.length ||
      available ||
      (pending && onCancel) ||
      result?.experimentId ? (
        <div
          className={css({
            display: "flex",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: "2",
          })}
        >
          {result && result.metrics.length > 0 && (
            <dl className={metricsStyle}>
              {result.metrics.map((metric) => (
                <div key={metric.id} className={metricStyle}>
                  <dt>{metric.label}</dt>
                  <dd>
                    {metric.value === null
                      ? "No value"
                      : metric.value.toLocaleString(undefined, {
                          maximumSignificantDigits: 6,
                        })}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {(available || (pending && onCancel) || result?.experimentId) && (
            <div className={actionsStyle}>
              {available && (
                <Button
                  size="xs"
                  variant="ghost"
                  tone="neutral"
                  className={css({
                    color: "blue.s100",
                    _hover: { backgroundColor: "blue.a10" },
                    "[data-tone=optimization] &": {
                      color: "purple.s100",
                      _hover: { backgroundColor: "purple.a10" },
                    },
                  })}
                  iconName="arrowUpRight"
                  iconPosition="right"
                  onClick={onViewExperiment}
                >
                  View experiment
                </Button>
              )}
              {pending && onCancel && (
                <Button
                  size="xs"
                  variant="ghost"
                  tone="neutral"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              )}
              {result?.experimentId && !available && (
                <span className={detailStyle}>
                  Results shown in chat; experiment is no longer open.
                </span>
              )}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};
