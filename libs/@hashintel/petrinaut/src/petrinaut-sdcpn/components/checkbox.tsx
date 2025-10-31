import { Checkbox as ArkCheckbox } from "@ark-ui/react/checkbox";
import { css } from "@hashintel/ds-helpers/css";

export interface CheckboxProps {
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
}

export const Checkbox = ({ checked, disabled, onChange, label }: CheckboxProps) => {
  return (
    <ArkCheckbox.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={(details) => {
        onChange?.(details.checked === true);
      }}
      className={css({
        display: "inline-flex",
        alignItems: "center",
        gap: "spacing.3",
      })}
    >
      <ArkCheckbox.Control
        className={css({
          width: "[18px]",
          height: "[18px]",
          borderRadius: "radius.4",
          border: "1px solid",
          borderColor: "core.gray.40",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          _checked: {
            backgroundColor: "core.blue.70",
            borderColor: "core.blue.70",
          },
        })}
      >
        <ArkCheckbox.Indicator
          className={css({
            color: "[white]",
          })}
        >
          ✓
        </ArkCheckbox.Indicator>
      </ArkCheckbox.Control>
      {label && (
        <ArkCheckbox.Label
          className={css({
            fontSize: "size.textsm",
            color: "core.gray.90",
            cursor: disabled ? "not-allowed" : "pointer",
          })}
        >
          {label}
        </ArkCheckbox.Label>
      )}
      <ArkCheckbox.HiddenInput />
    </ArkCheckbox.Root>
  );
};
