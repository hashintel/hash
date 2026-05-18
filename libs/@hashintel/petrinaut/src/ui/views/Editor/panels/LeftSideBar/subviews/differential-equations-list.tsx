import { Icon } from "@hashintel/ds-components";
import { use } from "react";
import { v4 as uuidv4 } from "uuid";

import { Button } from "../../../../../components/button";
import type { SubView } from "../../../../../components/sub-view/types";
import { DifferentialEquationIcon } from "../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import { DEFAULT_DIFFERENTIAL_EQUATION_CODE } from "@hashintel/petrinaut-core/default-codes";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { MutationContext } from "../../../../../../react/state/mutation-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import {
  RowMenu,
  createFilterableListSubView,
} from "./filterable-list-sub-view";

/**
 * DifferentialEquationsSectionHeaderAction renders the add button for the section header.
 */
export const DifferentialEquationsSectionHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { types, differentialEquations },
  } = use(SDCPNContext);
  const { addDifferentialEquation } = use(MutationContext);
  const { selectItem } = use(EditorContext);

  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label="Add differential equation"
      size="xs"
      variant="ghost"
      disabled={isReadOnly}
      tooltip={
        isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Add differential equation"
      }
      tooltipDisplay="inline"
      iconName="plus"
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
    />
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
          icon: <Icon name="trash" />,
          destructive: true,
          disabled: isReadOnly,
          onClick: () => removeDifferentialEquation({ equationId: item.id }),
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
        petriNetDefinition: { differentialEquations },
      } = use(SDCPNContext);
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
