import { DollarSignIcon } from "lucide-react";

import { InputGroup } from "../input-group/input-group";
import * as NumberInput from "./number-input";

export const App = () => {
  return (
    <NumberInput.Root defaultValue="42">
      <NumberInput.Control />
      <InputGroup startElement={<DollarSignIcon />}>
        <NumberInput.Input />
      </InputGroup>
    </NumberInput.Root>
  );
};
