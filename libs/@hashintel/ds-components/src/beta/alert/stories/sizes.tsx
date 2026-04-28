import { Stack } from "@hashintel/ds-helpers/jsx";

import { Alert } from "../alert";

export const App = () => {
  const sizes = ["md", "lg"] as const;

  return (
    <Stack gap="4">
      {sizes.map((size) => (
        <Alert.Root key={size} size={size}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>This is a title</Alert.Title>
            <Alert.Description>This is a description</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ))}
    </Stack>
  );
};
