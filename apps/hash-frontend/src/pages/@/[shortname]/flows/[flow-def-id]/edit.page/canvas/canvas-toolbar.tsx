import { Box } from "@mui/material";
import { useReactFlow, useViewport } from "@xyflow/react";

import { Button, ButtonGroup, Icon, Menu } from "@hashintel/ds-components";

import { getAddStepMenuItems } from "../shared/step-display";

export type CanvasTool = "hand" | "select";

export const CanvasToolbar = ({
  tool,
  onToolChange,
  onAddStep,
  onOrganize,
  canOrganize,
}: {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  onAddStep: (actionDefinitionId: string) => void;
  onOrganize: () => void;
  canOrganize: boolean;
}) => {
  const { zoom } = useViewport();
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  const zoomPercent = `${Math.round(zoom * 100)}%`;

  return (
    <Box
      sx={{
        p: 0.5,
        borderRadius: 2,
        background: ({ palette }) => palette.common.white,
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        boxShadow: ({ boxShadows }) => boxShadows.sm,
      }}
    >
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
                  icon: "oneHundred",
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
        <Box
          sx={{
            width: "1px",
            height: 20,
            background: "var(--colors-neutral-bd-solid)",
          }}
        />
        <Menu
          position="top-start"
          trigger={
            <Button
              variant="ghost"
              size="md"
              iconName="plus"
              tooltip="Add action"
            />
          }
          items={getAddStepMenuItems(onAddStep)}
        />
        <Button
          variant="ghost"
          size="md"
          iconName="list"
          tooltip="Organize"
          disabled={!canOrganize}
          onClick={onOrganize}
        />
      </ButtonGroup>
    </Box>
  );
};
