import { useId } from "react";

import * as Switch from "../switch/switch";
import { Tooltip } from "./tooltip";

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
