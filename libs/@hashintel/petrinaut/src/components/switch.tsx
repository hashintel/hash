import { Switch as ArkSwitch } from "@ark-ui/react/switch";
import { css } from "@hashintel/ds-helpers/css";

import { Tooltip } from "./tooltip";

interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  tooltip?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onCheckedChange,
  disabled = false,
  tooltip,
}) => {
  const switchElement = (
    <ArkSwitch.Root
      checked={checked}
      onCheckedChange={(details) => {
        onCheckedChange?.(details.checked);
      }}
      disabled={disabled}
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
          backgroundColor: "gray.40",
          _checked: {
            backgroundColor: "green.40",
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
            borderRadius: "[7px]",
            backgroundColor: "[white]",
            boxShadow: "[0 2px 4px rgba(0,0,0,0.2)]",
            transition: "[all 0.2s ease]",
            "&[data-state='checked']": {
              transform: "[translateX(14px)]",
            },
          })}
        />
      </ArkSwitch.Control>
      <ArkSwitch.HiddenInput />
    </ArkSwitch.Root>
  );

  if (tooltip) {
    return <Tooltip content={tooltip}>{switchElement}</Tooltip>;
  }

  return switchElement;
};
