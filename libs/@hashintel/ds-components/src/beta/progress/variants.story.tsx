import { Stack } from "@hashintel/ds-helpers/jsx";

import * as Progress from "./progress";

export const App = () => {
  const variants = ["solid", "subtle"] as const;
  return (
    <Stack gap="4">
      {variants.map((variant) => (
        <Progress.Root key={variant} defaultValue={42} variant={variant}>
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      ))}
    </Stack>
  );
};
