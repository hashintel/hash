import { css, cva, cx } from "@hashintel/ds-helpers/css";
import type { CSSProperties, ReactNode } from "react";

const CheckIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M11.6667 3.5L5.25 9.91667L2.33333 7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const menuItemStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "[6px]",
    minHeight: "[28px]",
    minWidth: "[130px]",
    padding: "[8px]",
    borderRadius: "md.4",
    cursor: "pointer",
    transition: "[background-color 0.15s ease]",
    width: "[100%]",
  },
  variants: {
    isSelected: {
      true: {
        backgroundColor: "bg.accent.subtle",
      },
      false: {
        backgroundColor: "[transparent]",
        _hover: {
          backgroundColor: "gray.10",
        },
      },
    },
    isDisabled: {
      true: {
        opacity: "[0.5]",
        cursor: "not-allowed",
        _hover: {
          backgroundColor: "[transparent]",
        },
      },
      false: {},
    },
  },
  defaultVariants: {
    isSelected: false,
    isDisabled: false,
  },
});

const iconContainerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  width: "[14px]",
  height: "[14px]",
  color: "gray.70",
});

const labelContainerStyle = css({
  display: "flex",
  flex: "1",
  alignItems: "center",
  gap: "[6px]",
  minWidth: "[0px]",
  height: "[100%]",
});

const labelStyle = css({
  fontWeight: "medium",
  fontSize: "[14px]",
  lineHeight: "[14px]",
  color: "gray.90",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const checkIconStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: "0",
  width: "[14px]",
  height: "[14px]",
  color: "gray.90",
});

const trailingContentStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: "0",
});

interface PopoverMenuItemProps {
  /** Icon to display on the left side */
  icon?: ReactNode;
  /** Label text for the menu item */
  label: string;
  /** Whether the item is currently selected */
  isSelected?: boolean;
  /** Whether the item is disabled */
  isDisabled?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Optional trailing content (e.g., input field) */
  trailingContent?: ReactNode;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
}

/**
 * PopoverMenuItem provides a selectable menu item within a PopoverSection.
 *
 * Features:
 * - Optional leading icon
 * - Label text
 * - Selected state with checkmark
 * - Optional trailing content (e.g., input field)
 */
export const PopoverMenuItem: React.FC<PopoverMenuItemProps> = ({
  icon,
  label,
  isSelected = false,
  isDisabled = false,
  onClick,
  trailingContent,
  className,
  style,
}) => {
  const handleClick = () => {
    if (!isDisabled && onClick) {
      onClick();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="menuitemradio"
      tabIndex={isDisabled ? -1 : 0}
      aria-checked={isSelected}
      aria-disabled={isDisabled}
      className={cx(menuItemStyle({ isSelected, isDisabled }), className)}
      style={style}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {icon && <div className={iconContainerStyle}>{icon}</div>}
      <div className={labelContainerStyle}>
        <span className={labelStyle}>{label}</span>
      </div>
      {trailingContent && (
        <div className={trailingContentStyle}>{trailingContent}</div>
      )}
      {isSelected && !trailingContent && (
        <div className={checkIconStyle}>
          <CheckIcon />
        </div>
      )}
    </div>
  );
};
