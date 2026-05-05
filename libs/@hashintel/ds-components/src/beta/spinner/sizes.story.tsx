import { Wrap } from "@hashintel/ds-helpers/jsx";

import { Spinner } from "./spinner";

export const App = () => {
  return (
    <Wrap gap="4">
      <Spinner size="xs" />
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
      <Spinner size="xl" />
      <Spinner size="2xl" />
    </Wrap>
  );
};
