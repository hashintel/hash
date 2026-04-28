import { Wrap } from "@hashintel/ds-helpers/jsx";

import { CloseButton } from "./close-button";

export const App = () => {
  return (
    <Wrap gap="4">
      <CloseButton size="xs" />
      <CloseButton size="sm" />
      <CloseButton size="md" />
      <CloseButton size="lg" />
      <CloseButton size="xl" />
    </Wrap>
  );
};
