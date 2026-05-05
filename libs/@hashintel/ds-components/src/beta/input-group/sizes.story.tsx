import { Stack } from "@hashintel/ds-helpers/jsx";
import { EuroIcon, InfoIcon } from "lucide-react";

import { Input } from "../input/input";
import { InputGroup } from "./input-group";

export const App = () => {
  const sizes = ["xs", "sm", "md", "lg", "xl"] as const;
  return (
    <Stack gap="4">
      {sizes.map((size) => (
        <InputGroup
          key={size}
          size={size}
          startElement={<EuroIcon />}
          endElement={<InfoIcon />}
        >
          <Input placeholder="0.00" size={size} />
        </InputGroup>
      ))}
    </Stack>
  );
};
