import { SendIcon } from "lucide-react";

import { IconButton } from "./icon-button";

export const App = () => {
  return (
    <IconButton borderRadius="full" aria-label="Send message">
      <SendIcon />
    </IconButton>
  );
};
