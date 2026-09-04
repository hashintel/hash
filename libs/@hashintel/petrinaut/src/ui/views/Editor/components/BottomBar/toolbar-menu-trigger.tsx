import { Icon, type IconName } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

const triggerStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "[2px]",
    border: "none",
    borderRadius: "lg",
    cursor: "pointer",
    transition: "[all 0.2s ease]",
    backgroundColor: "[transparent]",
    color: "neutral.s110",
    height: "8",
    paddingX: "[6px]",
    fontSize: "xl",
    "& > *": {
      transition: "[transform 0.2s ease]",
    },
    _hover: {
      color: "neutral.s120",
      "& > *": {
        transform: "[scale(1.05)]",
      },
    },
    _active: {
      "& > *": {
        transform: "[scale(0.95)]",
      },
    },
  },
  variants: {
    isActive: {
      true: {
        color: "[#3b82f6]",
        _hover: {
          color: "[#2563eb]",
        },
      },
    },
  },
});

const chevronStyle = css({
  opacity: "[0.5]",
});

/**
 * The button a toolbar dropdown opens from: the mode it would apply, and a
 * chevron saying there is a choice behind it.
 */
export const ToolbarMenuTrigger: React.FC<{
  icon: IconName;
  isActive: boolean;
  ariaLabel: string;
}> = ({ icon, isActive, ariaLabel }) => (
  <button
    type="button"
    className={triggerStyle({ isActive })}
    aria-label={ariaLabel}
  >
    <Icon name={icon} />
    <Icon name="chevronDown" size="xs" className={chevronStyle} />
  </button>
);
