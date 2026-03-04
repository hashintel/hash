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

const SIZE_MAP = {
  xs: {
    height: "24px",
    fontSize: "12px",
    radius: "8px",
    px: "6px",
    iconSize: 10,
  },
  sm: {
    height: "28px",
    fontSize: "14px",
    radius: "8px",
    px: "8px",
    iconSize: 12,
  },
  md: {
    height: "32px",
    fontSize: "14px",
    radius: "8px",
    px: "10px",
    iconSize: 14,
  },
  lg: {
    height: "40px",
    fontSize: "16px",
    radius: "12px",
    px: "12px",
    iconSize: 16,
  },
} as const;

type SelectSize = keyof typeof SIZE_MAP;

// -- Styles -------------------------------------------------------------------

const rootStyle = css({
  width: "[100%]",
});

const triggerStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "[6px]",
    width: "[100%]",
    boxSizing: "border-box",
    backgroundColor: "[white]",
    border: "[1px solid rgba(0, 0, 0, 0.09)]",
    fontWeight: "[500]",
    color: "[#484848]",
    cursor: "pointer",
    outline: "none",
    transition: "[border-color 0.15s ease, box-shadow 0.15s ease]",
    _hover: {
      borderColor: "[rgba(0, 0, 0, 0.12)]",
    },
    _focusVisible: {
      borderColor: "[rgba(0, 0, 0, 0.09)]",
      boxShadow: "[0px 0px 0px 2px rgba(0, 0, 0, 0.04)]",
    },
    _disabled: {
      backgroundColor: "[#fcfcfc]",
      opacity: "[0.7]",
      cursor: "not-allowed",
    },
  },
  variants: {
    size: {
      xs: {
        height: "[24px]",
        fontSize: "[12px]",
        borderRadius: "[8px]",
        paddingX: "[6px]",
      },
      sm: {
        height: "[28px]",
        fontSize: "[14px]",
        borderRadius: "[8px]",
        paddingX: "[8px]",
      },
      md: {
        height: "[32px]",
        fontSize: "[14px]",
        borderRadius: "[8px]",
        paddingX: "[10px]",
      },
      lg: {
        height: "[40px]",
        fontSize: "[16px]",
        borderRadius: "[12px]",
        paddingX: "[12px]",
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
  color: "[#bbb]",
});

const customTriggerWrapperStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  width: "[100%]",
  minWidth: "[0]",
});

const chevronStyle = css({
  flexShrink: 0,
  color: "[rgba(0, 0, 0, 0.3)]",
  display: "flex",
  alignItems: "center",
});

const contentStyle = css({
  backgroundColor: "[white]",
  borderRadius: "[8px]",
  boxShadow:
    "[0px 6px 12px -4px rgba(0, 0, 0, 0.12), 0px 2px 4px -1px rgba(0, 0, 0, 0.04), 0px 0px 0px 1px rgba(0, 0, 0, 0.06)]",
  padding: "[4px]",
  maxHeight: "[200px]",
  overflowY: "auto",
  outline: "none",
  zIndex: 1000,
});

const itemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  padding: "[6px 8px]",
  borderRadius: "[8px]",
  fontSize: "[14px]",
  fontWeight: "[500]",
  cursor: "pointer",
  outline: "none",
  color: "[#484848]",
  "&[data-highlighted]": {
    backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  },
  '&[data-state="checked"]': {
    backgroundColor: "[rgba(0, 0, 0, 0.03)]",
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
  portal = true,
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

  const iconSize = SIZE_MAP[size].iconSize;

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
        <ArkSelect.Positioner>
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
