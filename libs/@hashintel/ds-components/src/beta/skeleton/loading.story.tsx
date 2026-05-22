"use client";

import { useState } from "react";

import { Stack } from "@hashintel/ds-helpers/jsx";

import { Button } from "../button";
import { Skeleton } from "../skeleton";
import { Text } from "../text";

export const App = () => {
  const [loading, setLoading] = useState(true);

  return (
    <Stack align="flex-start" gap="4">
      <Skeleton loading={loading}>
        <Text>Park UI rocks 🚀</Text>
      </Skeleton>
      <Button variant="surface" onClick={() => setLoading((c) => !c)}>
        Toggle
      </Button>
    </Stack>
  );
};
