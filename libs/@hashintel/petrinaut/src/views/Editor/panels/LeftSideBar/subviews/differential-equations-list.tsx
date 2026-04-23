import { use } from "react";
import { TbPlus, TbTrash } from "react-icons/tb";
import { v4 as uuidv4 } from "uuid";

import { IconButton } from "../../../../../components/icon-button";
import type { SubView } from "../../../../../components/sub-view/types";
import { DifferentialEquationIcon } from "../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import { DEFAULT_DIFFERENTIAL_EQUATION_CODE } from "../../../../../core/default-codes";
import { EditorContext } from "../../../../../state/editor-context";
import { MutationContext } from "../../../../../state/mutation-context";
import { ActiveNetContext } from "../../../../../state/active-net-context";
import { useIsReadOnly } from "../../../../../state/use-is-read-only";
import {
  RowMenu,
  createFilterableListSubView,
} from "./filterable-list-sub-view";

/**
 * DifferentialEquationsSectionHeaderAction renders the add button for the section header.
 */
export const DifferentialEquationsSectionHeaderAction: React.FC = () => {
  const {
    activeNet: { types, differentialEquations },
  } = use(ActiveNetContext);
  const { addDifferentialEquation } = use(MutationContext);
  const { selectItem } = use(EditorContext);

  const isReadOnly = useIsReadOnly();

  return (
    <IconButton
      aria-label="Add differential equation"
      size="xs"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
      onClick={() => {
        const name = `Equation ${differentialEquations.length + 1}`;
        const id = uuidv4();
        addDifferentialEquation({
          id,
          name,
          colorId: types.length > 0 ? types[0]!.id : "",
          code: DEFAULT_DIFFERENTIAL_EQUATION_CODE,
        });
        selectItem({ type: "differentialEquation", id });
      }}
    >
      <TbPlus />
    </IconButton>
  );
};

const DiffEqRowMenu: React.FC<{ item: { id: string } }> = ({ item }) => {
  const { removeDifferentialEquation } = use(MutationContext);
  const isReadOnly = useIsReadOnly();

  return (
    <RowMenu
      items={[
        {
          id: "delete",
          label: "Delete",
          icon: <TbTrash />,
          destructive: true,
          disabled: isReadOnly,
          onClick: () => removeDifferentialEquation(item.id),
        },
      ]}
    />
  );
};

/**
 * SubView definition for Differential Equations list.
 */
export const differentialEquationsListSubView: SubView =
  createFilterableListSubView({
    id: "differential-equations-list",
    title: "Differential Equations",
    tooltip: `Differential equations govern how token data changes over time when tokens remain in a place ("dynamics").`,
    defaultCollapsed: false,
    resizable: {
      defaultHeight: 300,
      minHeight: 200,
      maxHeight: 600,
    },
    useItems: () => {
      const {
        activeNet: { differentialEquations },
      } = use(ActiveNetContext);
      return differentialEquations.map((eq) => ({
        ...eq,
        icon: DifferentialEquationIcon,
      }));
    },
    getSelectionItem: (eq) => ({ type: "differentialEquation", id: eq.id }),
    renderItem: (eq) => eq.name,
    renderRowMenu: DiffEqRowMenu,
    emptyMessage: "No differential equations yet",
    renderHeaderAction: () => <DifferentialEquationsSectionHeaderAction />,
  });
