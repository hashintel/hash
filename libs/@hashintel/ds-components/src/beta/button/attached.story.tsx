import { ChevronDownIcon } from "lucide-react";

import { Button, ButtonGroup } from "../button";
import { IconButton } from "../icon-button";

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
