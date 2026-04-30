"use client";

import { useRef } from "react";

import { Input } from "./input";

export const App = () => {
  const ref = useRef<HTMLInputElement>(null);
  return <Input ref={ref} />;
};
