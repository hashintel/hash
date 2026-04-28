import { Flex } from "@hashintel/ds-helpers/jsx";

import { Text } from "./text";

export const App = () => {
  return (
    <Flex maxW="sm">
      <Text lineClamp="2">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
        tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
        veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
        commodo consequat.
      </Text>
    </Flex>
  );
};
