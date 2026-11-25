import { Form, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { findStep, getStepName } from "../shared/find-step";
import { RenameInput } from "../shared/rename-input";
import { getStepDisplay } from "../shared/step-display";
import { orderSteps } from "../shared/step-order";

import type { StepPath } from "../shared/step-paths";
import type { FlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  FlowDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { ReactNode } from "react";

const pathGroup = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  "& + &": {
    pt: "4",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "bd.subtle",
  },
});
const fixedName = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
});
const help = css({ textStyle: "sm", color: "fg.subtle" });

/**
 * Each path's name, its condition when it has the step's, and its next step. The next step is the path's connection,
 * as drawn on the canvas: a path with several shows the first, and picking a step makes it the only one.
 */
export const PathsField = ({
  editor,
  flowDefinition,
  step,
  paths,
  condition,
}: {
  editor: FlowEditor;
  flowDefinition: FlowDefinition<string>;
  step: StepDefinition<string>;
  paths: StepPath[];
  /** The step's condition field, shown on the path that has it. */
  condition?: ReactNode;
}) => {
  /*
   * A path leads to a step beside this one, in the same for-each step or at the top level. From the top level, it can
   * also lead into a for-each step, to a step inside it, as on the canvas.
   */
  const parent = findStep(flowDefinition.steps, step.stepId)?.parent;
  const candidates = (
    parent
      ? orderSteps(parent.steps).map((candidate) => ({
          candidate,
          forEach: null,
        }))
      : orderSteps(flowDefinition.steps).flatMap((candidate) => [
          { candidate, forEach: null },
          ...(candidate.kind === "for-each"
            ? orderSteps(candidate.steps).map((inner) => ({
                candidate: inner,
                forEach: candidate,
              }))
            : []),
        ])
  ).filter(({ candidate }) => candidate.stepId !== step.stepId);
  const items = candidates.map(({ candidate, forEach }) => ({
    value: candidate.stepId,
    text: forEach
      ? `${getStepName(forEach)} › ${getStepName(candidate)}`
      : getStepName(candidate),
  }));

  return paths.map((path) => {
    const next = candidates.find(({ candidate }) =>
      candidate.runAfter?.some(
        (entry) =>
          entry.stepId === step.stepId && entry.outputName === path.outputName,
      ),
    )?.candidate;

    return (
      <div key={path.outputName} className={pathGroup}>
        {path.renamable ? (
          <RenameInput
            value={path.name}
            ariaLabel={`${path.name} path name`}
            editIcon={false}
            onRename={(name) =>
              editor.setPathName(step.stepId, path.outputName, name)
            }
          />
        ) : (
          <span className={fixedName}>{path.name}</span>
        )}
        <span className={help}>{path.help}</span>
        <Form.Section>
          {path.showsCondition && condition}
          <Form.Field layout="inline" label="Goes to">
            <Select
              size="sm"
              aria-label={`${path.name} goes to`}
              placeholder="Ends here"
              items={items}
              value={next?.stepId ?? null}
              prefix={
                next ? { iconName: getStepDisplay(next).icon } : undefined
              }
              onChange={(to) =>
                editor.setPathTarget(step.stepId, path.outputName, to)
              }
            />
          </Form.Field>
        </Form.Section>
      </div>
    );
  });
};
