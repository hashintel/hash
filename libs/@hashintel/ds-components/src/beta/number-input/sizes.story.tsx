import { Stack } from "@hashintel/ds-helpers/jsx";

import * as NumberInput from "./number-input";

export const App = () => {
  const sizes = ["sm", "md", "lg", "xl"] as const;
  return (
    <Stack gap="4">
      {sizes.map((size) => (
        <NumberInput.Root key={size} size={size} defaultValue="42">
          <NumberInput.Control />
          <NumberInput.Input />
        </NumberInput.Root>
      ))}
    </Stack>
  );
};
