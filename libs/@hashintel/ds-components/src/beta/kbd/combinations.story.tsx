import { HStack } from "@hashintel/ds-helpers/jsx";

import { Kbd } from "./kbd";

export const App = () => {
  return (
    <HStack gap="1">
      <Kbd>ctrl</Kbd>+<Kbd>shift</Kbd>+<Kbd>del</Kbd>
    </HStack>
  );
};
