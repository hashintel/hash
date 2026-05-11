import * as Field from "../field";
import { Input } from "../input";

export const App = () => {
  return (
    <Field.Root required>
      <Field.Label>
        Email <Field.RequiredIndicator />
      </Field.Label>
      <Input placeholder="Enter your email" />
    </Field.Root>
  );
};
