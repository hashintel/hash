import { Wrap } from "@hashintel/ds-helpers/jsx";

import { Spinner } from "./spinner";

export const App = () => {
  return (
    <Wrap gap="4">
      <Spinner color="colorPalette.9" colorPalette="red" />
      <Spinner color="colorPalette.9" colorPalette="green" />
      <Spinner color="colorPalette.9" colorPalette="blue" />
      <Spinner color="colorPalette.9" colorPalette="amber" />
    </Wrap>
  );
};
