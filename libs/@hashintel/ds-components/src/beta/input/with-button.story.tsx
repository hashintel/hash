import { Button } from "../button";
import { Group } from "../group";
import { Input } from "../input";

export const App = () => {
  return (
    <Group attached width="full">
      <Input placeholder="Enter your email" />
      <Button variant="outline" colorPalette="gray">
        Submit
      </Button>
    </Group>
  );
};
