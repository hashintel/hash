import { Input } from "../input/input";
import * as Field from "./field";

export const App = () => {
  return (
    <Field.Root disabled>
      <Field.Label>Email</Field.Label>
      <Input placeholder="Enter your email" />
      <Field.HelperText>This is a helper text</Field.HelperText>
    </Field.Root>
  );
};
