import { Flex } from "@hashintel/ds-helpers/jsx";

import { Text } from "./text";

export const App = () => {
  return (
    <Flex maxW="sm">
      <Text truncate>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
      </Text>
    </Flex>
  );
};
