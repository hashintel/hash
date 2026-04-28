import { Stack } from "@hashintel/ds-helpers/jsx";

import { Link } from "./link";

export const App = () => {
  return (
    <Stack gap="4" align="start">
      <Link href="https://park-ui.com" variant="underline">
        Visit Park UI
      </Link>
      <Link href="https://park-ui.com" variant="plain">
        Visit Park UI
      </Link>
    </Stack>
  );
};
