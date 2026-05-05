import { EuroIcon } from "lucide-react";

import { Input } from "../input/input";
import { InputGroup } from "./input-group";

export const App = () => {
  return (
    <InputGroup startElement={<EuroIcon />}>
      <Input placeholder="0.00" />
    </InputGroup>
  );
};
