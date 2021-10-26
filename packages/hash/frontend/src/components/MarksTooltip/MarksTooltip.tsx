import React, { useEffect, useMemo, useRef, useState } from "react";
import { tw } from "twind";
import IconDropdown from "../Icons/IconDropdown";

interface MarksToolTipProps {
  activeMarks: { name: string; attrs?: Record<string, string> }[];
  toggleMark: (name: string, attrs?: Record<string, string>) => void;
  updateLink: (href: string) => void;
  space: number;
}

const items = [
  {
    name: "strong",
    text: "B",
  },
  {
    name: "em",
    text: "I",
  },
  {
    name: "underlined",
    text: "U",
  },
  {
    name: "link",
    text: "Link",
  },
];

export const MarksToolTip: React.VFC<MarksToolTipProps> = ({
  activeMarks,
  toggleMark,
  space,
  updateLink,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [linkHref, setLinkHref] = useState("");

  const defaultLinkMarkHref = useMemo(
    () => activeMarks.find(({ name }) => name == "link")?.attrs?.href,
    [activeMarks]
  );

  const handleToggleMark = (name: string) => {
    if (name == "link") {
      if (!ref.current) return;
      ref.current.classList.toggle("hidden");
      return;
    }
    toggleMark(name);
  };

  const removeMark = (name: string) => {
    toggleMark(name);
  };

  const getBtnClass = (name: string) => {
    const isActive = activeMarks.find((mark) => mark.name == name);

    if (isActive) {
      if (name == "link") {
        return "text-blue-500";
      }

      return "bg-blue-500 text-white";
    } else {
      return "bg-white text-black";
    }
  };

  if (!linkHref && defaultLinkMarkHref) {
    return setLinkHref(defaultLinkMarkHref);
  }

  return (
    <>
      <div
        className={tw`absolute z-10 -top-10 left-1/2 -translate-x-1/2 shadow-lg`}
      >
        <div className={tw`flex`}>
          {items.map(({ name, text }) => (
            <button
              className={tw`flex items-center ${getBtnClass(
                name
              )} py-1 px-4 border-r-1 border-gray-300`}
              key={name}
              onClick={() => handleToggleMark(name)}
            >
              {text}
              {name == "link" && <IconDropdown className={tw`ml-2`} />}
            </button>
          ))}
        </div>

        <div
          style={{ marginTop: `calc(${space}px + 2rem)` }}
          className={tw`absolute left-0 top-full shadow-md border-1 py-4 bg-white hidden rounded-md`}
          ref={ref}
        >
          <div className={tw`flex px-4 mb-2`}>
            <form
              onSubmit={(evt) => {
                evt.preventDefault();
                updateLink(linkHref);
              }}
            >
              <input
                className={tw`block w-full px-2 py-1 text-sm border-1 outline-none rounded-sm focus:outline-none focus:border-gray-500`}
                type="text"
                onChange={(evt) => setLinkHref(evt.target.value)}
                value={linkHref}
              />
            </form>
          </div>
          <ul className={tw`text-sm text-gray-700`}>
            <li>
              <button
                className={tw`hover:bg-gray-200 text-left w-full px-4 py-0.5`}
                onClick={() => removeMark("link")}
              >
                Copy link
              </button>
            </li>
            <li>
              <button
                className={tw`hover:bg-gray-200 text-left w-full px-4 py-0.5`}
                onClick={() => removeMark("link")}
              >
                Remove link
              </button>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
};
