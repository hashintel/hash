import { Stack } from "@hashintel/ds-helpers/jsx";

import { DisplayValue } from "./display-value";

export const App = () => {
  return (
    <Stack gap="0">
      <DisplayValue value={null} />
      <DisplayValue value={undefined} />
      <DisplayValue value="" />
      <DisplayValue value={[]} />
    </Stack>
  );
};
