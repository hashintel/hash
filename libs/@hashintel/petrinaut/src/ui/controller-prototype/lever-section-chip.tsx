import { use } from "react";

import { Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { SDCPNContext } from "../../react/state/sdcpn-context";
import { LeverGlyph } from "./lever-glyph";
import { joinNames, leverFallback, leverLabel } from "./lever-node";

import type {
  TransitionPart,
  TransitionPartHolder,
} from "../../react/controller-prototype/controllers";

const chipStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  flexShrink: "0",
  marginLeft: "2",
  height: "[20px]",
  paddingX: "1.5",
  fontSize: "xs",
  fontWeight: "normal",
  color: "neutral.s110",
  backgroundColor: "neutral.s20",
  borderRadius: "md",
  whiteSpace: "nowrap",
  cursor: "default",
  _focusVisible: {
    outline: "[2px solid {colors.blue.s60}]",
    outlineOffset: "[1px]",
  },
});

const tooltipTitleStyle = css({ fontWeight: "medium" });

const plural = (count: number) => `${count} field${count === 1 ? "" : "s"}`;

/**
 * A chip after a transition section title naming the controllers that decide
 * that part: Firing Time for Rate and Choice, Transition Results for Token
 * field.
 */
export const LeverSectionChip: React.FC<{
  transitionId: string;
  part: TransitionPart;
  holders: TransitionPartHolder[];
}> = ({ transitionId, part, holders }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const lambdaType =
    petriNetDefinition.transitions.find((t) => t.id === transitionId)
      ?.lambdaType ?? null;

  const lever = {
    controllerNames: holders.map(({ controller }) => controller.name),
    kinds: [part === "firing" ? ("rate" as const) : ("tokenField" as const)],
  };
  const label =
    part === "firing"
      ? joinNames(lever.controllerNames)
      : holders
          .map(
            ({ controller, fieldCount }) =>
              `${controller.name} · ${plural(fieldCount)}`,
          )
          .join(", ");
  const title = leverLabel(lever);
  const fallback = leverFallback(lever, lambdaType);

  return (
    <Tooltip
      position="bottom"
      content={
        <>
          <div className={tooltipTitleStyle}>{title}</div>
          <div>{fallback}</div>
        </>
      }
    >
      <span
        className={chipStyle}
        tabIndex={0}
        role="button"
        aria-label={`${title}. ${fallback}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.stopPropagation();
          }
        }}
      >
        <LeverGlyph size={12} />
        {label}
      </span>
    </Tooltip>
  );
};
