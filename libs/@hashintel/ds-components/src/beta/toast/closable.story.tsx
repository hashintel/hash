"use client";

import { Button } from "../button";
import { toaster } from "../toaster";

export const App = () => {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toaster.create({
          title: "Title",
          description: "Description",
          closable: true,
        })
      }
    >
      Add Toast
    </Button>
  );
};
