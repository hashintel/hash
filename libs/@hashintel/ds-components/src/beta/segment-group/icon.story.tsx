import { HStack } from "@hashintel/ds-helpers/jsx";
import { Grid2X2Icon, ListIcon, TableIcon } from "lucide-react";

import * as SegmentGroup from "./segment-group";

export const App = () => {
  return (
    <SegmentGroup.Root defaultValue="table">
      <SegmentGroup.Indicator />
      <SegmentGroup.Items
        items={[
          {
            value: "table",
            label: (
              <HStack>
                <TableIcon />
                Table
              </HStack>
            ),
          },
          {
            value: "board",
            label: (
              <HStack>
                <Grid2X2Icon />
                Board
              </HStack>
            ),
          },
          {
            value: "list",
            label: (
              <HStack>
                <ListIcon />
                List
              </HStack>
            ),
          },
        ]}
      />
    </SegmentGroup.Root>
  );
};
