"use client";

import { useState } from "react";

import * as NumberInput from "./number-input";

export const App = () => {
  const [value, setValue] = useState("10");
  return (
    <NumberInput.Root value={value} onValueChange={(e) => setValue(e.value)}>
      <NumberInput.Control />
      <NumberInput.Input />
    </NumberInput.Root>
  );
};
