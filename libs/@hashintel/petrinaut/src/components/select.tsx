import { Portal } from "@ark-ui/react/portal";
import {
  createListCollection,
  Select as ArkSelect,
} from "@ark-ui/react/select";
import { css, cva, cx } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { FaChevronDown } from "react-icons/fa6";

import { usePortalContainerRef } from "../state/portal-container-context";
import { withTooltip } from "./hoc/with-tooltip";

// -- Helpers ------------------------------------------------------------------

const ConditionalPortal: React.FC<{
  enabled: boolean;
  container?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}> = ({ enabled, container, children }) =>
  enabled ? <Portal container={container}>{children}</Portal> : children;

// -- Figma design tokens ------------------------------------------------------

type SelectSize = "xs" | "sm" | "md" | "lg";

const ICON_SIZE: Record<SelectSize, number> = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
};

// -- Styles -------------------------------------------------------------------

const rootStyle = css({
  width: "[100%]",
});

const triggerStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1.5",
    width: "[100%]",
    boxSizing: "border-box",
    backgroundColor: "neutral.s00",
    borderWidth: "[1px]",
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle",
    fontWeight: "medium",
    color: "neutral.fg.body",
    cursor: "pointer",
    outline: "none",
    transition: "[border-color 0.15s ease, box-shadow 0.15s ease]",
    _hover: {
      borderColor: "neutral.bd.subtle.hover",
    },
    _focusVisible: {
      borderColor: "neutral.bd.subtle",
      boxShadow: "[0px 0px 0px 2px {colors.neutral.a25}]",
    },
    _disabled: {
      backgroundColor: "neutral.s10",
      opacity: "[0.7]",
      cursor: "not-allowed",
    },
  },
  variants: {
    size: {
      xs: {
        height: "[24px]",
        fontSize: "xs",
        borderRadius: "lg",
        paddingX: "1.5",
      },
      sm: {
        height: "[28px]",
        fontSize: "sm",
        borderRadius: "lg",
        paddingX: "2",
      },
      md: {
        height: "[32px]",
        fontSize: "sm",
        borderRadius: "lg",
        paddingX: "2.5",
      },
      lg: {
        height: "[40px]",
        fontSize: "base",
        borderRadius: "xl",
        paddingX: "3",
      },
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

const triggerLabelStyle = css({
  flex: "[1]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textAlign: "left",
});

const placeholderStyle = css({
  color: "neutral.s80",
});

const customTriggerWrapperStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  minWidth: "[0]",
});

const chevronStyle = css({
  flexShrink: 0,
  color: "[rgba(0, 0, 0, 0.3)]",
  display: "flex",
  alignItems: "center",
});

const positionerStyle = css({
  // The shared portal container has `pointer-events: none` so the canvas
  // behind floating panels stays interactive. Re-enable here so dropdown
  // items receive clicks/hover.
  pointerEvents: "auto",
});

const contentStyle = css({
  backgroundColor: "neutral.s00",
  borderRadius: "lg",
  boxShadow:
    "[0px 6px 12px -4px rgba(0, 0, 0, 0.12), 0px 2px 4px -1px rgba(0, 0, 0, 0.04), 0px 0px 0px 1px rgba(0, 0, 0, 0.06)]",
  padding: "1",
  maxHeight: "[200px]",
  overflowY: "auto",
  outline: "none",
  zIndex: "dropdown",
});

const itemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  paddingY: "1.5",
  paddingX: "2",
  borderRadius: "lg",
  fontSize: "sm",
  fontWeight: "medium",
  cursor: "pointer",
  outline: "none",
  color: "neutral.fg.body",
  "&[data-highlighted]": {
    backgroundColor: "neutral.bg.min.hover",
  },
  '&[data-state="checked"]': {
    backgroundColor: "neutral.bg.min.active",
  },
});

// -- Types --------------------------------------------------------------------

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectBaseProps {
  /** Currently selected value */
  value?: string;
  /** Callback when value changes */
  onValueChange?: (value: string) => void;
  /** Available options */
  options: SelectOption[];
  /** Placeholder text when no value selected */
  placeholder?: string;
  /** Size variant */
  size?: SelectSize;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Custom item renderer */
  renderItem?: (option: SelectOption) => ReactNode;
  /**
   * Custom trigger content renderer. When provided, the default trigger
   * layout (label + chevron) is replaced with the returned content.
   * The content is still wrapped in the styled trigger button.
   */
  renderTrigger?: (params: {
    selectedOption: SelectOption | undefined;
    open: boolean;
  }) => ReactNode;
  /** Additional class name for the trigger */
  triggerClassName?: string;
  /** Additional class name for the root */
  className?: string;
  /** Ark UI positioning options */
  positioning?: { sameWidth?: boolean };
  /** Whether to portal the dropdown. Set to false when inside a Dialog. */
  portal?: boolean;
}

// -- Component ----------------------------------------------------------------

const SelectBase: React.FC<SelectBaseProps> = ({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  size = "sm",
  disabled = false,
  renderItem,
  renderTrigger,
  triggerClassName,
  className,
  positioning,
  portal = false,
}) => {
  const portalContainerRef = usePortalContainerRef();

  const collection = useMemo(
    () =>
      createListCollection({
        items: options,
        itemToValue: (item) => item.value,
        itemToString: (item) => item.label,
      }),
    [options],
  );

  const selectedOption = value
    ? options.find((opt) => opt.value === value)
    : undefined;

  const iconSize = ICON_SIZE[size];

  return (
    <ArkSelect.Root
      collection={collection}
      value={value ? [value] : []}
      onValueChange={(details) => {
        const newValue = details.value[0];
        if (newValue !== undefined && newValue !== value) {
          onValueChange?.(newValue);
        }
      }}
      positioning={positioning ?? { sameWidth: true }}
      disabled={disabled}
      className={cx(rootStyle, className)}
    >
      <ArkSelect.Trigger
        className={cx(triggerStyle({ size }), triggerClassName)}
      >
        {renderTrigger ? (
          <ArkSelect.Context>
            {(context) => (
              <div className={customTriggerWrapperStyle}>
                {renderTrigger({ selectedOption, open: context.open })}
              </div>
            )}
          </ArkSelect.Context>
        ) : (
          <>
            <span
              className={cx(
                triggerLabelStyle,
                !selectedOption && placeholderStyle,
              )}
            >
              {selectedOption?.label ?? placeholder}
            </span>
            <FaChevronDown size={iconSize} className={chevronStyle} />
          </>
        )}
      </ArkSelect.Trigger>
      <ConditionalPortal enabled={portal} container={portalContainerRef}>
        <ArkSelect.Positioner
          className={positionerStyle}
          // Manual override because z-index is relying on a CSS variable by default here
          style={{ zIndex: 999 }}
        >
          <ArkSelect.Content className={contentStyle}>
            {collection.items.map((item) => (
              <ArkSelect.Item
                key={item.value}
                item={item}
                className={itemStyle}
              >
                {renderItem ? (
                  renderItem(item)
                ) : (
                  <ArkSelect.ItemText>{item.label}</ArkSelect.ItemText>
                )}
              </ArkSelect.Item>
            ))}
          </ArkSelect.Content>
        </ArkSelect.Positioner>
      </ConditionalPortal>
    </ArkSelect.Root>
  );
};

export const Select = withTooltip(SelectBase, "block");
