import { Stack } from "@hashintel/ds-helpers/jsx";

import * as Progress from "./progress";

export const App = () => {
  const shapes = ["rounded", "full", "square"] as const;
  return (
    <Stack gap="4">
      {shapes.map((shape) => (
        <Progress.Root key={shape} shape={shape} defaultValue={42}>
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      ))}
    </Stack>
  );
};
