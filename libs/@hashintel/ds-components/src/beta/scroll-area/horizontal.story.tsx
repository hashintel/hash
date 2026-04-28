import { Center, HStack } from "@hashintel/ds-helpers/jsx";

import * as ScrollArea from "./scroll-area";

export const App = () => (
  <ScrollArea.Root scrollbar="visible">
    <ScrollArea.Viewport pb="1">
      <ScrollArea.Content>
        <HStack gap="3">
          {Array.from({ length: 12 }, (_, i) => (
            <Center key={i} h="20" w="40" bg="gray.subtle.bg" borderRadius="l2">
              {i + 1}
            </Center>
          ))}
        </HStack>
      </ScrollArea.Content>
    </ScrollArea.Viewport>
    <ScrollArea.Scrollbar orientation="horizontal" />
    <ScrollArea.Corner />
  </ScrollArea.Root>
);
