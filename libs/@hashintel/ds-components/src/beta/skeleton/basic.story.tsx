import { Stack, Wrap } from "@hashintel/ds-helpers/jsx";

import { Skeleton, SkeletonCircle } from "./skeleton";

export const App = () => {
  return (
    <Wrap gap="4">
      <SkeletonCircle boxSize="12" />
      <Stack flex="1">
        <Skeleton height="5" />
        <Skeleton height="5" width="80%" />
      </Stack>
    </Wrap>
  );
};
