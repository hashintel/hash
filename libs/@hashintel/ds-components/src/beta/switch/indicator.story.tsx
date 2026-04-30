import { MoonIcon, SunIcon } from "lucide-react";

import { Icon } from "../icon/icon";
import * as Switch from "./switch";

export const App = () => {
  return (
    <Switch.Root size="lg">
      <Switch.HiddenInput />
      <Switch.Control>
        <Switch.Thumb />
        <Switch.Indicator
          fallback={
            <Icon color="red.9">
              <MoonIcon />
            </Icon>
          }
        >
          <Icon color="blue.9">
            <SunIcon />
          </Icon>
        </Switch.Indicator>
      </Switch.Control>
      <Switch.Label>Label</Switch.Label>
    </Switch.Root>
  );
};
