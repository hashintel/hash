import {
  type Item,
  type ItemOrGroup,
} from "../../util/SelectableList/selectable-list";

import type { TextInput } from "../TextInput/text-input";

export type AutocompleteItem<TValue extends string = string> = {
  value: TValue;
  text: string;
  disabled?: boolean;
  variant?: "default" | "checkbox";
} & Pick<Item, "selectedStyle">;

export const Combobox = <TValue extends string>(
  _props: Omit<React.ComponentProps<typeof TextInput>, "autocomplete"> & {
    items?: Array<ItemOrGroup<AutocompleteItem<TValue>>>;
    renderItem?: (value: TValue) => React.ReactNode;
    renderSelectedItem?: (value: TValue) => React.ReactNode;
    onChangeInput?: (value: string) => void;
    filterAlgorithm?:
      | "contains"
      | "startsWith"
      | "none"
      | ((input: string, text: string, value: string) => boolean);
    allowCustomValue?:
      | boolean
      | {
          alwaysShowOption?: boolean; // if left undefined shows the option when the input does not match an option
          renderOption?: (input: string) => React.ReactNode; // customize how the option looks
        };
  },
) => {
  return <div />;
};
