import * as Editable from "./editable";

export const App = () => {
  return (
    <Editable.Root
      defaultValue="Double click to edit"
      activationMode="dblclick"
    >
      <Editable.Preview />
      <Editable.Input />
    </Editable.Root>
  );
};
