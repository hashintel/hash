import { Slider as BaseSlider } from "@ark-ui/react/slider";
import { css, cx } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";

const THUMB_WIDTH = 18;
const THUMB_HEIGHT = 16;
const THUMB_RADIUS = THUMB_HEIGHT / 2;
const THUMB_BEZEL_WIDTH = THUMB_RADIUS * 0.7;
const THUMB_ACTIVE_SCALE = 2.2;

const THUMB_SPECULAR_OPACITY = 0.4;
const THUMB_BLUR_LEVEL = 0;
const THUMB_GLASS_THICKNESS = 16;
const THUMB_REFRACTIVE_INDEX = 1.5;

export interface SliderProps {
  className?: string;
  style?: React.CSSProperties;
  min?: number;
  max?: number;
  value?: number;
  defaultValue?: number;
  label?: string;
  showValueText?: boolean;
  onChange?: (value: number) => void;
}

export const Slider: React.FC<SliderProps> = ({
  className,
  style,
  min,
  max,
  value,
  defaultValue,
  label,
  showValueText = false,
  onChange,
}) => {
  return (
    <BaseSlider.Root
      min={min}
      className={cx(
        css({
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "2",
        }),
        className,
      )}
      style={style}
      max={max}
      value={value ? [value] : undefined}
      defaultValue={defaultValue ? [defaultValue] : undefined}
      onValueChange={(details) => {
        const newValue = details.value[0];
        // For now this component only supports single value sliders
        if (newValue !== undefined) {
          onChange?.(newValue);
        }
      }}
    >
      {label && (
        <BaseSlider.Label
          className={css({
            fontSize: "sm",
            fontWeight: "medium",
            color: "neutral.s90",
          })}
        >
          {label}
        </BaseSlider.Label>
      )}

      {showValueText && (
        <BaseSlider.ValueText
          className={css({
            fontSize: "xs",
            color: "neutral.s60",
          })}
        />
      )}

      <BaseSlider.Control
        className={css({
          position: "relative",
          display: "flex",
          alignItems: "center",
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
            })}
          />
        </BaseSlider.Track>

        <BaseSlider.Thumb
          index={0}
          className={css({
            outline: "none",
            "& > div": {
              backgroundColor: "blue.s70",
              transformOrigin: "center",
              transition:
                "[transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.2s ease]",
            },
            "&[data-dragging] > div": {
              transform: `scale(${THUMB_ACTIVE_SCALE})`,
              backgroundColor: "[rgba(255,255,255,0.2)]",
              shadow:
                "[0 2px 4px rgba(0,0,0,0.1), inset 0 1px 3px rgba(0,0,0,0.1), inset 0 -1px 3px rgba(255,255,255,0.1)]",
            },
          })}
        >
          <refractive.div
            style={{
              height: THUMB_HEIGHT,
              width: THUMB_WIDTH,
            }}
            refraction={{
              radius: THUMB_RADIUS,
              bezelWidth: THUMB_BEZEL_WIDTH,
              blur: THUMB_BLUR_LEVEL,
              specularOpacity: THUMB_SPECULAR_OPACITY,
              glassThickness: THUMB_GLASS_THICKNESS,
              refractiveIndex: THUMB_REFRACTIVE_INDEX,
            }}
          />
          <BaseSlider.HiddenInput />
        </BaseSlider.Thumb>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
};
