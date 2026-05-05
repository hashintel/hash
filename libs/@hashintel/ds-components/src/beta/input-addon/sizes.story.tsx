import { Stack } from "@hashintel/ds-helpers/jsx";
import { EuroIcon } from "lucide-react";

import { Group } from "../group/group";
import { Input } from "../input/input";
import { InputAddon } from "./input-addon";

export const App = () => {
  const sizes = ["sm", "md", "lg", "xl"] as const;
  return (
    <Stack gap="4">
      {sizes.map((size) => (
        <Group key={size} attached>
          <InputAddon size={size}>
            <EuroIcon />
          </InputAddon>
          <Input placeholder="0.00" size={size} />
          <InputAddon>EUR</InputAddon>
        </Group>
      ))}
    </Stack>
  );
};
