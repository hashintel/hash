import { Box } from "@hashintel/ds-helpers/jsx";

import { Button } from "../button/button";
import * as Collapsible from "./collapsible";

export const App = () => {
  return (
    <Collapsible.Root>
      <Collapsible.Trigger asChild>
        <Button variant="outline">Toggle</Button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <Box p="4" mt="3" borderWidth="1px">
          Park UI beautifully-designed, accessible components system and code
          distribution platform. Built with Panda CSS and supporting a wide
          range of JS frameworks
        </Box>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
