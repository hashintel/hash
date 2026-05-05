import { Button } from "../button/button";
import { Group } from "./group";

export const App = () => {
  return (
    <Group orientation="vertical" attached>
      <Button variant="outline">First</Button>
      <Button variant="outline">Second</Button>
      <Button variant="outline">Third</Button>
    </Group>
  );
};
