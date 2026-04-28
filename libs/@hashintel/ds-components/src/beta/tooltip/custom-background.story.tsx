import { Button } from "../button/button";
import { Tooltip } from "./tooltip";

export const App = () => {
  return (
    <Tooltip
      showArrow
      content="This is the tooltip content"
      contentProps={{
        style: {
          ["--tooltip-bg" as string]: "tomato",
        },
      }}
    >
      <Button variant="outline" size="sm">
        Hover me
      </Button>
    </Tooltip>
  );
};
