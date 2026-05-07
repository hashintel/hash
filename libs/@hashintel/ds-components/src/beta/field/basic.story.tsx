import * as Field from "../field";
import { Input } from "../input";

export const App = () => {
  return (
    <Field.Root>
      <Field.Label>Email</Field.Label>
      <Input placeholder="Enter your email" />
    </Field.Root>
  );
};
