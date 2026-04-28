import { Stack } from "@hashintel/ds-helpers/jsx";

import { Code } from "./code";

export const App = () => {
  const variants = ["solid", "surface", "outline", "subtle", "plain"] as const;
  return (
    <Stack gap="4" alignItems="start">
      {variants.map((variant) => (
        <Code key={variant} variant={variant}>
          console.log()
        </Code>
      ))}
    </Stack>
  );
};
