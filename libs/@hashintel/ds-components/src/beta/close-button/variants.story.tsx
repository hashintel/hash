import { Wrap } from "@hashintel/ds-helpers/jsx";

import { CloseButton } from "./close-button";

export const App = () => {
  return (
    <Wrap gap="4">
      <CloseButton variant="solid" />
      <CloseButton variant="surface" />
      <CloseButton variant="subtle" />
      <CloseButton variant="outline" />
      <CloseButton variant="plain" />
    </Wrap>
  );
};
