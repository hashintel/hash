import { Stack } from "@hashintel/ds-helpers/jsx";
import { EuroIcon } from "lucide-react";

import { Group } from "../group/group";
import { Input } from "../input/input";
import { InputAddon } from "./input-addon";

export const App = () => {
  const variants = ["outline", "subtle", "surface"] as const;
  return (
    <Stack gap="4">
      {variants.map((variant) => (
        <Group key={variant} attached>
          <InputAddon variant={variant}>
            <EuroIcon />
          </InputAddon>
          <Input placeholder="0.00" variant={variant} />
          <InputAddon variant={variant}>EUR</InputAddon>
        </Group>
      ))}
    </Stack>
  );
};
