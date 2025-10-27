import { Checkbox as BaseCheckbox } from "@ark-ui/react/checkbox";
import { css } from "@hashintel/ds-helpers/css";

const CHECK_ICON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10 3L4.5 8.5L2 6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const INDETERMINATE_ICON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 6H9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export interface CheckboxProps {
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean | "indeterminate";
  disabled?: boolean;
  invalid?: boolean;
  readOnly?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  form?: string;
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
  label?: string;
  id?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  defaultChecked,
  disabled = false,
  invalid = false,
  readOnly = false,
  required = false,
  name,
  value,
  form,
  onCheckedChange,
  label,
  id,
}) => {
  return (
    <BaseCheckbox.Root
      {...(checked !== undefined ? { checked } : { defaultChecked })}
      disabled={disabled}
      invalid={invalid}
      readOnly={readOnly}
      required={required}
      name={name}
      value={value}
      form={form}
      onCheckedChange={(details) => {
        onCheckedChange?.(details.checked);
      }}
      id={id}
      className={css({
        display: "inline-flex",
        alignItems: "center",
        gap: "spacing.4",
        cursor: disabled ? "not-allowed" : "pointer",
      })}
    >
      <BaseCheckbox.Control
        className={css({
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "[16px]",
          height: "[16px]",
          borderRadius: "radius.2",
          border: "1px solid",
          borderColor: "border.neutral.default",
          backgroundColor: "bg.neutral.subtle.default",
          transition: "[all 0.2s ease]",
          flexShrink: "0",

          // Hover state (unchecked)
          "&[data-state='unchecked']:hover:not([data-disabled])": {
            borderColor: "border.neutral.hover",
          },

          // Focus state
          "&[data-focus-visible]": {
            boxShadow: "[0px 0px 0px 2px rgba(0, 0, 0, 0.15)]",
          },

          // Checked and indeterminate states
          "&[data-state='checked'], &[data-state='indeterminate']": {
            borderColor: "border.neutral.active",
            backgroundColor: "bg.neutral.bold.default",
            color: "text.inverted",
          },

          // Hover on checked/indeterminate states
          "&[data-state='checked']:hover:not([data-disabled]), &[data-state='indeterminate']:hover:not([data-disabled])":
            {
              backgroundColor: "bg.neutral.bold.hover",
              borderColor: "bg.neutral.bold.hover",
            },

          // Disabled state
          "&[data-disabled]": {
            cursor: "not-allowed",
            opacity: "[0.5]",
          },

          // Invalid state
          "&[data-invalid]": {
            borderColor: "border.status.critical",
          },
        })}
      >
        {/* Checked indicator */}
        <BaseCheckbox.Indicator
          className={css({
            position: "absolute",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "[100%]",
            height: "[100%]",
          })}
        >
          {CHECK_ICON}
        </BaseCheckbox.Indicator>

        {/* Indeterminate indicator */}
        <BaseCheckbox.Indicator
          indeterminate
          className={css({
            position: "absolute",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "[100%]",
            height: "[100%]",
          })}
        >
          {INDETERMINATE_ICON}
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Control>

      {label && (
        <BaseCheckbox.Label
          className={css({
            fontSize: "[14px]",
            fontWeight: "medium",
            color: "text.primary",
            cursor: disabled ? "not-allowed" : "pointer",
            userSelect: "none",
            whiteSpace: "nowrap",

            "&[data-disabled]": {
              opacity: "[0.5]",
            },
          })}
        >
          {label}
        </BaseCheckbox.Label>
      )}

      <BaseCheckbox.HiddenInput />
    </BaseCheckbox.Root>
  );
};
