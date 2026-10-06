import { use } from "react";

import { Button } from "@hashintel/ds-components";

import { newConstraint } from "../../react/controller-prototype/constraints";
import { useConstraints } from "../../react/controller-prototype/use-constraints";
import { EditorContext } from "../../react/state/editor-context";
import { useIsReadOnly } from "../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../constants/ui-messages";

import type { ComponentType } from "react";

/**
 * The constraint glyph: Font Awesome's `road-barrier` (regular) redrawn on a
 * 24 grid with round caps, like the lever glyph. The DS icon set has no
 * barrier. It takes the row's colour and size.
 */
export const ConstraintIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size + 1}
    height={size + 1}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={size + 1 <= 13 ? 2.5 : 1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 4v16M20 4v16" />
    <path d="M4 7h16v7H4" />
    <path d="M9 14l3-7M15 14l3-7" />
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
    children: constraints.map((constraint) => ({
      id: constraint.id,
      name: constraint.name,
      icon: ConstraintIcon,
      selectionItem: { type: "constraint" as const, id: constraint.id },
    })),
  };
};
