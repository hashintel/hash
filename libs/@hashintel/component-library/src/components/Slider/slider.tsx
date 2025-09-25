import { Slider as BaseSlider } from "@ark-ui/react/slider";
import { css } from "@hashintel/styled-system/css";
import { motion } from "motion/react";
import { useId } from "react";

import { Filter } from "../../lib/filter";
import { CONVEX } from "../../lib/surface-equations";

const BaseSliderThumb = motion(BaseSlider.Thumb);
const BaseSliderRange = motion(BaseSlider.Range);

const SLIDER_WIDTH = 330;
const SLIDER_HEIGHT = 4;
const THUMB_WIDTH = 16;
const THUMB_HEIGHT = 16;
const THUMB_RADIUS = THUMB_HEIGHT / 2;
const THUMB_ACTIVE_SCALE = 2;

const TRACK_COLOR = "#89898F66";
const TRACK_ACTIVE = "#000000";

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
  onChange,
}) => {
  const filterId = `thumb-filter-${useId()}`;

  const sliderHeight = SLIDER_HEIGHT;
  const sliderWidth = SLIDER_WIDTH;
  const thumbWidth = THUMB_WIDTH;
  const thumbHeight = THUMB_HEIGHT;
  const thumbRadius = THUMB_RADIUS;

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
        bezelWidth={thumbRadius * 0.8}
        glassThickness={glassThickness}
        refractiveIndex={refractiveIndex}
        bezelHeightFn={CONVEX}
        dpr={4}
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
          gap: "4px",
        })}
      >
        <BaseSlider.Label
          className={css({
            fontSize: "14px",
            fontWeight: "medium",
            color: "gray.900",
          })}
        >
          Label
        </BaseSlider.Label>

        <BaseSlider.ValueText
          className={css({
            fontSize: "12px",
            color: "gray.600",
          })}
        />

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
                backgroundColor: "black",
                transformOrigin: "center",
                transition:
                  "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.2s ease",
              },
              "&[data-dragging] > div": {
                transform: `scale(${THUMB_ACTIVE_SCALE})`,
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
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
