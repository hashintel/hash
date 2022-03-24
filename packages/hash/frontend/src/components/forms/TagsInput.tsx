import React, { useRef } from "react";
import { tw } from "twind";

type TagsInputProps = {
  minHeight?: number;
  tags: string[];
  setTags: (tags: string[]) => void;
  placeholder: string;
  isValid?: (text: string) => boolean;
  delimiters?: string[];
};

export const TagsInput: React.VFC<TagsInputProps> = ({
  minHeight,
  tags,
  setTags,
  placeholder,
  isValid,
  delimiters = [],
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (evt: React.KeyboardEvent<HTMLInputElement>) => {
    if (!inputRef.current) return;
    const text = inputRef.current.value;

    if ([...delimiters, "Enter"].includes(evt.key)) {
      evt.preventDefault();
      if (
        text &&
        (isValid === undefined || isValid(text)) &&
        !tags.includes(text)
      ) {
        setTags([...tags, text]);
        inputRef.current.value = "";
      }
    } else if (evt.key === "Backspace" || evt.key === "Delete") {
      if (inputRef.current.value === "" && tags.length > 0) {
        evt.preventDefault();
        const tagToRemove = tags[tags.length - 1]!;
        setTags(tags.slice(0, -1));
        inputRef.current.value = tagToRemove;
      }
    }
  };

  const handleBlur = () => {
    if (!inputRef.current) return;
    const inputValue = inputRef.current?.value;
    if (
      inputValue &&
      !tags.includes(inputValue) &&
      (isValid === undefined || isValid(inputValue))
    ) {
      setTags([...tags, inputValue]);
      inputRef.current.value = "";
    }
  };

  const handleRemove = (tagToRemove: string) => {
    const newTags = tags.filter((tag) => tag !== tagToRemove);
    setTags(newTags);
  };

  return (
    <div
      style={{ minHeight: minHeight ?? 48 }}
      className={tw`flex flex-wrap bg-white items-start rounded-lg p-2 border(1 gray-300 hover:gray-400 focus-within:gray-500)`}
      onClick={() => inputRef.current?.focus()}
      onKeyDown={(evt) => {
        if (evt.key === "Enter") {
          inputRef.current?.focus();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <ul className={tw`flex flex-wrap items-start`}>
        {tags.map((tag) => (
          <li
            key={tag}
            className={tw`relative flex flex-wrap bg-gray-300 text-sm pl-3 pr-6 py-1 rounded-2xl mr-1 mb-1`}
          >
            {tag}{" "}
            <button
              type="button"
              onClick={() => handleRemove(tag)}
              className={tw`absolute right-0 top-0 bottom-0 pr-2 pl-0.5 focus:outline-none`}
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
      <input
        type="text"
        ref={inputRef}
        className={tw`flex-1 focus:outline-none bg-transparent text-sm py-1 px-1`}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </div>
  );
};
