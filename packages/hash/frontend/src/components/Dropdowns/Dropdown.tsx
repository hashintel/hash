import { Listbox, Transition } from "@headlessui/react";
import { Fragment, ReactElement, VoidFunctionComponent } from "react";
import { tw } from "twind";

import { DropdownIcon } from "../../shared/icons";

type DropdownValue = string | number | undefined;

/** @todo: refactor as mentioned in https://github.com/hashintel/dev/pull/206#discussion_r723188550 */
export type DropdownProps = {
  onChange: (value?: DropdownValue) => void;
  options: {
    extendedLabel?: ReactElement | string;
    label: string;
    value: DropdownValue;
  }[];
  value?: DropdownValue;
};

/**
 * Needs the styling sorting out
 * @see https://headlessui.dev/react/listbox for the example
 */
export const Dropdown: VoidFunctionComponent<DropdownProps> = ({
  onChange,
  options,
  value,
}) => {
  const selected = options.find((option) => option.value === value);

  return (
    <Listbox value={selected} onChange={(option) => onChange(option?.value)}>
      <div className={tw`relative mt-1`}>
        <Listbox.Button
          className={tw`relative w-40 h-6 py-2 pl-3 pr-10 text-left bg-white rounded-lg shadow-md cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-opacity-75 focus-visible:ring-white focus-visible:ring-offset-orange-300 focus-visible:ring-offset-2 focus-visible:border-indigo-500 sm:text-sm`}
        >
          <span className={tw`block truncate`}>{selected?.label}</span>
          <span
            className={tw`absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none`}
          >
            <DropdownIcon />
          </span>
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave={tw`transition ease-in duration-100`}
          leaveFrom={tw`opacity-100`}
          leaveTo={tw`opacity-0`}
        >
          <Listbox.Options
            className={tw`absolute w-60 py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm`}
          >
            {options.map(({ extendedLabel, label, value: optionValue }) => (
              <Listbox.Option
                key={optionValue}
                className={({ active }) =>
                  tw`${active ? "text-amber-900 bg-amber-100" : "text-gray-900"}
                          cursor-default select-none relative py-2 pl-10 pr-4`
                }
                value={optionValue}
              >
                {({ selected: isSelected }) => (
                  <span
                    className={tw`${
                      isSelected ? "font-medium" : "font-normal"
                    } block truncate`}
                  >
                    {extendedLabel ?? label}
                  </span>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
};
