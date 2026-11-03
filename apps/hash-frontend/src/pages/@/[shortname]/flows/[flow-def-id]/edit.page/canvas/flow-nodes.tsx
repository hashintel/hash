import { Box } from "@mui/material";
import { Handle, Position } from "@xyflow/react";

import { Icon, Tooltip } from "@hashintel/ds-components";

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

const getBorderColor = (selected: boolean) =>
  selected ? "var(--colors-blue-bd-strong)" : "var(--colors-neutral-bd-subtle)";

const portStyles = {
  "& .react-flow__handle": {
    width: 7,
    height: 7,
    minWidth: 0,
    minHeight: 0,
    background: "var(--colors-neutral-s00)",
    border: "1px solid var(--colors-neutral-bd-strong)",
  },
  "& .react-flow__handle:hover .port-add": { opacity: 1 },
};

/** Shown on port hover. It sits inside the handle, so dragging from it still draws a connection. */
const PortAdd = ({ stepId }: { stepId: string | null }) => {
  const { openAddMenuAfter } = useCanvasActions();

  return (
    <Box
      component="button"
      type="button"
      className="port-add nodrag nopan"
      aria-label={`Add a ${stepNoun.singular} after this`}
      onClick={(event) => {
        event.stopPropagation();
        openAddMenuAfter(event.currentTarget, stepId);
      }}
      sx={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        padding: 0,
        cursor: "pointer",
        opacity: 0,
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
    </Box>
  );
};

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
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {problems.map((problem, index) => (
            // eslint-disable-next-line react/no-array-index-key -- two problems may have the same message
            <Box component="li" key={index}>
              {problem.message}
            </Box>
          ))}
        </Box>
      }
    >
      <Box
        component="span"
        tabIndex={0}
        sx={{
          display: "flex",
          color: hasErrors
            ? "var(--colors-red-fg-muted)"
            : "var(--colors-orange-fg-muted)",
        }}
      >
        <Icon
          name="warning"
          size="xs"
          alt={`${problems.length} ${problems.length === 1 ? "problem" : "problems"}`}
        />
      </Box>
    </Tooltip>
  );
};

const oneLine = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

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
  <Box
    sx={{
      ...portStyles,
      display: "flex",
      gap: 1,
      alignItems: "flex-start",
      boxSizing: "border-box",
      width: stepCardSize.width,
      height: stepCardSize.height,
      padding: "12px",
      borderRadius: "8px",
      border: `1px solid ${getBorderColor(selected)}`,
      boxShadow: selected
        ? "inset 0 0 0 0.5px var(--colors-blue-bd-strong)"
        : undefined,
      background: "var(--colors-neutral-s00)",
    }}
  >
    <StepIconTile icon={icon} tone={tone} size="large" />
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        minWidth: 0,
        flex: 1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box
          component="span"
          sx={{
            ...oneLine,
            flex: 1,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--colors-neutral-fg-heading)",
          }}
        >
          {title}
        </Box>
        <ProblemsMarker problems={problems} />
      </Box>
      <Box
        component="span"
        sx={{
          ...oneLine,
          fontSize: 12,
          color: description
            ? "var(--colors-neutral-fg-muted)"
            : "var(--colors-neutral-fg-subtle)",
        }}
      >
        {description || "Add a description…"}
      </Box>
    </Box>
    {children}
  </Box>
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

export const ForEachNode = ({
  data: { step, problems, inner },
  selected,
}: NodeProps<ForEachStepNode>) => {
  const { title, description, icon, tone } = getStepDisplay(step);

  return (
    <Box
      sx={{
        ...portStyles,
        boxSizing: "border-box",
        width: "100%",
        height: "100%",
        borderRadius: "8px",
        border: `1px solid ${getBorderColor(selected)}`,
        boxShadow: selected
          ? "inset 0 0 0 0.5px var(--colors-blue-bd-strong)"
          : undefined,
        background: "var(--colors-neutral-bg-solid-surface)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          height: forEachBoxPadding.header,
          px: `${forEachBoxPadding.side}px`,
        }}
      >
        <StepIconTile icon={icon} tone={tone} size="small" />
        <Box
          component="span"
          sx={{
            ...oneLine,
            flex: 1,
            fontSize: 12,
            fontWeight: 500,
            color: "var(--colors-neutral-fg-heading)",
          }}
        >
          {description || title}
        </Box>
        <ProblemsMarker problems={problems} />
      </Box>
      <Handle type="target" position={Position.Left} isConnectable={!inner} />
      <Handle type="source" position={Position.Right} isConnectable={!inner}>
        {selected && !inner && <PortAdd stepId={step.stepId} />}
      </Handle>
    </Box>
  );
};
