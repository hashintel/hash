import { Wrap } from "@hashintel/ds-helpers/jsx";
import { SearchIcon } from "lucide-react";

import { IconButton } from "./icon-button";

export const App = () => {
  return (
    <Wrap gap="4">
      <IconButton variant="solid" aria-label="Search">
        <SearchIcon />
      </IconButton>
      <IconButton variant="surface" aria-label="Search">
        <SearchIcon />
      </IconButton>
      <IconButton variant="subtle" aria-label="Search">
        <SearchIcon />
      </IconButton>
      <IconButton variant="outline" aria-label="Search">
        <SearchIcon />
      </IconButton>
      <IconButton variant="plain" aria-label="Search">
        <SearchIcon />
      </IconButton>
    </Wrap>
  );
};
