import { upperFirst } from "lodash";

import { Chip, Form, Icon, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getStepDisplay } from "../shared/step-display";
import { getStepName } from "./shared/find-step";
import { getKindIcon, getKindLabel } from "./shared/value-display";

import type {
  PayloadKind,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

/** Chips shown before the rest are folded into "+N more". */
const shownChipCount = 3;

const nameWithType = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
});
const typeIcon = css({ display: "flex", color: "fg.subtle" });
const chips = css({ display: "flex", flexWrap: "wrap", gap: "1" });
const notUsed = css({ textStyle: "sm", color: "fg.subtle" });
const hiddenNames = css({ m: "0", pl: "4" });

const UsedByChip = ({ step }: { step: StepDefinition<string> }) => (
  <Chip size="md" prefix={{ iconName: getStepDisplay(step).icon }}>
    {getStepName(step)}
  </Chip>
);

/**
 * A value a step gives, or a flow input: its name after an icon for its type, with the type on hover, and the steps
 * that use it. `shape` is `null` while the type isn't known, e.g. for an output that takes its kind from an input
 * that isn't picked yet.
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
  const shown = usedBy.slice(0, shownChipCount);
  const hidden = usedBy.slice(shownChipCount);

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
        <span className={notUsed}>Not used yet</span>
      ) : (
        <span className={chips}>
          {shown.map((step) => (
            <UsedByChip key={step.stepId} step={step} />
          ))}
          {hidden.length > 0 && (
            <Tooltip
              position="top"
              content={
                <ul className={hiddenNames}>
                  {hidden.map((step) => (
                    <li key={step.stepId}>{getStepName(step)}</li>
                  ))}
                </ul>
              }
            >
              <span
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the rest can be read from the keyboard
                tabIndex={0}
              >
                <Chip size="md" variant="outline">
                  +{hidden.length} more
                </Chip>
              </span>
            </Tooltip>
          )}
        </span>
      )}
    </Form.Field>
  );
};
