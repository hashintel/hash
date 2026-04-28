import { VStack } from "@hashintel/ds-helpers/jsx";

import { Text } from "../text/text";
import { Spinner } from "./spinner";

export const App = () => {
  return (
    <VStack gap="1.5">
      <Spinner />
      <Text color="fg.muted">Loading Users ...</Text>
    </VStack>
  );
};
