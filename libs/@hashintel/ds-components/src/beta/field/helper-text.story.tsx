import * as Field from "../field";
import { Input } from "../input";

export const App = () => {
  return (
    <Field.Root>
      <Field.Label>Email</Field.Label>
      <Input placeholder="me@example.com" />
      <Field.HelperText>This is a helper text</Field.HelperText>
    </Field.Root>
  );
};
