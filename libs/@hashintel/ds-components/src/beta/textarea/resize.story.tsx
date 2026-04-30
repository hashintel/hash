import { Stack } from "@hashintel/ds-helpers/jsx";

import { Textarea } from "./textarea";

export const App = () => {
  return (
    <Stack gap="4" maxW="50%">
      <Textarea resize="none" placeholder="none" />
      <Textarea resize="vertical" placeholder="vertical" />
      <Textarea resize="horizontal" placeholder="horizontal" />
      <Textarea resize="both" placeholder="both" />
    </Stack>
  );
};
