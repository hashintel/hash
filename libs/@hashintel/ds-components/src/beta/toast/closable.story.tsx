"use client";

import { Button } from "../button/button";
import { toaster } from "./toast";

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
