import { use } from "react";

import { Button } from "@hashintel/ds-components";
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

/**
 * The constraint icon, at the sidebar's icon size: Font Awesome Free
 * `road-barrier` (solid, CC BY 4.0), which the DS icon set does not include.
 */
export const ConstraintIcon: React.FC<{ size: number }> = () => (
  <svg
    viewBox="0 0 640 512"
    width={14}
    height={14}
    fill="currentColor"
    aria-hidden="true"
    className={constraintIconStyle}
  >
    <path d="M32 32C14.3 32 0 46.3 0 64L0 448c0 17.7 14.3 32 32 32s32-14.3 32-32l0-181.7L149.2 96 64 96l0-32c0-17.7-14.3-32-32-32zM405.2 96l-74.3 0-5.4 10.7L234.8 288l74.3 0 5.4-10.7L405.2 96zM362.8 288l74.3 0 5.4-10.7L533.2 96l-74.3 0-5.4 10.7L362.8 288zM202.8 96l-5.4 10.7L106.8 288l74.3 0 5.4-10.7L277.2 96l-74.3 0zm288 192l85.2 0 0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-384c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 53.7L490.8 288z" />
  </svg>
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
