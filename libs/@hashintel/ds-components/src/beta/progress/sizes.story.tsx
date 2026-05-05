import { Stack } from "@hashintel/ds-helpers/jsx";

import * as Progress from "./progress";

export const App = () => {
  const sizes = ["xs", "sm", "md", "lg", "xl"] as const;
  return (
    <Stack gap="4">
      {sizes.map((size) => (
        <Progress.Root key={size} size={size}>
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      ))}
    </Stack>
  );
};
