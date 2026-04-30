import { Link } from "../link/link";
import * as Checkbox from "./checkbox";

export const App = () => {
  return (
    <Checkbox.Root>
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label>
        I agree to the{" "}
        <Link href="https:/park-ui.com" target="_blank">
          terms and conditions
        </Link>
      </Checkbox.Label>
    </Checkbox.Root>
  );
};
