import { css, cva } from "@hashintel/ds-helpers/css";
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

const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
});

const equationRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "[4px 2px 4px 8px]",
    fontSize: "[13px]",
    borderRadius: "sm",
    cursor: "pointer",
  },
  variants: {
    isSelected: {
      true: {
        backgroundColor: "[rgba(59, 130, 246, 0.15)]",
        _hover: {
          backgroundColor: "[rgba(59, 130, 246, 0.2)]",
        },
      },
      false: {
        backgroundColor: "neutral.s10",
        _hover: {
          backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        },
      },
    },
  },
});

const equationNameContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const emptyMessageStyle = css({
  fontSize: "[13px]",
  color: "[#9ca3af]",
});

/**
 * DifferentialEquationsSectionContent displays the list of differential equations.
 * This is the content portion without the collapsible header.
 */
const DifferentialEquationsSectionContent: React.FC = () => {
  const {
    petriNetDefinition: { differentialEquations },
    removeDifferentialEquation,
  } = use(SDCPNContext);

  const { selectedResourceId, setSelectedResourceId } = use(EditorContext);

  const isReadOnly = useIsReadOnly();

  return (
    <div className={listContainerStyle}>
      {differentialEquations.map((eq) => {
        const isSelected = selectedResourceId === eq.id;

        return (
          <div
            key={eq.id}
            onClick={(event) => {
              // Don't trigger selection if clicking the delete button
              if (
                event.target instanceof HTMLElement &&
                event.target.closest("button[aria-label^='Delete']")
              ) {
                return;
              }
              setSelectedResourceId(eq.id);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setSelectedResourceId(eq.id);
              }
            }}
            className={equationRowStyle({ isSelected })}
          >
            <div className={equationNameContainerStyle}>
              <span>{eq.name}</span>
            </div>
            <IconButton
              size="xxs"
              variant="ghost"
              colorScheme="red"
              disabled={isReadOnly}
              onClick={() => {
                if (
                  // eslint-disable-next-line no-alert
                  window.confirm(
                    `Delete equation "${eq.name}"? Any places referencing this equation will have their differential equation reset.`,
                  )
                ) {
                  removeDifferentialEquation(eq.id);
                }
              }}
              aria-label={`Delete equation ${eq.name}`}
              tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
            >
              <TbX />
            </IconButton>
          </div>
        );
      })}
      {differentialEquations.length === 0 && (
        <div className={emptyMessageStyle}>No differential equations yet</div>
      )}
    </div>
  );
};

/**
 * DifferentialEquationsSectionHeaderAction renders the add button for the section header.
 */
const DifferentialEquationsSectionHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { types, differentialEquations },
    addDifferentialEquation,
  } = use(SDCPNContext);
  const { setSelectedResourceId } = use(EditorContext);

  const isReadOnly = useIsReadOnly();

  return (
    <IconButton
      aria-label="Add differential equation"
      size="xxs"
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
        setSelectedResourceId(id);
      }}
    >
      <TbPlus />
    </IconButton>
  );
};

/**
 * SubView definition for Differential Equations list.
 */
export const differentialEquationsListSubView: SubView = {
  id: "differential-equations-list",
  title: "Differential Equations",
  tooltip: `Differential equations govern how token data changes over time when tokens remain in a place ("dynamics").`,
  component: DifferentialEquationsSectionContent,
  renderHeaderAction: () => <DifferentialEquationsSectionHeaderAction />,
  defaultCollapsed: true,
  resizable: {
    defaultHeight: 100,
    minHeight: 60,
    maxHeight: 250,
  },
};
