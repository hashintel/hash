import { Switch as ArkSwitch } from "@ark-ui/react/switch";
import { css } from "@hashintel/ds-helpers/css";

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

export const Switch = ({
  checked,
  defaultChecked = false,
  disabled = false,
  onChange,
}: SwitchProps) => {
  return (
    <ArkSwitch.Root
      {...(checked !== undefined ? { checked } : { defaultChecked })}
      disabled={disabled}
      onCheckedChange={(details) => {
        onChange?.(details.checked);
      }}
    >
      <ArkSwitch.Control
        className={css({
          position: "relative",
          display: "inline-block",
          width: "[34px]",
          height: "[20px]",
          borderRadius: "[10px]",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "[all 0.2s ease]",
          backgroundColor: "core.gray.40",
          _checked: {
            backgroundColor: "core.green.50",
          },
        })}
      >
        <ArkSwitch.Thumb
          className={css({
            position: "absolute",
            top: "[3px]",
            left: "[3px]",
            width: "[14px]",
            height: "[14px]",
            borderRadius: "[50%]",
            backgroundColor: "[white]",
            transition: "[all 0.2s ease]",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
            "&[data-state='checked']": {
              transform: "translateX(14px)",
            },
          })}
        />
      </ArkSwitch.Control>
      <ArkSwitch.HiddenInput />
    </ArkSwitch.Root>
  );
};
