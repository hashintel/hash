"use client";

import { useRef } from "react";

import { Text } from "./text";

export const App = () => {
  const ref = useRef<HTMLParagraphElement>(null);
  return (
    <Text ref={ref}>
      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    </Text>
  );
};
