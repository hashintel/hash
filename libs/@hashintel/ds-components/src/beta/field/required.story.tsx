import { Input } from "../input/input";
import * as Field from "./field";

export const App = () => {
  return (
    <Field.Root required>
      <Field.Label>
        Email
        <Field.RequiredIndicator />
      </Field.Label>
      <Input placeholder="me@example.com" />
    </Field.Root>
  );
};
