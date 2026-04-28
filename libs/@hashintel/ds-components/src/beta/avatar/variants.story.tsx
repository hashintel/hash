import { Wrap } from "@hashintel/ds-helpers/jsx";

import * as Avatar from "./avatar";

export const App = () => {
  const variants = ["solid", "surface", "subtle", "outline"] as const;

  return (
    <Wrap gap="4">
      {variants.map((variant) => (
        <Avatar.Root variant={variant} size="lg" key={variant}>
          <Avatar.Fallback name="Christian Busch" />
        </Avatar.Root>
      ))}
    </Wrap>
  );
};
