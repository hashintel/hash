import { PlusIcon } from "lucide-react";

import * as Checkbox from "./checkbox";

export const App = () => {
  return (
    <Checkbox.Root>
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator>
          <PlusIcon />
        </Checkbox.Indicator>
      </Checkbox.Control>
      <Checkbox.Label>Label</Checkbox.Label>
    </Checkbox.Root>
  );
};
