import { Wrap } from "@hashintel/ds-helpers/jsx";

import { Kbd } from "./kbd";

export const App = () => {
  return (
    <Wrap gap="4">
      <Kbd>⌘</Kbd>
      <Kbd>⌥</Kbd>
      <Kbd>⇧</Kbd>
      <Kbd>⌃</Kbd>
    </Wrap>
  );
};
