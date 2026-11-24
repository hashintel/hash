import { useReactFlow, useViewport } from "@xyflow/react";

import { Button, ButtonGroup, Icon, Menu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { AddStepMenu } from "./add-step-menu";

import type { FitViewOptions } from "@xyflow/react";

export type CanvasTool = "hand" | "select";

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

export const CanvasToolbar = ({
  tool,
  onToolChange,
  editing,
  fitPadding,
}: {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  /** `null` on a canvas that can't be edited, such as a run's, which has no Add or Organize. */
  editing: {
    onAddStep: (actionDefinitionId: string) => void;
    onAddMenuOpen: (open: boolean) => void;
    /** Whether the flow has no steps yet, when the add menu recommends some and there's nothing to organize. */
    emptyFlow: boolean;
    onOrganize: () => void;
  } | null;
  /** Keeps Zoom to fit clear of a panel covering the canvas. */
  fitPadding: FitViewOptions["padding"];
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
                    void fitView({ padding: fitPadding });
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
          variant={tool === "hand" ? "subtle" : "ghost"}
          size="md"
          iconName="hand"
          tooltip="Hand"
          aria-pressed={tool === "hand"}
          onClick={() => onToolChange("hand")}
        />
        <Button
          variant={tool === "select" ? "subtle" : "ghost"}
          size="md"
          iconName="cursor"
          tooltip="Select"
          aria-pressed={tool === "select"}
          onClick={() => onToolChange("select")}
        />
        {editing && (
          <>
            <div className={toolbarDivider} />
            <AddStepMenu
              position="top-start"
              trigger={
                <Button
                  variant="ghost"
                  size="md"
                  iconName="plus"
                  tooltip="Add action"
                />
              }
              emptyFlow={editing.emptyFlow}
              onPick={editing.onAddStep}
              onOpen={editing.onAddMenuOpen}
            />
            <Button
              variant="ghost"
              size="md"
              iconName="list"
              tooltip="Organize"
              disabled={editing.emptyFlow}
              onClick={editing.onOrganize}
            />
          </>
        )}
      </ButtonGroup>
    </div>
  );
};
