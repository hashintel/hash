"use client";

import { Stack } from "@hashintel/ds-helpers/jsx";
import { useState } from "react";

import { Button } from "../button/button";
import { Text } from "../text/text";
import { Skeleton } from "./skeleton";

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
