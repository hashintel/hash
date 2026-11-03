import { Handle, Position } from "@xyflow/react";

import { Icon, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { CollapseButton } from "../shared/collapse-button";
import { getStepDisplay, startDisplay, stepNoun } from "../shared/step-display";
import { StepIconTile } from "../shared/step-icon-tile";
import { useCanvasActions } from "./canvas-actions";
import { forEachBoxPadding, stepCardSize } from "./flow-graph";

import type { StepTone } from "../shared/step-display";
import type {
  ActionStepNode,
  ForEachStepNode,
  StartNode as StartNodeType,
} from "./flow-graph";
import type { IconName } from "@hashintel/ds-components";
import type { FlowDefinitionDiagnosticWithStepId } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";
import type { NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";

const ports = css({
  "& .react-flow__handle": {
    width: "[7px]",
    height: "[7px]",
    minWidth: "0",
    minHeight: "0",
    bg: "neutral.s00",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "bd.strong",
  },
  "& .react-flow__handle.connectingto.valid": {
    borderColor: "blue.bd.strong",
  },
  "& .react-flow__handle:hover .port-add": { opacity: "1" },
});

const outline = css({ borderWidth: "1px", borderStyle: "solid" });
const unselectedOutline = css({ borderColor: "bd.subtle" });
const selectedOutline = css({
  borderColor: "blue.bd.strong",
  boxShadow: "[inset 0 0 0 0.5px {colors.blue.bd.strong}]",
});

const getOutline = (selected: boolean) =>
  cx(outline, selected ? selectedOutline : unselectedOutline);

const portAdd = css({
  position: "absolute",
  left: "[50%]",
  top: "[50%]",
  transform: "translate(-50%, -50%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "5",
  height: "5",
  padding: "0",
  cursor: "pointer",
  opacity: "0",
});

/** Shown on port hover. It sits inside the handle, so dragging from it still draws a connection. */
const PortAdd = ({ stepId }: { stepId: string | null }) => {
  const { openAddMenuAfter } = useCanvasActions();

  return (
    <button
      type="button"
      className={cx(portAdd, "port-add nodrag nopan")}
      aria-label={`Add a ${stepNoun.singular} after this`}
      onClick={(event) => {
        event.stopPropagation();
        openAddMenuAfter(event.currentTarget, stepId);
      }}
      /* Inline, as the design system's reset of buttons in its scope outranks classes. */
      style={{
        borderRadius: 10,
        border: "1px solid var(--colors-neutral-bd-solid)",
        background: "var(--colors-neutral-s00)",
        color: "var(--colors-neutral-fg-body)",
      }}
    >
      <Icon name="plus" size="xs" />
    </button>
  );
};

const problemsList = css({ m: "0", pl: "4" });
const problemsMarker = css({ display: "flex" });
const errorsMarker = css({ color: "red.fg.muted" });
const warningsMarker = css({ color: "orange.fg.muted" });

const ProblemsMarker = ({
  problems,
}: {
  problems: FlowDefinitionDiagnosticWithStepId[];
}) => {
  if (problems.length === 0) {
    return null;
  }

  const hasErrors = problems.some(({ severity }) => severity === "error");

  return (
    <Tooltip
      position="top"
      content={
        <ul className={problemsList}>
          {problems.map((problem, index) => (
            // eslint-disable-next-line react/no-array-index-key -- two problems may have the same message
            <li key={index}>{problem.message}</li>
          ))}
        </ul>
      }
    >
      <span
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the problems can be read from the keyboard
        tabIndex={0}
        className={cx(
          problemsMarker,
          hasErrors ? errorsMarker : warningsMarker,
        )}
      >
        <Icon
          name="warning"
          size="xs"
          alt={`${problems.length} ${problems.length === 1 ? "problem" : "problems"}`}
        />
      </span>
    </Tooltip>
  );
};

const card = css({
  display: "flex",
  gap: "2",
  alignItems: "flex-start",
  boxSizing: "border-box",
  padding: "3",
  borderRadius: "lg",
  bg: "neutral.s00",
});
const cardText = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  minWidth: "0",
  flex: "1",
});
const cardTitleRow = css({ display: "flex", alignItems: "center", gap: "1" });
const cardTitle = css({
  truncate: true,
  flex: "1",
  fontSize: "[13px]",
  fontWeight: "medium",
  color: "fg.heading",
});
const cardDescription = css({
  truncate: true,
  fontSize: "xs",
  color: "fg.subtle",
});

const Card = ({
  title,
  description,
  icon,
  tone,
  selected,
  problems,
  children,
}: {
  title: string;
  description: string;
  icon: IconName;
  tone: StepTone;
  selected: boolean;
  problems: FlowDefinitionDiagnosticWithStepId[];
  children: ReactNode;
}) => (
  <div className={cx(ports, card, getOutline(selected))} style={stepCardSize}>
    <StepIconTile icon={icon} tone={tone} size="large" />
    <div className={cardText}>
      <div className={cardTitleRow}>
        <span className={cardTitle}>{title}</span>
        <ProblemsMarker problems={problems} />
      </div>
      <span className={cardDescription}>
        {description || "Add a description…"}
      </span>
    </div>
    {children}
  </div>
);

export const StartNode = (_props: NodeProps<StartNodeType>) => (
  <Card {...startDisplay} selected={false} problems={[]}>
    <Handle type="source" position={Position.Right}>
      <PortAdd stepId={null} />
    </Handle>
  </Card>
);

export const StepNode = ({
  data: { step, problems, inner },
  selected,
}: NodeProps<ActionStepNode>) => (
  <Card {...getStepDisplay(step)} selected={selected} problems={problems}>
    <Handle type="target" position={Position.Left} isConnectable={!inner} />
    <Handle type="source" position={Position.Right} isConnectable={!inner}>
      {selected && !inner && <PortAdd stepId={step.stepId} />}
    </Handle>
  </Card>
);

const forEachBox = css({
  boxSizing: "border-box",
  width: "full",
  height: "full",
  borderRadius: "xl",
  bg: "bgSolid.surface",
});
const forEachHeader = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  px: "2",
});
const forEachChevron = css({ display: "flex" });
const forEachTitle = css({
  truncate: true,
  flex: "1",
  fontSize: "[13px]",
  fontWeight: "medium",
  color: "fg.body",
});

/** Collapsed, the box is a one-line card; its chevron and the Steps tab's group collapse together. */
export const ForEachNode = ({
  data: { step, problems, inner, collapsed },
  selected,
}: NodeProps<ForEachStepNode>) => {
  const { toggleCollapsed } = useCanvasActions();
  const { title, description } = getStepDisplay(step);

  return (
    <div className={cx(ports, forEachBox, getOutline(selected))}>
      <div
        className={forEachHeader}
        style={{ height: collapsed ? "100%" : forEachBoxPadding.header }}
      >
        {!inner && (
          <div className={cx(forEachChevron, "nodrag")}>
            <CollapseButton
              collapsed={collapsed}
              onToggle={() => toggleCollapsed(step.stepId)}
            />
          </div>
        )}
        <span className={forEachTitle}>{description || title}</span>
        <ProblemsMarker problems={problems} />
      </div>
      <Handle type="target" position={Position.Left} isConnectable={!inner} />
      <Handle type="source" position={Position.Right} isConnectable={!inner}>
        {selected && !inner && <PortAdd stepId={step.stepId} />}
      </Handle>
    </div>
  );
};
