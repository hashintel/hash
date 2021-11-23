import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useKey } from "rooks";
import { tw } from "twind";

import { useGetAccounts } from "../hooks/useGetAccounts";
import { fuzzySearchBy } from "./fuzzySearchBy";

export interface MentionSuggesterProps {
  search?: string;
  onChange(entityId: string, title: string): void;
  className?: string;
}

/**
 *
 * @todo merge this with BlockSuggester
 */
export const MentionSuggester: React.VFC<MentionSuggesterProps> = ({
  search = "",
  onChange,
  className,
}) => {
  const { data, loading } = useGetAccounts();

  const options = useMemo(() => {
    return fuzzySearchBy(data, search, (option) =>
      [option.shortname, option.name].map((str) => str ?? "").join(" "),
    );
  }, [search, data]);

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
      onChange(option.entityId, option.name);
    }
  });

  return (
    <ul
      className={tw`absolute z-10 w-96 max-h-60 overflow-auto border border-gray-100 rounded-lg shadow-md ${
        className ?? ""
      }`}
    >
      {loading && <li>Loading...</li>}
      {options.map((option, index) => {
        const title = option.name || option.shortname;
        return (
          /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
          <li
            ref={index === selectedIndex ? selectedRef : undefined}
            key={`${option.shortname}`}
            className={tw`flex items-center border border-gray-100 ${
              index !== selectedIndex ? "bg-gray-50" : "bg-gray-100"
            } hover:bg-gray-100 px-2 py-1`}
            onClick={() => onChange(option.entityId, option.name)}
          >
            <div
              className={tw`w-6 h-6 flex items-center justify-center text-sm rounded-full bg-gray-200 mr-2`}
            >
              {title?.[0]?.toUpperCase()}
            </div>
            <p className={tw`text-sm`}>{title}</p>
          </li>
        );
      })}
    </ul>
  );
};
