import { Stack } from "@hashintel/ds-helpers/jsx";

import * as Checkbox from "./checkbox";

export const App = () => {
  const sizes = ["sm", "md", "lg"] as const;
  return (
    <Stack gap="4" alignItems="start">
      {sizes.map((size) => (
        <Checkbox.Root size={size} key={size} defaultChecked>
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
