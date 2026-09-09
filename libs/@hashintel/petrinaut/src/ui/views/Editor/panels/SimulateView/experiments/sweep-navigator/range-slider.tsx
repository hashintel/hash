import { Slider as BaseSlider } from "@ark-ui/react/slider";

import { css, cx } from "@hashintel/ds-helpers/css";

const THUMB_SIZE = 12;

// The same plain thumb as the ds Slider's `plain` variant: one fixed size,
// no swell while dragged.
const thumbStyles = css({
  outline: "none",
  display: "block",
  width: `[${THUMB_SIZE}px]`,
  height: `[${THUMB_SIZE}px]`,
  borderRadius: "full",
  border: "[1px solid rgba(255,255,255,0.6)]",
  backgroundColor: "blue.s90",
  boxShadow: "[0 1px 3px rgba(37,99,235,0.3)]",
  "&[data-focus]": {
    boxShadow: "[0 0 0 3px rgba(59,130,246,0.3)]",
  },
});

export interface RangeSliderProps {
  className?: string;
  style?: React.CSSProperties;
  min: number;
  max: number;
  step?: number;
  /** Both ends of the selected range; they may coincide (a point). */
  value: [number, number];
  "aria-label"?: string;
  disabled?: boolean;
  onChange?: (value: [number, number]) => void;
  /** Fires once when a drag or keyboard interaction settles. */
  onChangeEnd?: (value: [number, number]) => void;
}

/**
 * A two-thumb slider selecting an inclusive range, drawn like the ds Slider's
 * plain variant. The thumbs may occupy the same position, which callers treat
 * as a single-point selection.
 */
export const RangeSlider: React.FC<RangeSliderProps> = ({
  className,
  style,
  min,
  max,
  step,
  value,
  "aria-label": ariaLabel,
  disabled,
  onChange,
  onChangeEnd,
}) => {
  const emit = (values: number[]): [number, number] => {
    const [start = min, end = max] = values;
    return start <= end ? [start, end] : [end, start];
  };

  return (
    <BaseSlider.Root
      min={min}
      max={max}
      step={step}
      value={[value[0], value[1]]}
      minStepsBetweenThumbs={0}
      thumbSize={{ width: THUMB_SIZE, height: THUMB_SIZE }}
      disabled={disabled}
      aria-label={
        ariaLabel ? [`${ariaLabel} minimum`, `${ariaLabel} maximum`] : undefined
      }
      className={cx(
        css({
          position: "relative",
          display: "flex",
          flexDirection: "column",
          flex: "1",
          minWidth: "[120px]",
        }),
        className,
      )}
      style={style}
      onValueChange={(details) => {
        onChange?.(emit(details.value));
      }}
      onValueChangeEnd={(details) => {
        onChangeEnd?.(emit(details.value));
      }}
    >
      <BaseSlider.Control
        className={css({
          position: "relative",
          display: "flex",
          alignItems: "center",
          width: "full",
          height: `[${THUMB_SIZE + 4}px]`,
        })}
      >
        <BaseSlider.Track
          className={css({
            flex: "1",
            position: "relative",
            height: "[4px]",
            alignItems: "center",
            borderRadius: "full",
            backgroundColor: "neutral.s40",
          })}
        >
          <BaseSlider.Range
            className={css({
              top: "[0px]",
              bottom: "[0px]",
              backgroundColor: "blue.s70",
              borderRadius: "full",
              // A collapsed range (point selection) still reads as present.
              minWidth: "[2px]",
            })}
          />
        </BaseSlider.Track>

        <BaseSlider.Thumb index={0} className={thumbStyles}>
          <BaseSlider.HiddenInput />
        </BaseSlider.Thumb>
        <BaseSlider.Thumb index={1} className={thumbStyles}>
          <BaseSlider.HiddenInput />
        </BaseSlider.Thumb>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
};
