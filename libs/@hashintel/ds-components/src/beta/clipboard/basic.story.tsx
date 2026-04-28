import { IconButton } from "../icon-button/icon-button";
import * as Clipboard from "./clipboard";

export const App = () => {
  return (
    <Clipboard.Root value="https://park-ui.com">
      <Clipboard.Trigger asChild>
        <IconButton variant="surface" size="sm">
          <Clipboard.Indicator />
        </IconButton>
      </Clipboard.Trigger>
    </Clipboard.Root>
  );
};
