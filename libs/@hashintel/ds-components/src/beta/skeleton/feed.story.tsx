import { HStack, Stack } from "@hashintel/ds-helpers/jsx";

import { Skeleton, SkeletonCircle, SkeletonText } from "./skeleton";

export const App = () => {
  return (
    <Stack gap="6">
      <HStack width="full">
        <SkeletonCircle boxSize="10" />
        <SkeletonText noOfLines={2} />
      </HStack>
      <Skeleton height="200px" />
    </Stack>
  );
};
