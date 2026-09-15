import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ToolbarButton } from "./toolbar-button";

/** Which set of controls the mode-switch bar shows. */
export type BarFace = "edit" | "simulate";

const wellStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[2px]",
  padding: "[2px]",
  borderRadius: "lg",
  borderWidth: "thin",
  borderColor: "neutral.a50",
  backgroundColor: "neutral.a10",
});

const raisedStyle = css({
  "& > [aria-pressed='true']": {
    backgroundColor: "[white]",
    boxShadow: "[0 1px 2px rgba(0, 0, 0, 0.12)]",
  },
});

/**
 * The Edit / Simulate switch at the end of the mode-switch bar. The chosen
 * face sits raised out of a recessed well, the way the design file draws it.
 *
 * While a run holds the net, the edit face has nothing to offer; the switch
 * stays where it is with that segment locked, so the bar keeps its shape and
 * the tooltip says what unlocks it.
 */
export const FaceSwitch: React.FC<{
  face: BarFace;
  canEdit: boolean;
  onFaceChange: (face: BarFace) => void;
}> = ({ face, canEdit, onFaceChange }) => (
  <div
    role="group"
    aria-label="Toolbar controls"
    className={`${wellStyle} ${raisedStyle}`}
  >
    <ToolbarButton
      tooltip={canEdit ? "Editing tools" : "Reset the simulation to edit"}
      ariaLabel="Show editing tools"
      isSelected={face === "edit"}
      disabled={!canEdit}
      onClick={canEdit ? () => onFaceChange("edit") : undefined}
    >
      <Icon name="pencil" size="sm" />
    </ToolbarButton>
    <ToolbarButton
      tooltip="Simulation controls"
      ariaLabel="Show simulation controls"
      isSelected={face === "simulate"}
      tone="simulation"
      onClick={() => onFaceChange("simulate")}
    >
      <Icon name="playFilled" size="sm" />
    </ToolbarButton>
  </div>
);
