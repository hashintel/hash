import { Form, Select } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getStepName } from "../shared/find-step";
import { RenameInput } from "../shared/rename-input";
import { getStepDisplay } from "../shared/step-display";
import { orderSteps } from "../shared/step-order";

import type { StepPath } from "../shared/step-paths";
import type { FlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  FlowDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

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

const getAllSteps = (
  steps: StepDefinition<string>[],
): StepDefinition<string>[] =>
  steps.flatMap((step) => [
    step,
    ...(step.kind === "for-each" ? getAllSteps(step.steps) : []),
  ]);

/**
 * Each path's name and next step. The next step is the path's connection, as drawn on the canvas: a path with several
 * shows the first, and picking a step makes it the only one.
 */
export const PathsField = ({
  editor,
  flowDefinition,
  step,
  paths,
  readOnly,
}: {
  editor: FlowEditor;
  flowDefinition: FlowDefinition<string>;
  step: StepDefinition<string>;
  paths: StepPath[];
  /** Inside a for-each step (FE-1915). */
  readOnly: boolean;
}) => {
  const candidates = (
    readOnly
      ? getAllSteps(flowDefinition.steps)
      : orderSteps(flowDefinition.steps)
  ).filter(({ stepId }) => stepId !== step.stepId);
  const items = candidates.map((candidate) => ({
    value: candidate.stepId,
    text: getStepName(candidate),
  }));

  return paths.map((path) => {
    const next = candidates.find(({ runAfter }) =>
      runAfter?.some(
        (entry) =>
          entry.stepId === step.stepId && entry.outputName === path.outputName,
      ),
    );

    return (
      <div key={path.outputName} className={pathGroup}>
        {path.renamable && !readOnly ? (
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
          <Form.Field layout="inline" label="Goes to">
            <Select
              size="sm"
              aria-label={`${path.name} goes to`}
              placeholder="Ends here"
              readonly={readOnly}
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
