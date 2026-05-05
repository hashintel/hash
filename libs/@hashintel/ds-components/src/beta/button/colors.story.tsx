import { Wrap } from "@hashintel/ds-helpers/jsx";

import { Button } from "./button";

export const App = () => {
  return (
    <Wrap gap="4">
      <Button colorPalette="blue">Button</Button>
      <Button colorPalette="green">Button</Button>
      <Button colorPalette="amber">Button</Button>
      <Button colorPalette="red">Button</Button>
    </Wrap>
  );
};
