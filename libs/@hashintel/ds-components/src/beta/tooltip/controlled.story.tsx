"use client";

import { useState } from "react";

import { Button } from "../button/button";
import { Tooltip } from "./tooltip";

export const App = () => {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip
      content="This is the tooltip content"
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
    >
      <Button variant="outline" size="sm">
        {open ? "Hide" : "Show"} Tooltip
      </Button>
    </Tooltip>
  );
};
