"use client";

/* eslint-disable @typescript-eslint/no-shadow, react/no-array-index-key */

import { Carousel, useCarouselContext } from "@ark-ui/react/carousel";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import { type ComponentProps, forwardRef } from "react";

import { carouselSlotRecipe } from "./carousel.recipe";

const { withProvider, withContext } = createStyleContext(carouselSlotRecipe);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withProvider(Carousel.Root, "root", {
  forwardProps: ["page"],
  defaultProps: { spacing: "16px" },
});
export const RootProvider = withProvider(Carousel.RootProvider, "root");
export const AutoplayTrigger = withContext(
  Carousel.AutoplayTrigger,
  "autoplayTrigger",
);
export const Control = withContext(Carousel.Control, "control");
export const Indicator = withContext(Carousel.Indicator, "indicator");
export const Item = withContext(Carousel.Item, "item");
export const ItemGroup = withContext(Carousel.ItemGroup, "itemGroup");
export const NextTrigger = withContext(Carousel.NextTrigger, "nextTrigger");
export const PrevTrigger = withContext(Carousel.PrevTrigger, "prevTrigger");

const StyledIndicatorGroup = withContext(
  Carousel.IndicatorGroup,
  "indicatorGroup",
);
export const IndicatorGroup = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof StyledIndicatorGroup>
>((props, ref) => {
  const carouselSlotRecipe = useCarouselContext();

  return (
    <StyledIndicatorGroup {...props} ref={ref}>
      {carouselSlotRecipe.pageSnapPoints.map((_, index) => (
        <Indicator key={index} index={index} />
      ))}
    </StyledIndicatorGroup>
  );
});

export { CarouselContext as Context } from "@ark-ui/react/carousel";
