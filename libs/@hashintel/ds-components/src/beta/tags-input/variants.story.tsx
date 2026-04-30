import { Stack } from "@hashintel/ds-helpers/jsx";

import * as TagsInput from "./tags-input";

export const App = () => {
  const variants = ["outline", "subtle", "surface"] as const;
  return (
    <Stack gap="4">
      {variants.map((variant) => (
        <TagsInput.Root
          key={variant}
          variant={variant}
          defaultValue={["React", "Solid", "Vue"]}
        >
          <TagsInput.Label>Tags</TagsInput.Label>
          <TagsInput.Control>
            <TagsInput.Items />
            <TagsInput.Input placeholder="Add tag..." />
          </TagsInput.Control>
        </TagsInput.Root>
      ))}
    </Stack>
  );
};
