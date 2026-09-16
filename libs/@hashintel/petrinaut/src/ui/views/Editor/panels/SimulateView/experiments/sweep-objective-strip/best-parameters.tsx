import { Fragment } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { axisStep } from "../../../../../../../react/experiments/parameter-grid";
import { isOptimizationActive } from "../../../../../../../react/optimizations/context";
import { formatAxisValue } from "../../shared/format-axis-value";
import { formatNumber } from "../../shared/format-value";
import { parameterLabel } from "../shared/parameter-label";

import type { ExperimentParameterAxis } from "../../../../../../../react/experiments/parameter-grid";
import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

const panelStyle = css({
  minWidth: "[0]",
  padding: "3",
  borderRadius: "md",
  backgroundColor: "purple.s10",
  fontSize: "xs",
  color: "purple.s110",
});

const headerStyle = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "2",
  marginBottom: "1",
});

const summaryStyle = css({
  color: "purple.s100",
  fontVariantNumeric: "tabular-nums",
});

const listStyle = css({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  columnGap: "4",
  rowGap: "2",
  margin: "[0]",
  marginTop: "3",
  color: "neutral.s110",
  "& dt": { overflowWrap: "anywhere" },
  "& dd": {
    margin: "[0]",
    textAlign: "right",
    fontWeight: "medium",
    fontVariantNumeric: "tabular-nums",
  },
});

export const BestParameters = ({
  study,
  axes,
  onViewBest,
}: {
  study: OptimizationRecord;
  axes: readonly ExperimentParameterAxis[];
  onViewBest: (() => void) | null;
}) => {
  const { best } = study;
  const active = isOptimizationActive(study);
  return (
    <section className={panelStyle} aria-label="Best parameters">
      <div className={headerStyle}>
        <strong>{active ? "Best so far" : "Best found"}</strong>
        {best === null ? null : (
          <Button
            variant="subtle"
            size="xs"
            disabled={active || onViewBest === null}
            onClick={() => onViewBest?.()}
          >
            View best
          </Button>
        )}
      </div>
      <div className={summaryStyle}>
        {best === null
          ? active
            ? "Waiting for the first result"
            : "No best result found"
          : `${formatNumber(best.objective)} · Step ${best.trial + 1}`}
      </div>
      {best === null ? null : (
        <dl className={listStyle}>
          {axes.map((axis) => {
            const value = best.parameters[axis.identifier];
            return (
              <Fragment key={axis.identifier}>
                <dt>{parameterLabel(axis)}</dt>
                <dd>
                  {typeof value === "number"
                    ? formatAxisValue(value, axisStep(axis))
                    : "—"}
                </dd>
              </Fragment>
            );
          })}
        </dl>
      )}
    </section>
  );
};
