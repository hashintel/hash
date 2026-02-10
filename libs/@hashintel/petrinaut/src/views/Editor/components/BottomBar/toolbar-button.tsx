import { cva } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

import { Tooltip } from "../../../../components/tooltip";

const buttonStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: "[8px]",
    cursor: "pointer",
    transition: "[all 0.2s ease]",
    backgroundColor: "[transparent]",
    color: "neutral.s70",
    width: "[40px]",
    height: "[40px]",
    fontSize: "[20px]",
    _hover: {
      transform: "[scale(1.1)]",
      color: "neutral.s90",
    },
    _active: {
      transform: "[scale(0.95)]",
      color: "neutral.s90",
    },
  },
  variants: {
    isSelected: {
      true: {
        color: "[#3b82f6]",
        _hover: {
          color: "[#2563eb]",
        },
      },
    },
    isDisabled: {
      true: {
        opacity: "[0.4]",
      },
    },
  },
});

interface ToolbarButtonProps {
  /** Tooltip content shown on hover */
  tooltip: string;
  /** Click handler */
  onClick?: () => void;
  /** Button content (icons, text, etc.) */
  children: ReactNode;
  /** Whether the button is in a selected state */
  isSelected?: boolean;
  /** Whether the button appears disabled (lower opacity, but still clickable) */
  disabled?: boolean;
  /** Accessibility label */
  ariaLabel: string;
  /** Accessibility expanded state */
  ariaExpanded?: boolean;
  /** Whether the button is draggable */
  draggable?: boolean;
  /** Drag start handler */
  onDragStart?: (event: React.DragEvent) => void;
}

/**
 * Unified button component for the BottomBar toolbar.
 * Provides consistent styling, tooltip, and accessibility across all toolbar buttons.
 */
export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  tooltip,
  onClick,
  children,
  isSelected = false,
  disabled = false,
  ariaLabel,
  ariaExpanded,
  draggable = false,
  onDragStart,
}) => {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.key === "Enter" || event.key === " ") && onClick) {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <Tooltip content={tooltip} display="inline">
      <button
        type="button"
        onClick={onClick}
        onKeyDown={handleKeyDown}
        className={buttonStyle({ isSelected, isDisabled: disabled })}
        aria-label={ariaLabel}
        aria-expanded={ariaExpanded}
        aria-pressed={isSelected}
        aria-disabled={disabled}
        draggable={draggable}
        onDragStart={onDragStart}
        tabIndex={0}
      >
        {children}
      </button>
    </Tooltip>
  );
};
