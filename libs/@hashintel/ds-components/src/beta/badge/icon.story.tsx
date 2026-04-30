import { Wrap } from "@hashintel/ds-helpers/jsx";
import { StarIcon } from "lucide-react";

import { Badge } from "./badge";

export const App = () => {
  return (
    <Wrap gap="4">
      <Badge variant="solid" colorPalette="blue">
        <StarIcon /> New
      </Badge>
      <Badge variant="solid" colorPalette="green">
        New <StarIcon />
      </Badge>
    </Wrap>
  );
};
