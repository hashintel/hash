import * as NumberInput from "./number-input";

export const App = () => {
  return (
    <NumberInput.Root defaultValue="2" step={3}>
      <NumberInput.Control />
      <NumberInput.Input />
    </NumberInput.Root>
  );
};
