import { SendIcon } from "lucide-react";

import { IconButton } from "./icon-button";

export const App = () => {
  return (
    <IconButton aria-label="Send message">
      <SendIcon />
    </IconButton>
  );
};
