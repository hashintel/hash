import { Stack } from "@hashintel/ds-helpers/jsx";

import { Input } from "./input";

export const App = () => {
  const sizes = ["sm", "md", "lg", "xl"] as const;
  return (
    <Stack gap="4">
      {sizes.map((size) => (
        <Input key={size} placeholder={size} size={size} />
      ))}
    </Stack>
  );
};
