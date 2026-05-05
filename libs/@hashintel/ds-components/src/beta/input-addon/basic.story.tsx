import { EuroIcon } from "lucide-react";

import { Group } from "../group/group";
import { Input } from "../input/input";
import { InputAddon } from "./input-addon";

export const App = () => {
  return (
    <Group attached width="full">
      <InputAddon>
        <EuroIcon />
      </InputAddon>
      <Input placeholder="0.00" />
      <InputAddon>EUR</InputAddon>
    </Group>
  );
};
