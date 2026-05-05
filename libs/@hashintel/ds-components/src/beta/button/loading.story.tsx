import { Wrap } from "@hashintel/ds-helpers/jsx";

import { Button } from "./button";

export const App = () => {
  return (
    <Wrap gap="4">
      <Button loading>Click me</Button>
      <Button loading loadingText="Saving...">
        Click me
      </Button>
    </Wrap>
  );
};
