import { Stack } from "@hashintel/ds-helpers/jsx";

import { Textarea } from "./textarea";

export const App = () => {
  const variants = ["outline", "subtle", "surface", "flushed"] as const;
  return (
    <Stack gap="4">
      {variants.map((variant) => (
        <Textarea key={variant} placeholder={variant} variant={variant} />
      ))}
    </Stack>
  );
};
