import { Stack } from "@hashintel/ds-helpers/jsx";

import * as NumberInput from "./number-input";

export const App = () => {
  return (
    <Stack gap="4">
      <NumberInput.Root
        defaultValue="5"
        step={0.01}
        formatOptions={{
          style: "percent",
        }}
      >
        <NumberInput.Control />
        <NumberInput.Input />
      </NumberInput.Root>

      <NumberInput.Root
        defaultValue="45"
        formatOptions={{
          style: "currency",
          currency: "EUR",
          currencyDisplay: "code",
          currencySign: "accounting",
        }}
      >
        <NumberInput.Control />
        <NumberInput.Input />
      </NumberInput.Root>

      <NumberInput.Root
        defaultValue="4"
        formatOptions={{
          style: "unit",
          unit: "inch",
          unitDisplay: "long",
        }}
      >
        <NumberInput.Control />
        <NumberInput.Input />
      </NumberInput.Root>
    </Stack>
  );
};
