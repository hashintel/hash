import { upperFirst } from "lodash";

import { Chip, Form, Icon, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { getStepDisplay } from "../shared/step-display";
import { getKindIcon, getKindLabel } from "../shared/value-display";
import { getStepName } from "./shared/find-step";

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
const chips = css({
  display: "none",
  flexWrap: "wrap",
  gap: "1",
  _groupHover: { display: "flex" },
  _groupFocusWithin: { display: "flex" },
});

const getUsedBySummary = (names: string[]) => {
  const named = names.slice(0, namedStepCount).join(", ");
  const rest = names.length - namedStepCount;

  return `Used in ${named}${rest > 0 ? ` and ${rest} more` : ""}`;
};

/**
 * A value a step gives, or a flow input: its name after an icon for its type, with the type on hover, and the steps
 * that use it, named in a line that turns into a chip per step on hover. `shape` is `null` while the type isn't known,
 * e.g. for an output that takes its kind from an input that isn't picked yet.
 */
export const UsedByField = ({
  name,
  shape,
  usedBy,
}: {
  name: string;
  shape: { payloadKind: PayloadKind; array: boolean } | null;
  usedBy: StepDefinition<string>[];
}) => {
  const usedByNames = usedBy.map(getStepName);

  return (
    <Form.Field
      layout="inline"
      as="legend"
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
          <span className={chips}>
            {usedBy.map((step) => (
              <Chip
                key={step.stepId}
                size="md"
                prefix={{ iconName: getStepDisplay(step).icon }}
              >
                {getStepName(step)}
              </Chip>
            ))}
          </span>
        </span>
      )}
    </Form.Field>
  );
};
