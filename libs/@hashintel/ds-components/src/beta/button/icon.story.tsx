import { Wrap } from "@hashintel/ds-helpers/jsx";
import { PhoneIcon, SendIcon } from "lucide-react";

import { Button } from "./button";

export const App = () => {
  return (
    <Wrap gap="4">
      <Button>
        <SendIcon />
        Send
      </Button>
      <Button variant="outline">
        Call us <PhoneIcon />
      </Button>
    </Wrap>
  );
};
