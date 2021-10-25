import React, { useEffect, useRef, useState } from "react";
import { tw } from "twind";

interface MarksToolTipProps {
  marks: { name: string; attrs?: Record<string, string> }[];
  toggleMark: (name: string, attrs?: Record<string, string>) => void;
  updateLink: (href: string) => void
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
  space,
  updateLink
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [href, setHref] = useState("");

  useEffect(() => {
    console.log("marks ==> ", marks);
    const markLink =
      marks.find(({ name }) => name == "link")?.attrs?.href ?? "";
    if (markLink) {
      setHref(markLink);
    }
  }, [marks]);

  const handleToggleMark = (name: string) => {
    if (name == "link") {
      if (!ref.current) return;

      if (ref.current.classList.contains("hidden")) {
        ref.current.classList.remove("hidden");
      }
      return;
    }
    toggleMark(name);
  };

  // this doesn't remove the mark, come up with a better
  // implementation for this
  const removeMark = (name: string) => {
    toggleMark(name);
  };

  return (
    <>
      <div
        className={tw`absolute z-10 -top-10 left-1/2 -translate-x-1/2 shadow-lg`}
      >
        <div className={tw`flex`}>
          {items.map(({ name, text }) => (
            <button
              className={tw`flex ${
                marks.find((mark) => mark.name == name)
                  ? "bg-blue-500 text-white"
                  : "bg-white text-black"
              } py-1 px-4 border-r-1 border-gray-300`}
              key={name}
              onClick={() => handleToggleMark(name)}
            >
              {text}
            </button>
          ))}
        </div>

        <div
          style={{ marginTop: `calc(${space}px + 2rem)` }}
          className={tw`absolute left-0 top-full shadow-md border-1 p-4 bg-white hidden rounded-md`}
          ref={ref}
        >
          <div className={tw`flex mb-2`}>
            <form
              onSubmit={(evt) => {
                evt.preventDefault();
                console.log("href==> ", href);
                updateLink(href)
                // toggleMark("link", { href });
                setHref("");
              }}
            >
              <input
                className={tw`border-1 mr-2`}
                type="text"
                onChange={(evt) => setHref(evt.target.value)}
                value={href}
                onFocus={(evt) => evt.preventDefault()}
              />
            </form>
          </div>
          <ul className={tw`text-sm`}>
            <li>
              <button onClick={() => removeMark("link")}>Copy link</button>
            </li>
            <li>
              <button onClick={() => removeMark("link")}>Remove link</button>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
};
