import { Stack } from "@hashintel/ds-helpers/jsx";

import * as Checkbox from "./checkbox";

export const App = () => {
  const colors = ["blue", "green", "amber", "red"] as const;

  return (
    <Stack gap="4" alignItems="start">
      {colors.map((color) => (
        <Checkbox.Root colorPalette={color} key={color} defaultChecked>
          <Checkbox.HiddenInput />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Label>Label</Checkbox.Label>
        </Checkbox.Root>
      ))}
    </Stack>
  );
};
