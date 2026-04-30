import * as Switch from "./switch";

export const App = () => {
  return (
    <Switch.Root invalid>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.Label>Label</Switch.Label>
      <Switch.HiddenInput />
    </Switch.Root>
  );
};
