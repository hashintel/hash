import { Stack } from "@hashintel/ds-helpers/jsx";

import { Textarea } from "./textarea";

export const App = () => {
  const sizes = ["xs", "sm", "md", "lg", "xl"] as const;

  return (
    <Stack gap="4">
      {sizes.map((size, index) => (
        <Textarea
          key={size}
          placeholder={`size (${size})`}
          size={size}
          rows={index + 1}
        />
      ))}
    </Stack>
  );
};
