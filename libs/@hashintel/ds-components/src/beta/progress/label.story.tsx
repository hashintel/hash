import { HStack } from "@hashintel/ds-helpers/jsx";

import * as Progress from "./progress";

export const App = () => {
  return (
    <Progress.Root defaultValue={42}>
      <HStack gap="4">
        <Progress.Label>Usage</Progress.Label>
        <Progress.Track flex="1">
          <Progress.Range />
        </Progress.Track>
        <Progress.ValueText />
      </HStack>
    </Progress.Root>
  );
};
