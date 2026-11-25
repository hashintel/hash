import { Button, ButtonGroup } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import type { FlowShape } from "./run-path";
import type { ReactNode } from "react";

const host = css({
  position: "relative",
  display: "flex",
  flex: "1",
  minWidth: "0",
  minHeight: "0",
});

/*
 * Provisional until designed, and only decided here: the top left of the canvas, in a box like the canvas toolbar's,
 * so it reads as a canvas control rather than as tabs. Over the net it sits below Petrinaut's 48px header, whose nets
 * menu takes the corner.
 */
const floating = cva({
  base: {
    position: "absolute",
    zIndex: "docked",
    left: "4",
    p: "1",
    borderRadius: "lg",
    bg: "bgSolid.min",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "bd.subtle",
    boxShadow: "sm",
  },
  variants: { overNet: { false: { top: "4" }, true: { top: "16" } } },
});

/** Fills the editor's body with the net, or why there's none, for {@link NetSwitch} to float over. */
export const NetSwitchHost = ({ children }: { children: ReactNode }) => (
  <div className={host}>{children}</div>
);

/** Switches between the flow's steps and its Petri net. Goes after what it floats over. */
export const NetSwitch = ({
  shape,
  overNet = false,
  onShapeChange,
}: {
  shape: FlowShape;
  /** Whether it floats over Petrinaut's net, below its header. */
  overNet?: boolean;
  onShapeChange: (shape: FlowShape) => void;
}) => (
  <div
    role="group"
    aria-label="Show the flow as"
    className={floating({ overNet })}
  >
    <ButtonGroup spacing="xxs" noWrap>
      <Button
        variant={shape === "flow" ? "subtle" : "ghost"}
        size="sm"
        iconName="diagramSubtask"
        aria-pressed={shape === "flow"}
        onClick={() => onShapeChange("flow")}
      >
        Flow
      </Button>
      <Button
        variant={shape === "net" ? "subtle" : "ghost"}
        size="sm"
        iconName="diagramProject"
        aria-pressed={shape === "net"}
        onClick={() => onShapeChange("net")}
      >
        Petri net
      </Button>
    </ButtonGroup>
  </div>
);
