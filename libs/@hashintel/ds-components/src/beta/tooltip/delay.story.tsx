import { Button } from "../button/button";
import { Tooltip } from "./tooltip";

export const App = () => {
  return (
    <Tooltip content="This is the tooltip content" closeDelay={0} openDelay={0}>
      <Button variant="outline" size="sm">
        Delay (open: 0ms, close: 0ms)
      </Button>
    </Tooltip>
  );
};
