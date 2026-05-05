import { HStack } from "@hashintel/ds-helpers/jsx";

import * as RadioCardGroup from "./radio-card-group";

const items = [
  { value: "react", title: "React" },
  { value: "solid", title: "Solid" },
  { value: "vue", title: "Vue" },
];

export const App = () => {
  return (
    <RadioCardGroup.Root defaultValue="react">
      <RadioCardGroup.Label>Select framework</RadioCardGroup.Label>
      <HStack alignItems="stretch">
        {items.map((item) => (
          <RadioCardGroup.Item key={item.value} value={item.value}>
            <RadioCardGroup.ItemHiddenInput />
            <RadioCardGroup.ItemText>{item.title}</RadioCardGroup.ItemText>
            <RadioCardGroup.ItemControl />
          </RadioCardGroup.Item>
        ))}
      </HStack>
    </RadioCardGroup.Root>
  );
};
