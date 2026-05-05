"use client";

import { useState } from "react";

import * as Switch from "./switch";

export const App = () => {
  const [checked, setChecked] = useState(false);
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={(e) => setChecked(e.checked)}
    >
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.Label>Label</Switch.Label>
      <Switch.HiddenInput />
    </Switch.Root>
  );
};
