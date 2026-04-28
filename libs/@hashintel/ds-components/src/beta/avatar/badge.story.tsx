import { Circle, Float } from "@hashintel/ds-helpers/jsx";

import * as Avatar from "./avatar";

export const App = () => {
  return (
    <Avatar.Root size="lg">
      <Avatar.Fallback name="Christian Busch" />
      <Float placement="bottom-end" offsetX="1" offsetY="1">
        <Circle
          bg="colorPalette.solid.bg"
          size="2"
          outline="0.2em solid"
          outlineColor="canvas"
        />
      </Float>
    </Avatar.Root>
  );
};
