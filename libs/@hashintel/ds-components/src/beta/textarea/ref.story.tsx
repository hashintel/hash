"use client";

import { useRef } from "react";

import { Textarea } from "./textarea";

export const App = () => {
  const ref = useRef<HTMLTextAreaElement>(null);
  return <Textarea ref={ref} />;
};
