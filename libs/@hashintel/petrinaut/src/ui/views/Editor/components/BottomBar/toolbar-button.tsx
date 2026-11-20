import { cva } from "@hashintel/ds-helpers/css";

import { ShortcutTooltip } from "../../../../keyboard-shortcut";

import type { CSSProperties, ReactNode, Ref } from "react";

const buttonStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: "lg",
    cursor: "pointer",
    transition: "[all 0.2s ease]",
    backgroundColor: "[transparent]",
    color: "neutral.s110",
    width: "8",
    height: "8",
    fontSize: "xl",
    _hover: {
      transform: "[scale(1.1)]",
      color: "neutral.s120",
    },
    _active: {
      transform: "[scale(0.95)]",
      color: "neutral.s120",
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
  tooltip: string;
  shortcut?: string;
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
  /** Whether the button is in a selected state */
  isSelected?: boolean;
  /** Whether the button appears disabled (lower opacity, but still clickable) */
  disabled?: boolean;
  ariaLabel: string;
  ariaExpanded?: boolean;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  /** Forwarded to the underlying `<button>` (e.g. to anchor a popover) */
  ref?: Ref<HTMLButtonElement>;
  /**
   * Anything else reaches the `<button>`. A control that opens a popover marks
   * itself `data-state="open"` through this, which is what the bar watches to
   * stay unfolded while the popover it anchors is up.
   */
  [dataAttribute: `data-${string}`]: unknown;
}

export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  tooltip,
  shortcut,
  onClick,
  children,
  style,
  isSelected = false,
  disabled = false,
  ariaLabel,
  ariaExpanded,
  draggable = false,
  onDragStart,
  ref,
  ...rest
}) => (
  <ShortcutTooltip label={tooltip} shortcut={shortcut}>
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={buttonStyle({ isSelected, isDisabled: disabled })}
      style={style}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-pressed={isSelected}
      aria-disabled={disabled}
      draggable={draggable}
      onDragStart={onDragStart}
      // Safari reaches a button with Tab, and focuses it on a click, only
      // when its tabindex is set.
      tabIndex={0}
      {...rest}
    >
      {children}
    </button>
  </ShortcutTooltip>
);
