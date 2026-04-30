import * as NumberInput from "./number-input";

export const App = () => {
  return (
    <NumberInput.Root defaultValue="42" allowMouseWheel>
      <NumberInput.Control />
      <NumberInput.Input />
    </NumberInput.Root>
  );
};
