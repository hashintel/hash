import * as Field from "../field/field";
import { Input } from "./input";

export const App = () => {
  return (
    <Field.Root>
      <Field.Label>Email</Field.Label>
      <Input placeholder="Enter your email" />
      <Field.HelperText>
        Your email will not be shared with anyone else.
      </Field.HelperText>
    </Field.Root>
  );
};
