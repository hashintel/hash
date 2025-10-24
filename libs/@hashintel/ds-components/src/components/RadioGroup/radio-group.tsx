import { RadioGroup as BaseRadioGroup } from "@ark-ui/react/radio-group";
import { css } from "@hashintel/ds-helpers/css";
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
        if (details.value) {
          onValueChange?.(details.value);
        }
      }}
      id={id}
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "spacing.1", // 4px gap between items
      })}
    >
      {options.map((option) => (
        <BaseRadioGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={css(
            variant === "default"
              ? {
                  display: "flex",
                  alignItems: "center",
                  cursor: option.disabled ? "not-allowed" : "pointer",
                  padding: "spacing.3", // 6px
                  borderRadius: "radius.4", // 8px (rounded-lg)
                  transition: "[all 0.2s ease]",

                  "&:hover:not([data-disabled])": {
                    backgroundColor: "bg.neutral.subtle.hover",
                  },

                  "&[data-disabled]": {
                    cursor: "not-allowed",
                    opacity: "[0.5]",
                  },
                }
              : {
                  display: "flex",
                  alignItems: "center",
                  gap: "spacing.6", // 12px
                  padding: "spacing.6", // 12px
                  backgroundColor: "bg.neutral.subtle.default",
                  border: "1px solid",
                  borderColor: "border.neutral.subtle",
                  borderRadius: "[10px]",
                  cursor: option.disabled ? "not-allowed" : "pointer",
                  transition: "[all 0.2s ease]",
                  width: "[316px]",

                  "&:hover:not([data-disabled])": {
                    borderColor: "border.neutral.default",
                  },

                  "&[data-disabled]": {
                    cursor: "not-allowed",
                    opacity: "[0.5]",
                  },
                },
          )}
        >
          {variant === "card" && option.icon && (
            <div
              className={css({
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
              })}
            >
              {option.icon}
            </div>
          )}

          {variant === "default" ? (
            <>
              <BaseRadioGroup.ItemControl
                className={css({
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "[20px]",
                  height: "[20px]",
                  borderRadius: "radius.full", // 100px (fully rounded)
                  flexShrink: "0",
                  color: "border.neutral.default",
                  transition: "[all 0.2s ease]",

                  "&[data-state='checked']": {
                    color: "bg.neutral.bold.default",
                  },

                  "&[data-disabled]": {
                    opacity: "[0.5]",
                  },
                })}
              >
                <BaseRadioGroup.ItemHiddenInput />
              </BaseRadioGroup.ItemControl>

              <div
                className={css({
                  display: "flex",
                  gap: "spacing.4", // 6px
                  alignItems: "center",
                  flexShrink: "0",
                })}
              >
                <BaseRadioGroup.ItemText
                  className={css({
                    fontSize: "size.textsm", // 14px
                    fontWeight: "medium",
                    lineHeight: "leading.none.textsm", // 14px
                    color: "text.primary",
                    whiteSpace: "nowrap",

                    "&[data-disabled]": {
                      opacity: "[0.5]",
                    },
                  })}
                >
                  {option.label}
                </BaseRadioGroup.ItemText>
              </div>
            </>
          ) : (
            <>
              <div
                className={css({
                  display: "flex",
                  flex: "1",
                  flexDirection: "column",
                  gap: "spacing.6", // 12px
                  alignItems: "center",
                  minWidth: "[0]",
                  minHeight: "[0]",
                })}
              >
                <div
                  className={css({
                    display: "flex",
                    flex: "1",
                    flexDirection: "column",
                    gap: "spacing.1", // 4px
                    alignItems: "flex-start",
                    justifyContent: "center",
                    height: "[38px]",
                    minWidth: "[0]",
                    minHeight: "[0]",
                  })}
                >
                  <BaseRadioGroup.ItemText
                    className={css({
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
                    })}
                  >
                    {option.label}
                  </BaseRadioGroup.ItemText>

                  {option.description && (
                    <p
                      className={css({
                        fontSize: "size.textxs", // 12px
                        fontWeight: "normal",
                        lineHeight: "[1.5]",
                        color: "text.secondary",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        width: "[100%]",
                      })}
                    >
                      {option.description}
                    </p>
                  )}
                </div>
              </div>

              <BaseRadioGroup.ItemControl
                className={css({
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "[20px]",
                  height: "[20px]",
                  borderRadius: "radius.full", // 100px (fully rounded)
                  flexShrink: "0",
                  color: "border.neutral.default",
                  transition: "[all 0.2s ease]",

                  "&[data-state='checked']": {
                    color: "bg.neutral.bold.default",
                  },

                  "&[data-disabled]": {
                    opacity: "[0.5]",
                  },
                })}
              >
                <BaseRadioGroup.ItemHiddenInput />
              </BaseRadioGroup.ItemControl>
            </>
          )}
        </BaseRadioGroup.Item>
      ))}

      <BaseRadioGroup.Indicator />
    </BaseRadioGroup.Root>
  );
};
