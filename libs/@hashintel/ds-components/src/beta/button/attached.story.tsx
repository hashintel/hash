import { ChevronDownIcon } from "lucide-react";

import { IconButton } from "../icon-button/icon-button";
import { Button, ButtonGroup } from "./button";

export const App = () => {
  return (
    <ButtonGroup variant="outline" attached>
      <Button>Button</Button>
      <IconButton>
        <ChevronDownIcon />
      </IconButton>
    </ButtonGroup>
  );
};
