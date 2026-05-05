import * as Progress from "./progress";

export const App = () => {
  return (
    <Progress.Root defaultValue={42}>
      <Progress.Track>
        <Progress.Range />
      </Progress.Track>
    </Progress.Root>
  );
};
