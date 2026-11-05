import { upperFirst } from "lodash";

import { Button, Chip, Form, Icon, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { getStepDisplay } from "../shared/step-display";
import { getStepName } from "./shared/find-step";
import { getKindIcon, getKindLabel } from "./shared/value-display";

import type {
  PayloadKind,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

/** Steps named in the summary before the rest are counted as "and N more". */
const namedStepCount = 3;

const nameWithType = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
});
const typeIcon = css({ display: "flex", color: "fg.subtle" });
const usedByText = css({ textStyle: "sm", color: "fg.subtle" });
const usedByValue = css({
  display: "flex",
  borderRadius: "md",
  _hover: { bg: "bg.subtle" },
  _focusWithin: { bg: "bg.subtle" },
});
const summary = css({
  _groupHover: { display: "none" },
  _groupFocusWithin: { display: "none" },
});
const stepChips = css({ display: "flex", flexWrap: "wrap", gap: "1" });
const chips = css({
  display: "none",
  _groupHover: { display: "flex" },
  _groupFocusWithin: { display: "flex" },
});

/*
 * The star sits at the row's end: the field puts `labelActions` in a wrapper after the used-by text, so the wrapper
 * is pushed along the row. An output that isn't a flow output shows its star only while its row is hovered or
 * focused. The row's root is `display: contents` in a `Form.Section`, which `:hover` and `:focus-within` don't mind,
 * as they match by the tree, not by boxes.
 */
const usedByRow = css({
  "& :has(> [data-flow-output])": { marginLeft: "auto" },
  "& [data-flow-output='false']": { opacity: "0" },
  "&:hover [data-flow-output]": { opacity: "1" },
  "&:focus-within [data-flow-output]": { opacity: "1" },
});
const flowOutputToggle = css({ display: "flex" });

/** A chip per step, with the step's icon and name. */
export const StepChips = ({
  steps,
  className,
}: {
  steps: StepDefinition<string>[];
  className?: string;
}) => (
  <span className={cx(stepChips, className)}>
    {steps.map((step) => (
      <Chip
        key={step.stepId}
        size="md"
        prefix={{ iconName: getStepDisplay(step).icon }}
      >
        {getStepName(step)}
      </Chip>
    ))}
  </span>
);

const getUsedBySummary = (names: string[]) => {
  const named = names.slice(0, namedStepCount).join(", ");
  const rest = names.length - namedStepCount;

  return `Used in ${named}${rest > 0 ? ` and ${rest} more` : ""}`;
};

/**
 * A value a step gives, or a flow input: its name after an icon for its type, with the type on hover, and the steps
 * that use it, named in a line that turns into a chip per step on hover. `shape` is `null` while the type isn't known,
 * e.g. for an output that takes its kind from an input that isn't picked yet.
 *
 * Given `flowOutput`, a star at the end of the row marks or unmarks the value as one of the flow's outputs, which show
 * in its runs' results.
 */
export const UsedByField = ({
  name,
  shape,
  usedBy,
  flowOutput,
}: {
  name: string;
  shape: { payloadKind: PayloadKind; array: boolean } | null;
  usedBy: StepDefinition<string>[];
  flowOutput?: { marked: boolean; onToggle: () => void };
}) => {
  const usedByNames = usedBy.map(getStepName);

  return (
    <Form.Field
      className={usedByRow}
      layout="inline"
      as="legend"
      labelActions={
        flowOutput && (
          <span
            data-flow-output={flowOutput.marked}
            className={flowOutputToggle}
          >
            <Button
              variant="ghost"
              size="xs"
              iconName={flowOutput.marked ? "starFilled" : "star"}
              tooltip="Show in run results"
              aria-pressed={flowOutput.marked}
              onClick={flowOutput.onToggle}
            />
          </span>
        )
      }
      label={
        <span className={nameWithType}>
          <Tooltip
            position="top"
            content={
              shape ? upperFirst(getKindLabel(shape)) : "Type not known yet"
            }
          >
            <span
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the type can be read from the keyboard
              tabIndex={0}
              className={typeIcon}
            >
              <Icon
                name={shape ? getKindIcon(shape) : "circle"}
                size="xs"
                alt={shape ? getKindLabel(shape) : "Type not known yet"}
              />
            </span>
          </Tooltip>
          {name}
        </span>
      }
    >
      {usedBy.length === 0 ? (
        <span className={usedByText}>Not used yet</span>
      ) : (
        <span
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so every step can be shown from the keyboard
          tabIndex={0}
          aria-label={`Used in ${usedByNames.join(", ")}`}
          className={cx("group", usedByValue)}
        >
          <span className={cx(usedByText, summary)}>
            {getUsedBySummary(usedByNames)}
          </span>
          <StepChips steps={usedBy} className={chips} />
        </span>
      )}
    </Form.Field>
  );
};
