import { SearchIcon } from "lucide-react";

import { IconButton } from "../icon-button/icon-button";
import { Input } from "../input/input";
import { InputGroup } from "./input-group";

export const App = () => {
  return (
    <InputGroup
      endElement={
        <IconButton variant="surface" size="xs" colorPalette="gray">
          <SearchIcon />
        </IconButton>
      }
    >
      <Input placeholder="Search" />
    </InputGroup>
  );
};
