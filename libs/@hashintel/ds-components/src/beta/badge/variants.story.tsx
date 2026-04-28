import { Wrap } from "@hashintel/ds-helpers/jsx";

import { Badge } from "./badge";

export const App = () => {
  return (
    <Wrap gap="4">
      <Badge variant="solid">Solid</Badge>
      <Badge variant="surface">Surface</Badge>
      <Badge variant="subtle">Subtle</Badge>
      <Badge variant="outline">Outline</Badge>
    </Wrap>
  );
};
