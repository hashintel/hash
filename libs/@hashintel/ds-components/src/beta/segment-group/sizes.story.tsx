import { Stack } from "@hashintel/ds-helpers/jsx";

import * as SegmentGroup from "./segment-group";

const items = ["React", "Solid", "Svelte", "Vue"];

export const App = () => {
  const sizes = ["xs", "sm", "md", "lg", "xl"] as const;

  return (
    <Stack gap="4" alignItems="start">
      {sizes.map((size) => (
        <SegmentGroup.Root key={size} defaultValue="React" size={size}>
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={items} />
        </SegmentGroup.Root>
      ))}
    </Stack>
  );
};
