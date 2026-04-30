import * as RadioGroup from "./radio-group";

const items = [
  { label: "React", value: "react" },
  { label: "Solid", value: "solid" },
  { label: "Vue", value: "vue" },
  { label: "Svelte", value: "svelte", disabled: true },
];

export const App = () => {
  return (
    <RadioGroup.Root defaultValue="react">
      {items.map((item) => (
        <RadioGroup.Item
          key={item.value}
          value={item.value}
          disabled={item.disabled}
        >
          <RadioGroup.ItemHiddenInput />
          <RadioGroup.ItemControl />
          <RadioGroup.ItemText>{item.label}</RadioGroup.ItemText>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
};
