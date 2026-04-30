import { Stack } from "@hashintel/ds-helpers/jsx";

import { Text } from "../text/text";
import { Skeleton } from "./skeleton";

export const App = () => {
  return (
    <Stack gap="4">
      <Stack gap="1.5">
        <Text textStyle="label">Pulse</Text>
        <Skeleton flex="1" minH="5" variant="pulse" />
      </Stack>
      <Stack gap="1.5">
        <Text textStyle="label">Shine</Text>
        <Skeleton flex="1" minH="5" variant="shine" />
      </Stack>
    </Stack>
  );
};
