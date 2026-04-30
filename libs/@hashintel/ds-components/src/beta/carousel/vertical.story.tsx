import { Center } from "@hashintel/ds-helpers/jsx";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { IconButton } from "../icon-button/icon-button";
import { Text } from "../text/text";
import * as Carousel from "./carousel";

export const App = () => {
  const slides = 5;

  return (
    <Carousel.Root slideCount={slides} orientation="vertical">
      <Carousel.ItemGroup>
        {Array.from({ length: slides }, (_, index) => (
          <Carousel.Item key={index} index={index}>
            <Center
              bg="colorPalette.subtle.bg"
              borderRadius="l2"
              height="full"
              flex="1"
            >
              <Text
                textStyle="3xl"
                fontWeight="semibold"
                color="colorPalette.subtle.fg"
              >
                {index + 1}
              </Text>
            </Center>
          </Carousel.Item>
        ))}
      </Carousel.ItemGroup>
      <Carousel.Control>
        <Carousel.PrevTrigger asChild>
          <IconButton size="sm" variant="plain">
            <ChevronUpIcon />
          </IconButton>
        </Carousel.PrevTrigger>
        <Carousel.IndicatorGroup />
        <Carousel.NextTrigger asChild>
          <IconButton size="sm" variant="plain">
            <ChevronDownIcon />
          </IconButton>
        </Carousel.NextTrigger>
      </Carousel.Control>
    </Carousel.Root>
  );
};
