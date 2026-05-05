"use client";

import { Wrap } from "@hashintel/ds-helpers/jsx";

import { Button } from "../button/button";
import { toaster } from "./toast";

export const App = () => {
  const types = ["success", "error", "warning", "info"] as const;

  return (
    <Wrap gap="4">
      {types.map((type) => (
        <Button
          variant="outline"
          key={type}
          onClick={() =>
            toaster.create({
              title: `Toast status is ${type}`,
              type,
              duration: 40000,
            })
          }
        >
          {type}
        </Button>
      ))}
    </Wrap>
  );
};
