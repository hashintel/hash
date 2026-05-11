import { VStack } from "@hashintel/ds-helpers/jsx";

import { Spinner } from "../spinner";
import { Text } from "../text";

export const App = () => {
  return (
    <VStack gap="1.5">
      <Spinner />
      <Text color="fg.muted">Loading Users ...</Text>
    </VStack>
  );
};
