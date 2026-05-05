import * as Field from "../field/field";
import { Textarea } from "./textarea";

export const App = () => {
  return (
    <Field.Root required>
      <Field.Label>
        Comment <Field.RequiredIndicator />
      </Field.Label>
      <Textarea placeholder="Enter your comment" />
    </Field.Root>
  );
};
