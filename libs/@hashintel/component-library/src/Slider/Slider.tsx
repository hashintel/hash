import { Slider as BaseSlider } from "@ark-ui/react/slider";
import { css } from "@hashintel/styled-system/css";
import { motion } from "motion/react";
import { useId } from "react";

import { Filter } from "../lib/Filter";
import { CONVEX } from "../lib/surfaceEquations";

const BaseSliderThumb = motion(BaseSlider.Thumb);
const BaseSliderRange = motion(BaseSlider.Range);

const SLIDER_WIDTH = 330;
const SLIDER_HEIGHT = 4;
const THUMB_WIDTH = 25;
const THUMB_HEIGHT = 25;
const THUMB_RADIUS = THUMB_HEIGHT / 2;

const TRACK_COLOR = "#89898F66";
const TRACK_ACTIVE = "#000000";

export interface SliderProps {
  min?: number;
  max?: number;
  defaultValue?: number;
  specularOpacity?: number;
  specularSaturation?: number;
  refractionLevel?: number;
  blurLevel?: number;
  forceActive?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  specularOpacity = 0.4,
  specularSaturation = 7,
  blurLevel = 0,
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
        bezelWidth={thumbRadius * 1}
        glassThickness={22}
        refractiveIndex={1.5}
        bezelHeightFn={CONVEX}
      />

      <BaseSlider.Root>
        <BaseSlider.Label>Label</BaseSlider.Label>
        <BaseSlider.ValueText />

        <BaseSlider.Control
          style={{
            width: sliderWidth,
            height: thumbHeight,
          }}
        >
          <BaseSlider.Track
            className={css({
              backgroundColor: TRACK_COLOR,
            })}
            style={{
              width: sliderWidth,
              height: sliderHeight,
              borderRadius: sliderHeight / 2,
            }}
          >
            <BaseSliderRange
              style={{
                height: sliderHeight,
                borderRadius: 6,
                backgroundColor: TRACK_ACTIVE,
              }}
            />
          </BaseSlider.Track>

          <BaseSliderThumb index={0}>
            <motion.div
              style={{
                height: thumbHeight,
                width: thumbWidth,
                borderRadius: thumbRadius,
                backdropFilter: `url(#${filterId})`,
                backgroundColor: "red",
                boxShadow: "0 3px 14px rgba(0,0,0,0.1)",
              }}
            />
            <BaseSlider.HiddenInput />
          </BaseSliderThumb>
        </BaseSlider.Control>
      </BaseSlider.Root>
    </>
  );
};
