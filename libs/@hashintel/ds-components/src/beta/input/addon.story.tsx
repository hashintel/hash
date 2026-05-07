import { Stack } from "@hashintel/ds-helpers/jsx";
import { AtSignIcon, EuroIcon } from "lucide-react";

import { Group } from "../group";
import { Input } from "../input";
import { InputAddon } from "../input-addon";

export const App = () => {
  return (
    <Stack gap="4">
      <Group attached>
        <InputAddon>https://</InputAddon>
        <Input placeholder="yoursite.com" />
      </Group>
      <Group attached>
        <InputAddon>
          <AtSignIcon />
        </InputAddon>
        <Input placeholder="Username" />
      </Group>
      <Group attached>
        <InputAddon>
          <EuroIcon />
        </InputAddon>
        <Input placeholder="0.00" />
        <InputAddon>EUR</InputAddon>
      </Group>
    </Stack>
  );
};
