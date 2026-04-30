import * as NumberInput from "./number-input";

export const App = () => {
  return (
    <NumberInput.Root defaultValue="42" disabled>
      <NumberInput.Control />
      <NumberInput.Input />
    </NumberInput.Root>
  );
};
