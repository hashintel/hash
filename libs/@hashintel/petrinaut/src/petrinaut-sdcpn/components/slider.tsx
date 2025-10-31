import { Slider as ArkSlider } from "@ark-ui/react/slider";
import { css } from "@hashintel/ds-helpers/css";

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  disabled?: boolean;
}

export const Slider = ({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  label,
  disabled = false,
}: SliderProps) => {
  return (
    <ArkSlider.Root
      value={[value]}
      onValueChange={(details) => {
        const newValue = details.value[0];
        if (newValue !== undefined) {
          onChange(newValue);
        }
      }}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={css({
        width: "[100%]",
        display: "flex",
        flexDirection: "column",
        gap: "spacing.2",
      })}
    >
      {label && (
        <ArkSlider.Label
          className={css({
            fontSize: "size.textsm",
            color: "core.gray.80",
            fontWeight: "medium",
          })}
        >
          {label}
        </ArkSlider.Label>
      )}
      <ArkSlider.Control
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "spacing.2",
        })}
      >
        <ArkSlider.Track
          className={css({
            flex: "1",
            height: "[4px]",
            backgroundColor: "core.gray.20",
            borderRadius: "radius.full",
            position: "relative",
          })}
        >
          <ArkSlider.Range
            className={css({
              height: "[100%]",
              backgroundColor: "core.blue.60",
              borderRadius: "radius.full",
            })}
          />
        </ArkSlider.Track>
        <ArkSlider.Thumb
          index={0}
          className={css({
            width: "[20px]",
            height: "[20px]",
            backgroundColor: "core.blue.60",
            borderRadius: "radius.full",
            cursor: "pointer",
            _hover: {
              backgroundColor: "core.blue.70",
            },
            _disabled: {
              cursor: "not-allowed",
              backgroundColor: "core.gray.40",
            },
          })}
        />
        <ArkSlider.ValueText
          className={css({
            fontSize: "size.textsm",
            color: "core.gray.70",
            minWidth: "[3rem]",
            textAlign: "right",
          })}
        />
      </ArkSlider.Control>
    </ArkSlider.Root>
  );
};
