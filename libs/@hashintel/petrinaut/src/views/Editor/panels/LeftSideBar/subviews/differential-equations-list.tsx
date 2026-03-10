import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { TbPlus, TbX } from "react-icons/tb";
import { v4 as uuidv4 } from "uuid";

import { IconButton } from "../../../../../components/icon-button";
import type { SubView } from "../../../../../components/sub-view/types";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import { DEFAULT_DIFFERENTIAL_EQUATION_CODE } from "../../../../../core/default-codes";
import { EditorContext } from "../../../../../state/editor-context";
import { SDCPNContext } from "../../../../../state/sdcpn-context";
import { useIsReadOnly } from "../../../../../state/use-is-read-only";
import { createFilterableListSubView } from "./filterable-list-sub-view";

const equationNameContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  flex: "[1]",
});

/**
 * DifferentialEquationsSectionHeaderAction renders the add button for the section header.
 */
const DifferentialEquationsSectionHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { types, differentialEquations },
    addDifferentialEquation,
  } = use(SDCPNContext);
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

/**
 * SubView definition for Differential Equations list.
 */
export const differentialEquationsListSubView: SubView =
  createFilterableListSubView({
    id: "differential-equations-list",
    title: "Differential Equations",
    tooltip: `Differential equations govern how token data changes over time when tokens remain in a place ("dynamics").`,
    defaultCollapsed: true,
    resizable: {
      defaultHeight: 100,
      minHeight: 60,
      maxHeight: 250,
    },
    useItems: () => {
      const {
        petriNetDefinition: { differentialEquations },
      } = use(SDCPNContext);
      return differentialEquations;
    },
    getSelectionItem: (eq) => ({ type: "differentialEquation", id: eq.id }),
    renderItem: (eq, _isSelected) => {
      const { removeDifferentialEquation } = use(SDCPNContext);
      const isReadOnly = useIsReadOnly();

      return (
        <>
          <div className={equationNameContainerStyle}>
            <span>{eq.name}</span>
          </div>
          <IconButton
            size="xxs"
            variant="ghost"
            colorScheme="red"
            disabled={isReadOnly}
            onClick={() => removeDifferentialEquation(eq.id)}
            aria-label={`Delete equation ${eq.name}`}
            tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
          >
            <TbX />
          </IconButton>
        </>
      );
    },
    emptyMessage: "No differential equations yet",
    renderHeaderAction: () => <DifferentialEquationsSectionHeaderAction />,
  });
