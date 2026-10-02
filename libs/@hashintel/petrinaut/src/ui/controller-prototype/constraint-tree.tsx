import { use } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { newConstraint } from "../../react/controller-prototype/constraints";
import { useConstraints } from "../../react/controller-prototype/use-constraints";
import { EditorContext } from "../../react/state/editor-context";
import { useIsReadOnly } from "../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../constants/ui-messages";
import {
  exampleResultFor,
  exampleResultHeld,
} from "./constraint-results-example";

import type { ComponentType } from "react";

// Rows grey their icons; this one takes the row's text colour, at the size of
// the Controllers row glyph.
const constraintIconStyle = css({
  color: "neutral.s115",
  "--icon-size": "[14px]",
});

/** The constraint icon, at the sidebar's icon size. */
export const ConstraintIcon: React.FC<{ size: number }> = () => (
  <Icon name="circleCheck" className={constraintIconStyle} />
);

const AddConstraintAction: React.FC = () => {
  const isReadOnly = useIsReadOnly();
  const { constraints, updateConstraints } = useConstraints();
  const { selectItem } = use(EditorContext);

  return (
    <Button
      size="xs"
      variant="ghost"
      iconName="plus"
      aria-label="Add constraint"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Add constraint"}
      onClick={(event) => {
        event.stopPropagation();
        const id = `constraint__${Date.now()}`;
        updateConstraints((current) => [
          ...current,
          newConstraint(id, `Constraint ${constraints.length + 1}`),
        ]);
        selectItem({ type: "constraint", id });
      }}
    />
  );
};

/** The Constraints group for the Entities list: one row per constraint. */
export const useConstraintsTreeGroup = (
  addAction: (action: ComponentType) => ComponentType | undefined,
) => {
  const { constraints } = useConstraints();

  return {
    id: "group-constraints",
    name: "Constraints",
    emptyGroupMessage: "No constraints",
    renderGroupAction: addAction(AddConstraintAction),
    children: constraints.map((constraint) => {
      const result = exampleResultFor(constraint.id);
      return {
        id: constraint.id,
        name: constraint.name,
        icon: ConstraintIcon,
        selectionItem: { type: "constraint" as const, id: constraint.id },
        resultTag: result
          ? {
              text: `${result.held}/${result.runs}`,
              warn: !exampleResultHeld(result, constraint.tolerance),
            }
          : undefined,
      };
    }),
  };
};
