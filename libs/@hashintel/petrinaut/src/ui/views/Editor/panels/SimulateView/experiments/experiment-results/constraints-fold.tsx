/**
 * The Parameters card's footer fold for a constrained sweep: one line per
 * constraint — its kind chip, its label and its code — with the pass
 * threshold a state constraint is judged against beneath them. Read from
 * the experiment record, so it is there from creation whether or not a study
 * ever ran.
 */
import { Chip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { constraintLabel } from "@hashintel/petrinaut-core";

import {
  constraintAlpha,
  passThresholdPercent,
} from "../../../../../../../react/optimizations/constraint-rates";

import type { ExperimentRecord } from "../../../../../../../react/experiments/context";
import type { FrameCardMore } from "../../shared/drawer-frame/frame-card";
import type { ConstraintSpace } from "@hashintel/petrinaut-core";

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[6px]",
});

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[84px auto minmax(0, 1fr)]",
  alignItems: "center",
  columnGap: "3",
  height: "[20px]",
});

const labelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
  whiteSpace: "nowrap",
});

const codeStyle = css({
  fontSize: "xs",
  fontFamily: "['JetBrains Mono Variable', monospace]",
  color: "neutral.s100",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const thresholdStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

const KIND_CHIP: Record<
  ConstraintSpace,
  { label: string; color: "grey" | "purple" }
> = {
  parameters: { label: "Parameters", color: "grey" },
  state: { label: "State", color: "purple" },
};

/** The one-line form of a constraint's source: its lines joined by a space. */
const oneLine = (code: string): string =>
  code
    .trim()
    .split(/\s*\n\s*/u)
    .join(" ");

const ConstraintList = ({
  constraints,
  constraintPolicy,
}: Pick<ExperimentRecord, "constraints" | "constraintPolicy">) => {
  const hasState = constraints.some(
    (constraint) => constraint.space === "state",
  );
  const alpha = constraintAlpha({
    constraintPolicy: constraintPolicy ?? undefined,
  });
  return (
    <div className={listStyle} data-constraint-list>
      {constraints.map((constraint) => {
        const chip = KIND_CHIP[constraint.space];
        return (
          <div key={constraint.id} className={rowStyle}>
            <span>
              <Chip size="xs" variant="soft" color={chip.color}>
                {chip.label}
              </Chip>
            </span>
            <span className={labelStyle}>{constraintLabel(constraint)}</span>
            <code className={codeStyle} title={constraint.code}>
              {oneLine(constraint.code)}
            </code>
          </div>
        );
      })}
      {hasState ? (
        <span className={thresholdStyle}>
          pass threshold {passThresholdPercent(alpha)}% (alpha {alpha})
        </span>
      ) : null}
    </div>
  );
};

/** The fold a constrained experiment's Parameters card keeps behind its footer. */
export const constraintsFold = (
  experiment: Pick<ExperimentRecord, "constraints" | "constraintPolicy">,
): FrameCardMore => {
  const count = experiment.constraints.length;
  return {
    show: `Show ${count} constraint${count === 1 ? "" : "s"}`,
    hide: "Hide constraints",
    content: (
      <ConstraintList
        constraints={experiment.constraints}
        constraintPolicy={experiment.constraintPolicy}
      />
    ),
  };
};
