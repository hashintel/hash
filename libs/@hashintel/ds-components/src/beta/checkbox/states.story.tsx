import { Stack } from "@hashintel/ds-helpers/jsx";

import * as Checkbox from "./checkbox";

export const App = () => {
  return (
    <Stack gap="4" alignItems="start">
      <Checkbox.Root disabled>
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>Disabled</Checkbox.Label>
      </Checkbox.Root>

      <Checkbox.Root defaultChecked disabled>
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>Disabled</Checkbox.Label>
      </Checkbox.Root>

      <Checkbox.Root readOnly>
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>Readonly</Checkbox.Label>
      </Checkbox.Root>

      <Checkbox.Root invalid>
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>Invalid</Checkbox.Label>
      </Checkbox.Root>
    </Stack>
  );
};
