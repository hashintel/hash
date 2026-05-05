import { Stack } from "@hashintel/ds-helpers/jsx";

import * as PinInput from "./pin-input";

export const App = () => {
  const sizes = ["sm", "md", "lg", "xl"] as const;
  return (
    <Stack gap="4">
      {sizes.map((size) => (
        <PinInput.Root key={size} size={size}>
          <PinInput.HiddenInput />
          <PinInput.Control>
            <PinInput.Input index={0} />
            <PinInput.Input index={1} />
            <PinInput.Input index={2} />
            <PinInput.Input index={3} />
          </PinInput.Control>
        </PinInput.Root>
      ))}
    </Stack>
  );
};
