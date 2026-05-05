import { Button } from "../button/button";
import { Tooltip } from "./tooltip";

export const App = () => {
  return (
    <Tooltip showArrow content="This is the tooltip content">
      <Button variant="outline" size="sm">
        Hover me
      </Button>
    </Tooltip>
  );
};
