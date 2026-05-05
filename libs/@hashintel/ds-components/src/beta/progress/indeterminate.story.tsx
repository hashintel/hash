import * as Progress from "./progress";

export const App = () => {
  return (
    <Progress.Root value={null}>
      <Progress.Track>
        <Progress.Range />
      </Progress.Track>
    </Progress.Root>
  );
};
