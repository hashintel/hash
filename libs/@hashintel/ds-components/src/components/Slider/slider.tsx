import { Slider as BaseSlider } from "@ark-ui/react/slider";
import { css, cx } from "@hashintel/ds-helpers/css";
import { motion } from "motion/react";
import { useId } from "react";

import { Filter } from "../../lib/filter";
import { CONVEX } from "../../lib/surface-equations";

const BaseSliderThumb = motion.create(BaseSlider.Thumb);
const BaseSliderRange = motion.create(BaseSlider.Range);

const THUMB_WIDTH = 18;
const THUMB_HEIGHT = 16;
const THUMB_RADIUS = THUMB_HEIGHT / 2;
const THUMB_BEZEL_WIDTH = THUMB_RADIUS * 0.7;
const THUMB_ACTIVE_SCALE = 2.2;

const DEFAULT_SPECULAR_OPACITY = 0.4;
const DEFAULT_SPECULAR_SATURATION = 7;
const DEFAULT_BLUR_LEVEL = 0;
const DEFAULT_GLASS_THICKNESS = 16;
const DEFAULT_REFRACTIVE_INDEX = 1.5;

export interface SliderProps {
  className?: string;
  style?: React.CSSProperties;
  min?: number;
  max?: number;
  value?: number;
  defaultValue?: number;
  specularOpacity?: number;
  specularSaturation?: number;
  glassThickness?: number;
  refractiveIndex?: number;
  bezelWidth?: number;
  blurLevel?: number;
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
  specularOpacity = DEFAULT_SPECULAR_OPACITY,
  specularSaturation = DEFAULT_SPECULAR_SATURATION,
  blurLevel = DEFAULT_BLUR_LEVEL,
  glassThickness = DEFAULT_GLASS_THICKNESS,
  refractiveIndex = DEFAULT_REFRACTIVE_INDEX,
  label,
  showValueText = false,
  onChange,
}) => {
  const filterId = `thumb-filter-${useId()}`;

  return (
    <>
      <Filter
        id={filterId}
        blur={blurLevel}
        specularOpacity={specularOpacity}
        specularSaturation={specularSaturation}
        width={THUMB_WIDTH}
        height={THUMB_HEIGHT}
        radius={THUMB_RADIUS}
        bezelWidth={THUMB_BEZEL_WIDTH}
        glassThickness={glassThickness}
        refractiveIndex={refractiveIndex}
        bezelHeightFn={CONVEX}
        pixelRatio={6}
      />

      <BaseSlider.Root
        min={min}
        className={cx(
          css({
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: "1",
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
              color: "gray.90",
            })}
          >
            {label}
          </BaseSlider.Label>
        )}

        {showValueText && (
          <BaseSlider.ValueText
            className={css({
              fontSize: "xs",
              color: "gray.60",
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
              backgroundColor: "gray.40",
            })}
          >
            <BaseSliderRange
              className={css({
                top: "0",
                bottom: "0",
                backgroundColor: "blue.70",
                borderRadius: "full",
              })}
            />
          </BaseSlider.Track>

          <BaseSliderThumb
            index={0}
            className={css({
              outline: "none",
              "& > div": {
                backgroundColor: "blue.70",
                transformOrigin: "center",
                transition:
                  "[transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.2s ease]",
              },
              "&[data-dragging] > div": {
                transform: `scale(${THUMB_ACTIVE_SCALE})`,
                backgroundColor: "whiteAlpha.20",
                shadow:
                  "[0 2px 4px rgba(0,0,0,0.1), inset 0 1px 3px rgba(0,0,0,0.1), inset 0 -1px 3px rgba(255,255,255,0.1)]",
              },
            })}
          >
            <motion.div
              style={{
                height: THUMB_HEIGHT,
                width: THUMB_WIDTH,
                borderRadius: THUMB_RADIUS,
                backdropFilter: `url(#${filterId})`,
              }}
            />
            <BaseSlider.HiddenInput />
          </BaseSliderThumb>
        </BaseSlider.Control>
      </BaseSlider.Root>
    </>
  );
};
