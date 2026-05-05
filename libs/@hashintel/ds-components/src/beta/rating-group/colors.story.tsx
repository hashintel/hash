import { Stack } from "@hashintel/ds-helpers/jsx";

import * as RatingGroup from "./rating-group";

export const App = () => {
  const colors = ["blue", "green", "amber", "red"] as const;
  return (
    <Stack gap="4">
      {colors.map((color) => (
        <RatingGroup.Root
          key={color}
          count={5}
          defaultValue={3}
          colorPalette={color}
        >
          <RatingGroup.HiddenInput />
          <RatingGroup.Control />
        </RatingGroup.Root>
      ))}
    </Stack>
  );
};
