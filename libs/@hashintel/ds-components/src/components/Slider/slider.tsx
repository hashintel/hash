import { Slider as BaseSlider } from "@ark-ui/react/slider";
import { css } from "@hashintel/ds-styled-system/css";
import { motion } from "motion/react";
import { useId } from "react";

import { Filter } from "../../lib/filter";
import { CONVEX } from "../../lib/surface-equations";

const BaseSliderThumb = motion.create(BaseSlider.Thumb);
const BaseSliderRange = motion.create(BaseSlider.Range);

const SLIDER_WIDTH = 330;
const SLIDER_HEIGHT = 5;
const THUMB_WIDTH = 18;
const THUMB_HEIGHT = 16;
const THUMB_RADIUS = THUMB_HEIGHT / 2;
const THUMB_BEZEL_WIDTH = THUMB_RADIUS * 0.7;
const THUMB_ACTIVE_SCALE = 2.2;

const TRACK_COLOR = "#89898F66";
const TRACK_ACTIVE = "#0f94c4ff";

const DEFAULT_SPECULAR_OPACITY = 0.4;
const DEFAULT_SPECULAR_SATURATION = 7;
const DEFAULT_BLUR_LEVEL = 0;
const DEFAULT_GLASS_THICKNESS = 16;
const DEFAULT_REFRACTIVE_INDEX = 1.5;

export interface SliderProps {
  min?: number;
  max?: number;
  defaultValue?: number;
  specularOpacity?: number;
  specularSaturation?: number;
  glassThickness?: number;
  refractiveIndex?: number;
  bezelWidth?: number;
  blurLevel?: number;
  label?: string;
  showValueText?: boolean;
  onChange?: (value: number[]) => void;
}

export const Slider: React.FC<SliderProps> = ({
  min = 0,
  max = 100,
  defaultValue = 50,
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

  const sliderHeight = SLIDER_HEIGHT;
  const sliderWidth = SLIDER_WIDTH;
  const thumbWidth = THUMB_WIDTH;
  const thumbHeight = THUMB_HEIGHT;
  const thumbRadius = THUMB_RADIUS;
  const thumbBezelWidth = THUMB_BEZEL_WIDTH;

  return (
    <>
      <Filter
        id={filterId}
        blur={blurLevel}
        specularOpacity={specularOpacity}
        specularSaturation={specularSaturation}
        width={thumbWidth}
        height={thumbHeight}
        radius={thumbRadius}
        bezelWidth={thumbBezelWidth}
        glassThickness={glassThickness}
        refractiveIndex={refractiveIndex}
        bezelHeightFn={CONVEX}
        pixelRatio={6}
      />

      <BaseSlider.Root
        min={min}
        max={max}
        defaultValue={[defaultValue]}
        onValueChange={(details) => onChange?.(details.value)}
        className={css({
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "1",
        })}
      >
        {label && (
          <BaseSlider.Label
            className={css({
              fontSize: "14px",
              fontWeight: "medium",
              color: "gray.900",
            })}
          >
            {label}
          </BaseSlider.Label>
        )}

        {showValueText && (
          <BaseSlider.ValueText
            className={css({
              fontSize: "xs",
              color: "gray.600",
            })}
          />
        )}

        <BaseSlider.Control
          className={css({
            position: "relative",
            display: "flex",
            alignItems: "center",
          })}
          style={{
            width: sliderWidth,
            height: thumbHeight,
          }}
        >
          <BaseSlider.Track
            className={css({
              position: "relative",
              flex: "1",
              display: "flex",
              alignItems: "center",
            })}
            style={{
              width: sliderWidth,
              height: sliderHeight,
              borderRadius: sliderHeight / 2,
              backgroundColor: TRACK_COLOR,
            }}
          >
            <BaseSliderRange
              className={css({
                position: "absolute",
                left: "0",
                top: "0",
                bottom: "0",
              })}
              style={{
                height: sliderHeight,
                borderRadius: sliderHeight / 2,
                backgroundColor: TRACK_ACTIVE,
              }}
            />
          </BaseSlider.Track>

          <BaseSliderThumb
            index={0}
            className={css({
              outline: "none",
              transition: "transform 0.1s linear",
              "& > div": {
                backgroundColor: TRACK_ACTIVE,
                transformOrigin: "center",
                transition:
                  "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.2s ease",
              },
              "&[data-dragging] > div": {
                transform: `scale(${THUMB_ACTIVE_SCALE})`,
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                boxShadow:
                  "0 2px 4px rgba(0,0,0,0.1), inset 0 1px 3px rgba(0,0,0,0.1), inset 0 -1px 3px rgba(255,255,255,0.1)",
              },
            })}
          >
            <motion.div
              style={{
                height: thumbHeight,
                width: thumbWidth,
                borderRadius: thumbRadius,
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
