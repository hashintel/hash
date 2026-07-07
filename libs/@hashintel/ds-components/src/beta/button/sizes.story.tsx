import { CircleDotIcon } from "lucide-react";

import { Wrap } from "@hashintel/ds-helpers/jsx";

import { Button } from "../button";

export const App = () => {
  const sizes = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;

  return (
    <Wrap gap="4">
      {sizes.map((size) => (
        <Button key={size} size={size}>
          Button <CircleDotIcon />
        </Button>
      ))}
    </Wrap>
  );
};
