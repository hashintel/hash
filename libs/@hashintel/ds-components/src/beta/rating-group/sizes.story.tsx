import { Stack } from "@hashintel/ds-helpers/jsx";

import * as RatingGroup from "./rating-group";

export const App = () => {
  const sizes = ["xs", "sm", "md", "lg", "xl"] as const;

  return (
    <Stack gap="4">
      {sizes.map((size) => (
        <RatingGroup.Root key={size} count={5} defaultValue={3} size={size}>
          <RatingGroup.HiddenInput />
          <RatingGroup.Control />
        </RatingGroup.Root>
      ))}
    </Stack>
  );
};
