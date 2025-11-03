import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";
import type { DragEvent } from "react";
import { useEffect } from "react";
import { FaArrowPointer, FaCircle, FaHand, FaSquare } from "react-icons/fa6";

import { Tooltip } from "../../../components/tooltip";
import type { EditorState } from "../../../state/editor-store";

type EditorEditionMode = EditorState["editionMode"];

interface BottomBarProps {
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  editionMode,
  onEditionModeChange,
}) => {
  // Keyboard shortcuts for switching modes
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Don't trigger if focus is in an input, textarea, or contentEditable element
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isInputFocused) {
        return;
      }

      // Check that no modifier keys are pressed
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
      }

      // Switch modes based on key
      switch (event.key.toLowerCase()) {
        case "v":
          event.preventDefault();
          onEditionModeChange("select");
          break;
        case "h":
          event.preventDefault();
          onEditionModeChange("pan");
          break;
        case "n":
          event.preventDefault();
          onEditionModeChange("add-place");
          break;
        case "t":
          event.preventDefault();
          onEditionModeChange("add-transition");
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onEditionModeChange]);

  function onDragStart(
    event: DragEvent<HTMLDivElement>,
    nodeType: "place" | "transition",
  ) {
    event.dataTransfer.setData("application/reactflow", nodeType);

    // eslint-disable-next-line no-param-reassign
    event.dataTransfer.effectAllowed = "move";
  }

  const getIconContainerStyle = (mode: EditorEditionMode) => {
    const isSelected = editionMode === mode;
    return css({
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "[50px]",
      height: "[50px]",
      fontSize: "[24px]",
      color: isSelected ? "[#3b82f6]" : "core.gray.70",
      transition: "[all 0.2s ease]",
      "&:hover": {
        color: isSelected ? "[#2563eb]" : "core.gray.90",
        transform: "[scale(1.1)]",
      },
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
      }}
    >
      <RefractivePane
        radius={12}
        blur={1.5}
        specularOpacity={0}
        scaleRatio={1}
        bezelWidth={20}
        glassThickness={120}
        refractiveIndex={1.5}
        className={css({
          padding: "spacing.4",
          paddingX: "spacing.6",
          borderRadius: "[12px]",
          backgroundColor: "[rgba(255, 255, 255, 0.8)]",
          boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.15)]",
          display: "flex",
          alignItems: "center",
          gap: "spacing.4",
        })}
      >
        <Tooltip content="Select (V)">
          <div
            className={getIconContainerStyle("select")}
            onClick={() => onEditionModeChange("select")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEditionModeChange("select");
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Select mode"
          >
            <FaArrowPointer />
          </div>
        </Tooltip>
        <Tooltip content="Pan (H)">
          <div
            className={getIconContainerStyle("pan")}
            onClick={() => onEditionModeChange("pan")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEditionModeChange("pan");
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Pan mode"
          >
            <FaHand />
          </div>
        </Tooltip>
        <Tooltip content="Add Place (N)">
          <div
            className={getIconContainerStyle("add-place")}
            draggable
            onDragStart={(event) => {
              onDragStart(event, "place");
              onEditionModeChange("add-place");
            }}
            onClick={() => onEditionModeChange("add-place")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEditionModeChange("add-place");
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Add place mode"
          >
            <FaCircle />
          </div>
        </Tooltip>
        <Tooltip content="Add Transition (T)">
          <div
            className={getIconContainerStyle("add-transition")}
            draggable
            onDragStart={(event) => {
              onDragStart(event, "transition");
              onEditionModeChange("add-transition");
            }}
            onClick={() => onEditionModeChange("add-transition")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEditionModeChange("add-transition");
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Add transition mode"
          >
            <FaSquare />
          </div>
        </Tooltip>
        <div
          className={css({
            background: "core.gray.20",
            width: "[1px]",
            height: "[40px]",
          })}
        />
      </RefractivePane>
    </div>
  );
};
