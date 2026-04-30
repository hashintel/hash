import { Stack } from "@hashintel/ds-helpers/jsx";

import { Input } from "./input";

export const App = () => {
  const variants = ["outline", "subtle", "surface", "flushed"] as const;
  return (
    <Stack gap="4">
      {variants.map((variant) => (
        <Input key={variant} placeholder={variant} variant={variant} />
      ))}
    </Stack>
  );
};
