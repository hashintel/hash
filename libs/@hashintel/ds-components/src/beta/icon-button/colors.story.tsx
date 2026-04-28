import { Wrap } from "@hashintel/ds-helpers/jsx";
import { SearchIcon } from "lucide-react";

import { IconButton } from "./icon-button";

export const App = () => {
  return (
    <Wrap gap="4">
      <IconButton colorPalette="red" aria-label="Search">
        <SearchIcon />
      </IconButton>
      <IconButton colorPalette="green" aria-label="Search">
        <SearchIcon />
      </IconButton>
      <IconButton colorPalette="blue" aria-label="Search">
        <SearchIcon />
      </IconButton>
      <IconButton colorPalette="amber" aria-label="Search">
        <SearchIcon />
      </IconButton>
    </Wrap>
  );
};
