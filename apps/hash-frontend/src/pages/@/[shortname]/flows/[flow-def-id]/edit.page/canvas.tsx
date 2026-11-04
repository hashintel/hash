import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import { useState } from "react";
import "@xyflow/react/dist/style.css";

import { Button, ButtonGroup, Icon, Menu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

/** What dragging on the canvas does: pan it, or select what's in the dragged box. */
type CanvasTool = "hand" | "select";

const toolbar = css({
  p: "1",
  borderRadius: "lg",
  bg: "bgSolid.min",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  boxShadow: "sm",
});
const toolbarDivider = css({
  width: "[1px]",
  height: "5",
  bg: "neutral.bd.solid",
});

const CanvasToolbar = ({
  tool,
  onToolChange,
}: {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
}) => {
  const { zoom } = useViewport();
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  const zoomPercent = `${Math.round(zoom * 100)}%`;

  return (
    <div className={toolbar}>
      <ButtonGroup spacing="xxs" noWrap>
        <Menu
          position="top-start"
          trigger={
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Zoom ${zoomPercent}`}
              prefix={<Icon name="search" size="sm" />}
              suffix={<Icon name="chevronDown" size="sm" />}
            >
              {zoomPercent}
            </Button>
          }
          items={[
            {
              id: "zoom",
              label: null,
              items: [
                {
                  id: "zoom-in",
                  text: "Zoom in",
                  icon: "zoomIn",
                  onClick: () => {
                    void zoomIn();
                  },
                },
                {
                  id: "zoom-out",
                  text: "Zoom out",
                  icon: "zoomOut",
                  onClick: () => {
                    void zoomOut();
                  },
                },
              ],
            },
            {
              id: "zoom-to",
              label: null,
              items: [
                {
                  id: "zoom-to-fit",
                  text: "Zoom to fit",
                  icon: "expand",
                  onClick: () => {
                    void fitView();
                  },
                },
                {
                  id: "zoom-to-100",
                  text: "Zoom to 100%",
                  icon: "search",
                  onClick: () => {
                    void zoomTo(1);
                  },
                },
              ],
            },
          ]}
        />
        <Button
          variant={tool === "hand" ? "solid" : "ghost"}
          tone={tool === "hand" ? "brand" : "neutral"}
          size="md"
          iconName="hand"
          tooltip="Hand"
          aria-pressed={tool === "hand"}
          onClick={() => onToolChange("hand")}
        />
        <Button
          variant={tool === "select" ? "solid" : "ghost"}
          tone={tool === "select" ? "brand" : "neutral"}
          size="md"
          iconName="cursor"
          tooltip="Select"
          aria-pressed={tool === "select"}
          onClick={() => onToolChange("select")}
        />
        <div className={toolbarDivider} />
        <Button
          variant="ghost"
          size="md"
          iconName="plus"
          tooltip="Add action"
          disabled
        />
        <Button
          variant="ghost"
          size="md"
          iconName="list"
          tooltip="Organize"
          disabled
        />
      </ButtonGroup>
    </div>
  );
};

/**
 * The canvas a flow is drawn on, with its toolbar. Drawing the flow's steps and connections comes in a later issue.
 */
export const Canvas = () => {
  const [tool, setTool] = useState<CanvasTool>("select");

  return (
    <ReactFlow
      nodes={[]}
      edges={[]}
      panOnDrag={tool === "hand" ? true : [1]}
      selectionOnDrag={tool === "select"}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} />
      <MiniMap position="top-right" pannable zoomable />
      <Panel position="bottom-center">
        <CanvasToolbar tool={tool} onToolChange={setTool} />
      </Panel>
    </ReactFlow>
  );
};
