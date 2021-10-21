import React from "react";
import { tw } from "twind";

interface MarksToolTipProps {
  marks: Set<string>;
  toggleMark: (name: string) => void;
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
  marks,
  toggleMark,
}) => {
  return (
    <>
      <div
        className={tw`absolute z-10 -top-10 left-1/2 -translate-x-1/2 shadow-md`}
      >
        <div className={tw`flex`}>
          {items.map(({ name, text }) => (
            <button
              className={tw`${
                marks.has(name)
                  ? "bg-blue-500 text-white"
                  : "bg-white text-black"
              } py-1 w-10 border-1 border-gray-300 `}
              key={name}
              onClick={() => toggleMark(name)}
            >
              {text}
            </button>
          ))}
        </div>
        <div
          className={tw`absolute -right-full top-20 shadow-md border-1 p-2 bg-white`}
        >
          <input className={tw`border-1`} type="text" />
        </div>
      </div>
    </>
  );
};
