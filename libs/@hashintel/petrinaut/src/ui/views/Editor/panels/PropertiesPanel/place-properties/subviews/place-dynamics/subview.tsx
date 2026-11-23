import { use } from "react";

import { Toggle, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { usePetrinautMutations } from "../../../../../../../../react";
import { ActiveNetContext } from "../../../../../../../../react/document/active-net-context";
import { useIsReadOnly } from "../../../../../../../../react/editing/use-is-read-only";
import { useEditorActions } from "../../../../../../../../react/state/editor-context";
import { UI_MESSAGES } from "../../../../../../../constants/ui-messages";
import { usePlacePropertiesContext } from "../../context";
import { composableEquations } from "./compose-dynamics";
import { DynamicsTable } from "./dynamics-table";

const hintStyle = css({
  fontSize: "[12px]",
  color: "neutral.s95",
  paddingY: "2",
});

const contentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingY: "1",
});

/**
 * The equations composed into the selected place's dynamics, in the order
 * they are applied; their derivatives are summed every step.
 */
export const PlaceDynamicsContent: React.FC = () => {
  const { place } = usePlacePropertiesContext();
  const { updatePlace } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const {
    activeNet: { differentialEquations },
  } = use(ActiveNetContext);
  const { selectItem } = useEditorActions();
  const terms = place.dynamics ?? [];

  if (place.colorId === null) {
    return (
      <div className={hintStyle}>{UI_MESSAGES.DYNAMICS_REQUIRES_TYPE}</div>
    );
  }
  const candidates = composableEquations(place, differentialEquations);
  if (terms.length === 0 && candidates.length === 0) {
    return (
      <div className={hintStyle}>
        This type has no equations yet. Create one in the Differential Equations
        group of the left sidebar, then add it here.
      </div>
    );
  }

  return (
    <div className={contentStyle}>
      {place.dynamicsEnabled ? null : (
        <div className={hintStyle}>
          Dynamics are switched off: these equations are kept but not
          integrated.
        </div>
      )}
      <DynamicsTable
        terms={terms}
        equations={differentialEquations}
        candidates={candidates}
        readOnly={isReadOnly}
        onChange={(dynamics) =>
          updatePlace({ placeId: place.id, update: { dynamics } })
        }
        onOpen={(id) => selectItem({ type: "differentialEquation", id })}
      />
    </div>
  );
};

/** The header's switch that runs or pauses the place's equations. */
export const PlaceDynamicsHeaderActions: React.FC = () => {
  const { place } = usePlacePropertiesContext();
  const { updatePlace } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();
  const untyped = place.colorId === null;
  const toggleTooltip = isReadOnly
    ? UI_MESSAGES.READ_ONLY_MODE
    : untyped
      ? UI_MESSAGES.DYNAMICS_REQUIRES_TYPE
      : undefined;

  return (
    <Tooltip content={toggleTooltip} disableTooltip={!toggleTooltip}>
      <Toggle
        aria-label="Dynamics enabled"
        size="sm"
        tone="success"
        value={!untyped && place.dynamicsEnabled}
        disabled={isReadOnly || untyped}
        onChange={(dynamicsEnabled) =>
          updatePlace({ placeId: place.id, update: { dynamicsEnabled } })
        }
      />
    </Tooltip>
  );
};
