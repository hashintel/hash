import * as Avatar from "./avatar";

export const App = () => {
  return (
    <Avatar.Root size="lg">
      <Avatar.Image src="https://avatars.githubusercontent.com/u/1846056?v=4" />
      <Avatar.Fallback name="Christian Busch" />
    </Avatar.Root>
  );
};
