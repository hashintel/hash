import { Wrap } from "@hashintel/ds-helpers/jsx";

import { Kbd } from "./kbd";

export const App = () => {
  return (
    <Wrap gap="4">
      <Kbd size="sm">Shift + Tab</Kbd>
      <Kbd size="md">Shift + Tab</Kbd>
      <Kbd size="lg">Shift + Tab</Kbd>
      <Kbd size="xl">Shift + Tab</Kbd>
    </Wrap>
  );
};
