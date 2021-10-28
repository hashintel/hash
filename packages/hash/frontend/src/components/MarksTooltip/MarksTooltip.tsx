import React, { FormEvent, useMemo, useRef, useState } from "react";
import { tw } from "twind";
import IconDropdown from "../Icons/IconDropdown";

interface MarksTooltipProps {
  activeMarks: { name: string; attrs?: Record<string, string> }[];
  toggleMark: (name: string, attrs?: Record<string, string>) => void;
  updateLink: (href: string) => void;
  selectionHeight: number;
  closeTooltip: () => void;
}

const marks = [
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

export const MarksTooltip: React.VFC<MarksTooltipProps> = ({
  activeMarks,
  toggleMark,
  selectionHeight,
  updateLink,
  closeTooltip,
}) => {
  const [linkHref, setLinkHref] = useState("");
  const linkModalRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const defaultLinkMarkHref = useMemo(
    () => activeMarks.find(({ name }) => name === "link")?.attrs?.href,
    [activeMarks]
  );

  const getMarkBtnClass = (name: string) => {
    const isActive = activeMarks.find((mark) => mark.name === name);

    if (isActive) {
      if (name === "link") {
        return "text-blue-500";
      }

      return "bg-blue-500 text-white";
    } else {
      return "bg-white text-black";
    }
  };

  const handleToggleMark = (name: string) => {
    if (name === "link") {
      if (!linkModalRef.current || !linkInputRef.current) return;
      linkModalRef.current.classList.toggle("hidden");
      if (!linkModalRef.current.classList.contains("hidden")) {
        linkInputRef.current.focus();
      }
    } else {
      toggleMark(name);
    }
  };

  const handleUpdateLink = (evt: FormEvent) => {
    evt.preventDefault();
    updateLink(linkHref);
    closeTooltip();
  };

  const handleRemoveLink = () => {
    toggleMark("link");
    closeTooltip();
  };

  if (!linkHref && defaultLinkMarkHref) {
    setLinkHref(defaultLinkMarkHref);
  }

  return (
    <div
      className={tw`absolute z-10 -translate-y-full -mt-1 left-1/2 -translate-x-1/2 shadow-lg`}
    >
      <div className={tw`flex bg-white`}>
        {marks.map(({ name, text }) => (
          <button
            className={tw`flex items-center ${getMarkBtnClass(
              name
            )} py-1 px-4 border-r-1 border-gray-300`}
            key={name}
            onClick={() => handleToggleMark(name)}
            type="button"
          >
            {text}
            {name === "link" && <IconDropdown className={tw`ml-2`} />}
          </button>
        ))}
      </div>

      <div
        style={{ marginTop: `calc(${selectionHeight}px + 0.5rem)` }}
        className={tw`absolute left-0 top-full shadow-md border-1 py-4 bg-white hidden rounded-md`}
        ref={linkModalRef}
      >
        <div className={tw`flex px-4 mb-2`}>
          <form onSubmit={handleUpdateLink}>
            <input
              className={tw`block w-full px-2 py-1 text-sm border-1 outline-none rounded-sm focus:outline-none focus:border-gray-500`}
              type="text"
              onChange={(evt) => setLinkHref(evt.target.value)}
              value={linkHref}
              ref={linkInputRef}
              placeholder="Paste link"
            />
          </form>
        </div>
        {defaultLinkMarkHref && (
          <ul className={tw`text-sm text-gray-700`}>
            <li>
              <button
                className={tw`hover:bg-gray-200 text-left w-full px-4 py-0.5`}
                onClick={handleRemoveLink}
                type="button"
              >
                Remove link
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
};
