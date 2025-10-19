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
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const INDETERMINATE_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M4 7H10"
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
        gap: "[8px]",
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
          borderRadius: "[4px]",
          border: "1px solid",
          borderColor: "gray.20",
          backgroundColor: "neutral.white",
          transition: "[all 0.2s ease]",
          flexShrink: "0",

          // Hover state (unchecked)
          "&[data-state='unchecked']:hover:not([data-disabled])": {
            borderColor: "gray.35",
          },

          // Focus state
          "&[data-focus-visible]": {
            boxShadow: "[0px 0px 0px 2px {colors.grayAlpha.30}]",
          },

          // Checked and indeterminate states
          "&[data-state='checked'], &[data-state='indeterminate']": {
            borderColor: "gray.80",
            backgroundColor: "gray.80",
            color: "neutral.white",
          },

          // Hover on checked/indeterminate states
          "&[data-state='checked']:hover:not([data-disabled]), &[data-state='indeterminate']:hover:not([data-disabled])":
            {
              backgroundColor: "gray.70",
              borderColor: "gray.70",
            },

          // Disabled state
          "&[data-disabled]": {
            cursor: "not-allowed",
            opacity: "[0.4]",
          },

          // Invalid state
          "&[data-invalid]": {
            borderColor: "red.50",
          },
        })}
      >
        {/* Checked indicator */}
        <BaseCheckbox.Indicator
          className={css({
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
            lineHeight: "[14px]",
            color: "gray.90",
            cursor: disabled ? "not-allowed" : "pointer",
            userSelect: "none",
            whiteSpace: "nowrap",

            "&[data-disabled]": {
              opacity: "[0.4]",
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
