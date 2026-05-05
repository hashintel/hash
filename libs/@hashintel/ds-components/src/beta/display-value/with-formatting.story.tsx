"use client";

import { Stack } from "@hashintel/ds-helpers/jsx";

import { Span } from "../span/span";
import { DisplayValue } from "./display-value";

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
