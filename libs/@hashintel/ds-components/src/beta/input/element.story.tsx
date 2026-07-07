import { EuroIcon, InfoIcon, UserIcon } from "lucide-react";

import { Stack } from "@hashintel/ds-helpers/jsx";

import { Input } from "../input";
import { InputGroup } from "../input-group";

export const App = () => {
  return (
    <Stack gap="4">
      <InputGroup startElement={<UserIcon />}>
        <Input placeholder="Username" />
      </InputGroup>

      <InputGroup endElement={<EuroIcon />}>
        <Input placeholder="0.00" />
      </InputGroup>

      <InputGroup startElement={<EuroIcon />} endElement={<InfoIcon />}>
        <Input placeholder="0.00" />
      </InputGroup>
    </Stack>
  );
};
