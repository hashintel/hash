import { use } from "react";
import { v4 as uuidv4 } from "uuid";

import { Button, Icon } from "@hashintel/ds-components";
import { DEFAULT_DIFFERENTIAL_EQUATION_CODE } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react/hooks/use-petrinaut-mutations";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { DifferentialEquationIcon } from "../../../../../constants/entity-icons";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import {
  RowMenu,
  createFilterableListSubView,
} from "./filterable-list-sub-view";

import type { SubView } from "../../../../../components/sub-view/types";

/**
 * DifferentialEquationsSectionHeaderAction renders the add button for the section header.
 */
export const DifferentialEquationsSectionHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { types, differentialEquations },
    extensions,
  } = use(SDCPNContext);
  const { addDifferentialEquation } = usePetrinautMutations();
  const { selectItem } = use(EditorContext);

  const isReadOnly = useIsReadOnly();
  const isDisabled = isReadOnly || !extensions.colors || !extensions.dynamics;
  let tooltip = "Add differential equation";
  if (isReadOnly) {
    tooltip = UI_MESSAGES.READ_ONLY_MODE;
  } else if (!extensions.colors || !extensions.dynamics) {
    tooltip = UI_MESSAGES.EXTENSION_UNAVAILABLE;
  }

  return (
    <Button
      aria-label="Add differential equation"
      size="xs"
      variant="ghost"
      disabled={isDisabled}
      tooltip={tooltip}
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
  const { removeDifferentialEquation } = usePetrinautMutations();
  const { extensions } = use(SDCPNContext);
  const isReadOnly = useIsReadOnly();
  const isDisabled = isReadOnly || !extensions.colors || !extensions.dynamics;

  return (
    <RowMenu
      items={[
        {
          id: "delete",
          label: "Delete",
          icon: <Icon name="trash" size="sm" />,
          destructive: true,
          disabled: isDisabled,
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
