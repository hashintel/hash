import React from "react";
import { tw } from "twind";
import { DropdownIcon } from "../../../shared/icons";

interface MarksTooltipProps {
  activeMarks: { name: string; attrs?: Record<string, string> }[];
  toggleMark: (name: string, attrs?: Record<string, string>) => void;
  focusEditorView: () => void;
  openLinkModal: () => void;
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
  focusEditorView,
  openLinkModal,
}) => {
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
      openLinkModal();
    } else {
      toggleMark(name);
    }

    focusEditorView();
  };

  return (
    <div
      className={tw`absolute z-10 -translate-y-full -mt-1 left-1/2 -translate-x-1/2 shadow-lg`}
    >
      <div className={tw`flex bg-white`}>
        {marks.map(({ name, text }) => (
          <button
            className={tw`flex items-center ${getMarkBtnClass(
              name,
            )} bg-transparent border-0 cursor-pointer py-1 px-4 border-r-1 last:border-r-0 border-gray-300`}
            key={name}
            onClick={() => handleToggleMark(name)}
            type="button"
          >
            {text}
            {name === "link" && <DropdownIcon className={tw`ml-2`} />}
          </button>
        ))}
      </div>
    </div>
  );
};
