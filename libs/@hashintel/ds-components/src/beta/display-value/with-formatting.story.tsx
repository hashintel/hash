"use client";

import { Stack } from "@hashintel/ds-helpers/jsx";

import { DisplayValue } from "../display-value";
import { Span } from "../span";

export const App = () => {
  return (
    <Stack gap="0">
      <Span>
        <DisplayValue
          value={new Date()}
          formatValue={(date) => date.toDateString()}
        />
      </Span>
      <Span>
        <DisplayValue
          value={["React", "Solid"]}
          formatValue={(arr) => arr.join(", ")}
        />
      </Span>
    </Stack>
  );
};
