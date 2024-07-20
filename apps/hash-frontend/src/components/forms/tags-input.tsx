import type { FunctionComponent, KeyboardEvent , useRef } from "react";
import { Box } from "@mui/material";

interface TagsInputProps {
  minHeight?: number;
  tags: string[];
  setTags: (tags: string[]) => void;
  placeholder: string;
  isValid?: (text: string) => boolean;
  delimiters?: string[];
}

export const TagsInput: FunctionComponent<TagsInputProps> = ({
  minHeight,
  tags,
  setTags,
  placeholder,
  isValid,
  delimiters = [],
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!inputRef.current) {
      return;
    }
    const text = inputRef.current.value;

    if ([...delimiters, "Enter"].includes(event.key)) {
      event.preventDefault();
      if (
        text &&
        (isValid === undefined || isValid(text)) &&
        !tags.includes(text)
      ) {
        setTags([...tags, text]);
        inputRef.current.value = "";
      }
    } else if (event.key === "Backspace" || event.key === "Delete") {
      if (inputRef.current.value === "" && tags.length > 0) {
        event.preventDefault();
        const tagToRemove = tags[tags.length - 1]!;

        setTags(tags.slice(0, -1));
        inputRef.current.value = tagToRemove;
      }
    }
  };

  const handleBlur = () => {
    if (!inputRef.current) {
      return;
    }
    const inputValue = inputRef.current.value;

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
    <Box
      role={"button"}
      tabIndex={0}
      sx={{
        alignItems: "flex-start",
        backgroundColor: "#ffffff",
        border: "1px solid #D1D5DB",
        borderRadius: "0.5rem",
        display: "flex",
        flexWrap: "wrap",
        minHeight: minHeight ?? 48,
        padding: "0.5rem",

        "&:hover": {
          borderColor: "#9CA3AF",
        },

        "&:focus-within": {
          borderColor: "#6B7280",
        },
      }}
      onClick={() => inputRef.current?.focus()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          inputRef.current?.focus();
        }
      }}
    >
      <ul
        style={{
          alignItems: "flex-start",
          display: "flex",
          flexWrap: "wrap",
        }}
      >
        {tags.map((tag) => (
          <li
            key={tag}
            style={{
              backgroundColor: "#D1D5DB",
              borderRadius: "1rem",
              display: "flex",
              flexWrap: "wrap",
              fontSize: "0.875rem",
              lineHeight: "1.25rem",
              marginBottom: "0.25rem",
              marginRight: "0.25rem",
              paddingBottom: "0.25rem",
              paddingLeft: "0.75rem",
              paddingRight: "1.5rem",
              paddingTop: "0.25rem",
              position: "relative",
            }}
          >
            {tag}{" "}
            <Box
              component={"button"}
              type={"button"}
              sx={{
                backgroundColor: "transparent",
                borderStyle: "none",
                bottom: "0",
                cursor: "pointer",
                paddingLeft: "0.125rem",
                paddingRight: "0.5rem",
                position: "absolute",
                right: "0",
                top: "0",

                "&:focus": {
                  outline: "none",
                },
              }}
              onClick={() => { handleRemove(tag); }}
            >
              &times;
            </Box>
          </li>
        ))}
      </ul>
      <Box
        component={"input"}
        type={"text"}
        ref={inputRef}
        placeholder={placeholder}
        sx={{
          backgroundColor: "transparent",
          borderStyle: "none",
          flex: "1 1 0%",
          fontSize: "0.875rem",
          lineHeight: "1.25rem",
          paddingBottom: "0.25rem",
          paddingLeft: "0.25rem",
          paddingRight: "0.25rem",
          paddingTop: "0.25rem",

          "&:focus": {
            outline: "none",
          },
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </Box>
  );
};
