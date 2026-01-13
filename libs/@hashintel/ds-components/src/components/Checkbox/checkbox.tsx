import { Checkbox as BaseCheckbox } from "@ark-ui/react/checkbox";

import { css } from "../../../styled-system/css";

const CHECK_ICON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
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
    aria-hidden="true"
  >
    <path
      d="M3 6H9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const checkboxRootStyles = (disabled: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: "default.4",
    cursor: disabled ? "not-allowed" : "pointer",
  });

const checkboxControlStyles = css({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[16px]",
  height: "[16px]",
  borderRadius: "md.2",
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
  _focusVisible: {
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
  _disabled: {
    cursor: "not-allowed",
    opacity: "[0.5]",
  },

  // Invalid state
  _invalid: {
    borderColor: "border.status.critical",
  },
});

const checkboxIndicatorStyles = css({
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[100%]",
  height: "[100%]",
});

const checkboxLabelStyles = (disabled: boolean) =>
  css({
    fontSize: "[14px]",
    fontWeight: "medium",
    color: "text.primary",
    cursor: disabled ? "not-allowed" : "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",

    _disabled: {
      opacity: "[0.5]",
    },
  });

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
      className={checkboxRootStyles(disabled)}
    >
      <BaseCheckbox.Control className={checkboxControlStyles}>
        {/* Checked indicator */}
        <BaseCheckbox.Indicator className={checkboxIndicatorStyles}>
          {CHECK_ICON}
        </BaseCheckbox.Indicator>

        {/* Indeterminate indicator */}
        <BaseCheckbox.Indicator
          indeterminate
          className={checkboxIndicatorStyles}
        >
          {INDETERMINATE_ICON}
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Control>

      {label && (
        <BaseCheckbox.Label className={checkboxLabelStyles(disabled)}>
          {label}
        </BaseCheckbox.Label>
      )}

      <BaseCheckbox.HiddenInput />
    </BaseCheckbox.Root>
  );
};
