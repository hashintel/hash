import { RadioGroup as BaseRadioGroup } from "@ark-ui/react/radio-group";
import { css, cva } from "../../../styled-system/css";
import type { ReactNode } from "react";

export interface RadioGroupOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  options: RadioGroupOption[];
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  name?: string;
  form?: string;
  onValueChange?: (value: string) => void;
  /** Card variant displays options as cards with optional icons and descriptions */
  variant?: "default" | "card";
  id?: string;
}

// Root container styles
const radioGroupRootStyles = css({
  display: "flex",
  flexDirection: "column",
  gap: "spacing.3", // 4px gap between items
});

// Recipe for radio group items with variant support
const radioItemRecipe = cva({
  base: {
    display: "flex",
    alignItems: "center",
    outline: "none",
    "&[data-disabled]": {
      cursor: "not-allowed",
      opacity: "[0.5]",
    },
    // Focus visible state: light blue outline
    "&:focus-visible": {
      outline: "[2px solid #A8C5F0]",
      outlineOffset: "[2px]",
    },
    // Hover state for radio control when hovering Item - target only item-control
    "&:hover:not([data-disabled]) [data-part='item-control'][data-state='unchecked']":
      {
        borderColor: "[#C7C7C7]",
        transform: "[scale(0.8)]",
      },
    "&:hover:not([data-disabled]) [data-part='item-control'][data-state='checked']":
      {
        backgroundColor: "[#1567E0]",
        borderColor: "[#1567E0]",
        transform: "[scale(0.8)]",
      },
  },
  variants: {
    variant: {
      default: {
        cursor: "pointer",
        padding: "spacing.3", // 6px
        borderRadius: "radius.4", // 8px
        gap: "spacing.5", // 8px
        "&:hover:not([data-disabled])": {
          backgroundColor: "bg.neutral.subtle.hover",
        },
      },
      card: {
        gap: "spacing.6", // 12px
        padding: "spacing.6", // 12px
        backgroundColor: "bg.neutral.subtle.default",
        border: "1px solid",
        borderColor: "border.neutral.subtle",
        borderRadius: "[10px]",
        cursor: "pointer",
        width: "[316px]",
        "&:hover:not([data-disabled])": {
          borderColor: "border.neutral.default",
        },
      },
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

// Radio outer circle (div-based)
const radioOuterCircleStyles = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[20px]",
  height: "[20px]",
  borderRadius: "[100px]",
  border: "[1px solid #E5E5E5]",
  backgroundColor: "[transparent]",
  transition: "[all 0.1s ease]",
  flexShrink: "0",
  transform: "[scale(1)]",
  // Checked state: blue filled
  "&[data-state='checked']": {
    backgroundColor: "[#2070E6]",
    borderColor: "[#2070E6]",
  },
  // Focus state on Item: keep normal appearance, outline is on Item
  ":focus-visible &": {
    // No changes to control itself, just maintain state
  },
  // Disabled state (unchecked): light gray filled
  "&[data-disabled][data-state='unchecked']": {
    backgroundColor: "[#F5F5F5]",
    borderColor: "[#E5E5E5]",
  },
  // Disabled state (checked): opacity applied
  "&[data-disabled][data-state='checked']": {
    opacity: "[0.5]",
  },
});

// Card icon badge styles
const cardIconBadgeStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[32px]",
  height: "[32px]",
  backgroundColor: "bg.neutral.subtle.default",
  borderRadius: "radius.4", // 8px
  paddingX: "spacing.5", // 8px
  paddingY: "spacing.0",
  overflow: "clip",
  flexShrink: "0",
});

// Card content wrapper styles
const cardContentWrapperStyles = css({
  display: "flex",
  flex: "1",
  gap: "spacing.6", // 12px
  alignItems: "center",
  minWidth: "[0]",
  minHeight: "[0]",
});

// Card text group styles
const cardTextGroupStyles = css({
  display: "flex",
  flex: "1",
  flexDirection: "column",
  gap: "spacing.1", // 4px
  alignItems: "flex-start",
  justifyContent: "center",
  height: "[38px]",
  minWidth: "[0]",
  minHeight: "[0]",
});

// Label text styles
const labelTextStyles = css({
  fontSize: "size.textsm", // 14px
  fontWeight: "medium",
  lineHeight: "leading.none.textsm", // 14px
  color: "text.primary",
  whiteSpace: "nowrap",
  "&[data-disabled]": {
    opacity: "[0.5]",
  },
});

// Card label text styles (with ellipsis)
const cardLabelTextStyles = css({
  fontSize: "size.textsm", // 14px
  fontWeight: "medium",
  lineHeight: "leading.none.textsm", // 14px
  color: "text.primary",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  width: "[100%]",
  "&[data-disabled]": {
    opacity: "[0.5]",
  },
});

// Description text styles
const descriptionTextStyles = css({
  fontSize: "size.textxs", // 12px
  fontWeight: "normal",
  lineHeight: "[1.5]",
  color: "text.secondary",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  width: "[100%]",
});

// Radio control wrapper styles
const radioControlWrapperStyles = css({
  position: "relative",
});

// Radio inner white dot styles
const radioInnerWhiteDotStyles = css({
  position: "absolute",
  top: "[50%]",
  left: "[50%]",
  transform: "[translate(-50%, -50%)]",
  width: "[8px]",
  height: "[8px]",
  borderRadius: "[100px]",
  backgroundColor: "[#ffffff]",
  transition: "[all 0.1s ease]",
  pointerEvents: "none",
  opacity: "0",
  "[data-state='checked'] ~ &": {
    opacity: "1",
  },
});

export const RadioGroup: React.FC<RadioGroupProps> = ({
  options,
  value,
  defaultValue,
  disabled = false,
  name,
  form,
  onValueChange,
  variant = "default",
  id,
}) => {
  return (
    <BaseRadioGroup.Root
      {...(value !== undefined ? { value } : { defaultValue })}
      disabled={disabled}
      name={name}
      form={form}
      onValueChange={(details) => {
        if (details.value !== null) {
          onValueChange?.(details.value);
        }
      }}
      id={id}
      className={radioGroupRootStyles}
    >
      {options.map((option) => (
        <BaseRadioGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={radioItemRecipe({ variant })}
        >
          {variant === "card" && option.icon && (
            <div className={cardIconBadgeStyles}>{option.icon}</div>
          )}

          {variant === "default" ? (
            <>
              <div className={radioControlWrapperStyles}>
                <BaseRadioGroup.ItemControl className={radioOuterCircleStyles}>
                  <BaseRadioGroup.ItemHiddenInput />
                </BaseRadioGroup.ItemControl>
                <div className={radioInnerWhiteDotStyles} />
              </div>

              <BaseRadioGroup.ItemText className={labelTextStyles}>
                {option.label}
              </BaseRadioGroup.ItemText>
            </>
          ) : (
            <>
              <div className={cardContentWrapperStyles}>
                <div className={cardTextGroupStyles}>
                  <BaseRadioGroup.ItemText className={cardLabelTextStyles}>
                    {option.label}
                  </BaseRadioGroup.ItemText>

                  {option.description && (
                    <p className={descriptionTextStyles}>
                      {option.description}
                    </p>
                  )}
                </div>
              </div>

              <div className={radioControlWrapperStyles}>
                <BaseRadioGroup.ItemControl className={radioOuterCircleStyles}>
                  <BaseRadioGroup.ItemHiddenInput />
                </BaseRadioGroup.ItemControl>
                <div className={radioInnerWhiteDotStyles} />
              </div>
            </>
          )}
        </BaseRadioGroup.Item>
      ))}

      <BaseRadioGroup.Indicator />
    </BaseRadioGroup.Root>
  );
};
