import { useId } from "react";

import { Tooltip } from "../tooltip/tooltip";
import * as Switch from "./switch";

export const App = () => {
  const id = useId();
  return (
    <Tooltip ids={{ trigger: id }} content="This is a tooltip">
      <Switch.Root ids={{ root: id }}>
        <Switch.HiddenInput />
        <Switch.Control />
        <Switch.Label>Switch with tooltip</Switch.Label>
      </Switch.Root>
    </Tooltip>
  );
};
