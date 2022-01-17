import React, { ReactElement, useEffect, useRef, useState } from "react";
import { useKey } from "rooks";
import { tw } from "twind";
import { SpinnerIcon } from "../../../components/icons";

export interface SuggesterProps<T> {
  className?: string;
  options: T[];
  renderItem(item: T): ReactElement;
  onChange(item: T): void;
  loading?: boolean;
  itemKey(option: T): string;
}

/**
 * used to present list of suggestions to choose from to the user
 */
export const Suggester = <T,>({
  onChange,
  className,
  options,
  renderItem,
  loading,
  itemKey,
}: SuggesterProps<T>): ReactElement => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // reset selected index if it exceeds the options available
  if (selectedIndex >= options.length) {
    setSelectedIndex(options.length - 1);
  }

  // enable cyclic arrow-key navigation
  useKey(["ArrowUp", "ArrowDown"], (event) => {
    event.preventDefault();
    let index = selectedIndex + (event.key === "ArrowUp" ? -1 : 1);
    index += options.length;
    index %= options.length;
    setSelectedIndex(index);
  });

  // scroll the selected option into view
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(
    () => selectedRef.current?.scrollIntoView({ block: "nearest" }),
    [selectedIndex],
  );

  useKey(["Enter"], (event) => {
    event.preventDefault();

    const option = options[selectedIndex];
    if (option) {
      onChange(option);
    }
  });

  return (
    <ul
      className={tw`absolute z-10 w-96 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md ${
        className ?? ""
      }`}
    >
      {loading && (
        <li className={tw`flex justify-center py-1`}>
          <SpinnerIcon className={tw`h-3 w-3 text-gray-500 animate-spin`} />
        </li>
      )}
      {options.map((option, index) => (
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
        <li
          ref={index === selectedIndex ? selectedRef : undefined}
          key={itemKey(option)}
          className={tw`flex border border-gray-100 ${
            index !== selectedIndex ? "bg-gray-50" : "bg-gray-100"
          } hover:bg-gray-100`}
          onClick={() => onChange(option)}
        >
          {renderItem(option)}
        </li>
      ))}
    </ul>
  );
};
