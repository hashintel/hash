"use client";

import { Wrap } from "@hashintel/ds-helpers/jsx";

import { Button } from "../button/button";
import { toaster } from "./toast";

export const App = () => {
  return (
    <Wrap gap="4">
      <Button
        variant="outline"
        onClick={() =>
          toaster.create({
            title: "Title",
            description: "Description",
          })
        }
      >
        Add Toast
      </Button>
      <Button variant="outline" onClick={() => toaster.dismiss()}>
        Close Toasts
      </Button>
    </Wrap>
  );
};
