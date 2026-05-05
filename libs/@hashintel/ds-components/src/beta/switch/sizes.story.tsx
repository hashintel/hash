import { Wrap } from "@hashintel/ds-helpers/jsx";

import * as Switch from "./switch";

export const App = () => {
  const sizes = ["xs", "sm", "md", "lg"] as const;

  return (
    <Wrap gap="4">
      {sizes.map((size) => (
        <Switch.Root key={size} size={size}>
          <Switch.HiddenInput />
          <Switch.Control />
          <Switch.Label />
        </Switch.Root>
      ))}
    </Wrap>
  );
};
