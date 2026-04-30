import { HStack, Stack } from "@hashintel/ds-helpers/jsx";

import * as RadioCardGroup from "./radio-card-group";

const items = [
  { value: "react", title: "React" },
  { value: "solid", title: "Solid" },
  { value: "vue", title: "Vue" },
];

export const App = () => {
  const variants = ["solid", "surface", "subtle", "outline"] as const;
  return (
    <Stack gap="4">
      {variants.map((variant) => (
        <RadioCardGroup.Root
          key={variant}
          variant={variant}
          defaultValue="react"
        >
          <HStack>
            {items.map((item) => (
              <RadioCardGroup.Item key={item.value} value={item.value}>
                <RadioCardGroup.ItemHiddenInput />
                <RadioCardGroup.ItemText>{item.title}</RadioCardGroup.ItemText>
                <RadioCardGroup.ItemControl />
              </RadioCardGroup.Item>
            ))}
          </HStack>
        </RadioCardGroup.Root>
      ))}
    </Stack>
  );
};
