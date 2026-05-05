import { Stack } from "@hashintel/ds-helpers/jsx";

import * as Progress from "./progress";

export const App = () => {
  const colors = ["blue", "green", "amber", "red"] as const;
  return (
    <Stack gap="4">
      {colors.map((color) => (
        <Progress.Root key={color} defaultValue={42} colorPalette={color}>
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      ))}
    </Stack>
  );
};
