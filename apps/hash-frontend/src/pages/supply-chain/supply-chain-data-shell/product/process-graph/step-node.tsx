import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, type CSSProperties } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { token } from "@hashintel/ds-helpers/tokens";

import { StepCard } from "../shared/step-card";

import type { GraphNode } from "../../../shared/types";

type StepNodeData = GraphNode & {
  onClick?: (id: string) => void;
  timeRange?: string;
};

const nodeWrap = css({ w: "[240px]" });
const handleStyle: CSSProperties = {
  background: token.var("colors.bd.subtle"),
  width: 8,
  height: 8,
  border: "1px solid #ffffff",
};

const StepNodeComponent = ({ data }: NodeProps & { data: StepNodeData }) => {
  return (
    <div className={nodeWrap}>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <StepCard
        node={data}
        onClick={() => data.onClick?.(data.id)}
        timeRange={data.timeRange}
      />
    </div>
  );
};

export const StepNode = memo(StepNodeComponent);
