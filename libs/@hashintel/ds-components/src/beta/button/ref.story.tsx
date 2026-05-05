"use client";

import { useRef } from "react";

import { Button } from "./button";

export const App = () => {
  const ref = useRef<HTMLButtonElement>(null);
  return <Button ref={ref}>Click me</Button>;
};
